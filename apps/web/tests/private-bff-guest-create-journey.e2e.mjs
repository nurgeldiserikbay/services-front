import assert from 'node:assert/strict';
import {createHmac,randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {sealGuestSession} from '../src/lib/guest-session-core.mjs';
import {sealGuestRequestAccess} from '../src/lib/guest-request-access-core.mjs';

// Live HTTP journey: an independently verified TEST fixture, not OTP bypass in
// application code. All keys and rows are unique to disposable CI PostgreSQL.
assert.equal(process.env.CI,'true');
assert.ok(process.env.RUNNER_TEMP);
const {Client}=createRequire(new URL('../../../services-back/package.json',import.meta.url))('pg');
const secret=async name=>{
 const value=Buffer.from((await readFile(join(process.env.RUNNER_TEMP,name),'utf8')).trim(),'base64');
 assert.equal(value.length,32);
 return value;
};
const webKey=await secret('services-private-bff-guest-key');
const backendKey=await secret('services-guest-capability-hmac-key');
const base=process.env.PRIVATE_BFF_TEST_BASE_URL??'http://127.0.0.1:3001';
const offerId='10000000-0000-4000-8000-000000000008'; // existing seeded CI-only company offer
const contactId=randomUUID();
const proofId=randomUUID();
const createCapability=randomBytes(32).toString('base64url');
const idempotencyKey=randomUUID();
const sealed=sealGuestSession(webKey,createCapability,600);
const cookie='__Host-services_guest_create='+sealed.cookie;
const csrf=sealed.csrf;
const hash=createHmac('sha256',backendKey)
 .update('guest-capability:v1\0').update('CREATE_REQUEST\0').update(createCapability).digest('hex');
const db=new Client({connectionString:process.env.DATABASE_URL});
let contactCreated=false;
let createdId=null;
const request=async csrfToken=>fetch(new URL('/api/guest-requests',base),{
 method:'POST',redirect:'manual',signal:AbortSignal.timeout(8000),
 headers:{
  'Sec-Fetch-Site':'same-origin',Origin:'https://services.example.test',
  'Content-Type':'application/json',Cookie:cookie,
 },
 body:JSON.stringify({
  csrf_token:csrfToken,idempotency_key:idempotencyKey,
  service_offer_id:offerId,consent_to_contact:true,
  note:'CI-only private note',
 }),
});
try{
 await db.connect();
 await db.query("INSERT INTO guest_contacts(id,channel,encrypted_value,digest,verified_at,expires_at) VALUES($1,'email','fixture',$2,now(),now()+interval '1 day')",
  [contactId,'guest-create-ci-'+randomUUID()]);
 contactCreated=true;
 await db.query("INSERT INTO guest_capabilities(id,guest_contact_id,scope,token_hash,expires_at) VALUES($1,$2,'CREATE_REQUEST',$3,now()+interval '15 minutes')",
  [proofId,contactId,hash]);

 const bad=await request(randomBytes(32).toString('base64url'));
 assert.equal(bad.status,503,'mismatched CSRF must not create a request');
 assert.equal(bad.headers.get('set-cookie'),null);
 const countBefore=await db.query('SELECT count(*)::int AS n FROM service_requests WHERE guest_contact_id=$1',[contactId]);
 assert.equal(countBefore.rows[0].n,0);

 const first=await request(csrf);
 assert.equal(first.status,201,'verified test proof must create exactly one request');
 assert.match(first.headers.get('cache-control')??'',/no-store/i);
 assert.match(first.headers.get('referrer-policy')??'',/no-referrer/i);
 assert.match(first.headers.get('x-robots-tag')??'',/noindex/i);
 const receipt=await first.json();
 assert.deepEqual(Object.keys(receipt).sort(),['id','state']);
 assert.match(receipt.id,/^[0-9a-f-]{36}$/);
 assert.equal(receipt.state,'pending');
 createdId=receipt.id;
 assert.ok(!JSON.stringify(receipt).includes(createCapability));
 const cookies=first.headers.getSetCookie();
 const privateCookie=cookies.find(x=>x.startsWith('__Host-services_guest_request='));
 const cleared=cookies.find(x=>x.startsWith('__Host-services_guest_create='));
 assert.ok(privateCookie,'request-specific HttpOnly cookie required');
 assert.match(privateCookie,/httponly/i);
 assert.match(privateCookie,/secure/i);
 assert.match(privateCookie,/samesite=strict/i);
 assert.ok(cleared&&/max-age=0/i.test(cleared),'create session must be cleared');
 assert.ok(!cookies.some(x=>x.includes(createCapability)),'CREATE_REQUEST bearer must not leak');
 const access=privateCookie.split(';')[0];

 const status=await fetch(new URL('/api/guest-requests/'+createdId+'/status',base),{
  headers:{'Sec-Fetch-Site':'same-origin',Cookie:access},
  redirect:'manual',signal:AbortSignal.timeout(8000),
 });
 assert.equal(status.status,200,'new READ_CANCEL cookie must work');
 const state=await status.json();
 assert.deepEqual(Object.keys(state).sort(),['created_at','id','service_offer_id','state','version']);
 assert.equal(state.id,createdId);
 assert.equal(state.service_offer_id,offerId);
 assert.equal(state.state,'pending');
 assert.equal(state.version,1);
 assert.ok(!JSON.stringify(state).includes('CI-only private note'));

 // The newly issued READ_CANCEL proof is scoped to this request. Exercise
 // negative permissions against the same committed CI-created row so a
 // successful request creation cannot accidentally widen subsequent reads.
 const statusWith=async(requestId,headerCookie,fetchSite='same-origin')=>fetch(
  new URL('/api/guest-requests/'+requestId+'/status',base),{
   headers:{'Sec-Fetch-Site':fetchSite,...(headerCookie?{Cookie:headerCookie}:{})},
   redirect:'manual',signal:AbortSignal.timeout(8000),
  });
 const denyStatus=async(response,label)=>{
  assert.equal(response.status,404,label+' must not access private guest status');
  assert.match(response.headers.get('cache-control')??'',/no-store/i);
  assert.match(response.headers.get('x-robots-tag')??'',/noindex/i);
  assert.equal(response.headers.get('set-cookie'),null);
  assert.deepEqual(await response.json(),{
   code:'NOT_FOUND',message:'Guest request status unavailable',
  });
 };
 await denyStatus(await statusWith(createdId,null),'missing READ_CANCEL cookie');
 await denyStatus(await statusWith(createdId,
  '__Host-services_guest_request='+randomBytes(32).toString('base64url')),
 'forged READ_CANCEL cookie');
 await denyStatus(await statusWith(randomUUID(),access),
  'valid READ_CANCEL cookie for a different request');

 // The CREATE_REQUEST cookie and the READ_CANCEL cookie use distinct names,
 // seals and authorization scopes even though both are issued by this BFF.
 await denyStatus(await statusWith(createdId,cookie),
  'CREATE_REQUEST cookie cannot read request status');
 const switchedName='__Host-services_guest_request='+sealed.cookie;
 await denyStatus(await statusWith(createdId,switchedName),
  'renaming a CREATE_REQUEST seal cannot turn it into READ_CANCEL');
 const expiredSeal=sealGuestRequestAccess(webKey,createdId,
  randomBytes(32).toString('base64url'),Date.now()-1000,Date.now()-2000);
 await denyStatus(await statusWith(createdId,
  '__Host-services_guest_request='+expiredSeal.cookie),
  'expired READ_CANCEL cookie must not read request status');

 await denyStatus(await statusWith(createdId,access,'cross-site'),
  'cross-site fetch with otherwise valid READ_CANCEL cookie');
 const preserved=await statusWith(createdId,access);
 assert.equal(preserved.status,200,'denied probes must not revoke authorized read');
 assert.deepEqual(await preserved.json(),state);


 // The same retry key must return the committed receipt, not another request.
 const replay=await request(csrf);
 assert.equal(replay.status,201,'same-key retry must succeed after consumed CREATE_REQUEST proof');
 assert.deepEqual(await replay.json(),receipt);
 const rows=await db.query('SELECT id,version,status FROM service_requests WHERE guest_contact_id=$1',[contactId]);
 assert.equal(rows.rows.length,1,'idempotent replay must not duplicate rows');
 assert.equal(rows.rows[0].id,createdId);
 const proof=await db.query('SELECT consumed_at FROM guest_capabilities WHERE id=$1',[proofId]);
 assert.ok(proof.rows[0].consumed_at,'one-time CREATE_REQUEST proof must be consumed');
 const events=await db.query('SELECT count(*)::int AS n FROM domain_outbox_events WHERE subject_id=$1',[createdId]);
 assert.equal(events.rows[0].n,1,'one durable domain event only');
 console.log('Guest test CREATE_REQUEST -> request-scoped HttpOnly cookie -> live status, CSRF and replay verified');
}finally{
 if(contactCreated){
  if(createdId){
   await db.query('DELETE FROM notification_intents WHERE domain_event_id IN (SELECT id FROM domain_outbox_events WHERE subject_id=$1)',[createdId]).catch(()=>{});
   await db.query('DELETE FROM domain_outbox_events WHERE subject_id=$1',[createdId]).catch(()=>{});
   await db.query('DELETE FROM service_request_events WHERE request_id=$1',[createdId]).catch(()=>{});
   await db.query('DELETE FROM guest_capabilities WHERE request_id=$1',[createdId]).catch(()=>{});
   await db.query('DELETE FROM service_requests WHERE id=$1',[createdId]).catch(()=>{});
  }
  await db.query("DELETE FROM idempotency_records WHERE actor_scope=$1 AND route='/guest-requests'",['guest:'+contactId]).catch(()=>{});
  await db.query('DELETE FROM guest_capabilities WHERE id=$1',[proofId]).catch(()=>{});
  await db.query('DELETE FROM guest_contacts WHERE id=$1',[contactId]).catch(()=>{});
 }
 await db.end();
}
