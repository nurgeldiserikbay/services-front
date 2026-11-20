import assert from 'node:assert/strict';
import {createCipheriv,createHmac,randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {sealGuestSession} from '../src/lib/guest-session-core.mjs';
import {openGuestRequestAccess} from '../src/lib/guest-request-access-core.mjs';
import {sealAccountWebSession} from '../src/lib/account-web-session-core.mjs';

// Real Next.js -> HTTPS backend -> committed PostgreSQL CI-only lifecycle.
// No application authentication bypass: disposable OTP-verified guest proof
// and independently sealed seller test session are seeded into isolated CI DB.
assert.equal(process.env.CI,'true','requires disposable CI PostgreSQL');
assert.ok(process.env.RUNNER_TEMP);
const {Client}=createRequire(new URL('../../../services-back/package.json',import.meta.url))('pg');
const secret=async filename=>{
 const value=Buffer.from((await readFile(join(process.env.RUNNER_TEMP,filename),'utf8')).trim(),'base64');
 assert.equal(value.length,32);
 return value;
};
const [guestWebKey,accountWebKey,guestBackendKey]=await Promise.all([
 secret('services-private-bff-guest-key'),secret('services-private-bff-account-key'),
 secret('services-guest-capability-hmac-key'),
]);
const [encryptionKey,networkKey]=await Promise.all([
 secret('services-guest-contact-encryption-key'),
 secret('services-guest-network-attestation-key'),
]);
const codeFile=join(process.env.RUNNER_TEMP,'services-guest-completion-otp.json');
const completionBase=process.env.GUEST_COMPLETION_BFF_TEST_BASE_URL??'http://127.0.0.1:3003';
const originalContact='ci-complete-'+randomBytes(8).toString('hex')+'@example.org';
const iv=randomBytes(12);
const contactCipher=createCipheriv('aes-256-gcm',encryptionKey,iv);
const encrypted=Buffer.concat([contactCipher.update(originalContact,'utf8'),contactCipher.final()]);
const contactCipherText=['v1',iv.toString('base64url'),
 contactCipher.getAuthTag().toString('base64url'),encrypted.toString('base64url')].join('.');
const contactDigest=createHmac('sha256',guestBackendKey)
 .update('guest-contact:v1\0').update('email\0'+originalContact).digest('hex');
const networkDigest=randomBytes(32).toString('hex');
const timestamp=String(Date.now());
const networkProof='v1.'+networkDigest+'.'+timestamp+'.'+createHmac('sha256',networkKey)
 .update('services-otp-network:v1\n').update(networkDigest).update('\n')
 .update(timestamp).digest('hex');
const accountBackendKey=Buffer.from(process.env.ACCOUNT_SESSION_HMAC_KEY??'','base64');
assert.equal(accountBackendKey.length,32);
const base=process.env.PRIVATE_BFF_TEST_BASE_URL??'http://127.0.0.1:3001';
const ids={user:randomUUID(),person:randomUUID(),org:randomUUID(),
 definition:randomUUID(),offer:randomUUID(),contact:randomUUID(),
 guestProof:randomUUID(),session:randomUUID()};
const guestToken=randomBytes(32).toString('base64url');
const accountBearer=randomBytes(32).toString('base64url');
const guestSealed=sealGuestSession(guestWebKey,guestToken,600);
const sellerSealed=sealAccountWebSession(accountWebKey,accountBearer,600);
const guestCreateCookie='__Host-services_guest_create='+guestSealed.cookie;
const sellerCookie='__Host-services_account_web='+sellerSealed.cookie;
const guestTokenHash=createHmac('sha256',guestBackendKey)
 .update('guest-capability:v1\0').update('CREATE_REQUEST\0')
 .update(guestToken).digest('hex');
const accountTokenHash=createHmac('sha256',accountBackendKey)
 .update('services-session:v1\0').update(accountBearer).digest('hex');
const db=new Client({connectionString:process.env.DATABASE_URL});
let connected=false,createdRequest=null;
const body={csrf_token:guestSealed.csrf,idempotency_key:randomUUID(),
 service_offer_id:ids.offer,consent_to_contact:true,note:'PRIVATE CI JOURNEY NOTE'};
const guestCreate=()=>fetch(new URL('/api/guest-requests',base),{
 method:'POST',redirect:'manual',signal:AbortSignal.timeout(8000),
 headers:{'Sec-Fetch-Site':'same-origin',Origin:'https://services.example.test',
  'Content-Type':'application/json',Cookie:guestCreateCookie},
 body:JSON.stringify(body),
});
const guestStatus=(id,cookie)=>fetch(
 new URL('/api/guest-requests/'+id+'/status',base),{
 headers:{'Sec-Fetch-Site':'same-origin',...(cookie?{Cookie:cookie}:{})},
 redirect:'manual',signal:AbortSignal.timeout(8000),
});
const sellerInbox=()=>fetch(new URL('/api/seller/requests',base),{
 headers:{'Sec-Fetch-Site':'same-origin',Cookie:sellerCookie},
 redirect:'manual',signal:AbortSignal.timeout(8000),
});
const sellerAccept=(id,csrf,version=1,key=randomUUID())=>fetch(
 new URL('/api/seller/requests/'+id+'/accept',base),{
 method:'POST',redirect:'manual',signal:AbortSignal.timeout(8000),
 headers:{'Sec-Fetch-Site':'same-origin',Origin:'https://services.example.test',
  'Content-Type':'application/json',Cookie:sellerCookie},
 body:JSON.stringify({version,csrf_token:csrf,idempotency_key:key}),
});
try{
 await db.connect();connected=true;
 await db.query('INSERT INTO users(id) VALUES($1)',[ids.user]);
 await db.query('INSERT INTO persons(id,user_id) VALUES($1,$2)',[ids.person,ids.user]);
 await db.query(`INSERT INTO sessions(id,user_id,token_hash,family_id,expires_at)
  VALUES($1,$2,$3,$4,now()+interval '15 minutes')`,
  [ids.session,ids.user,accountTokenHash,randomUUID()]);
 await db.query(`INSERT INTO organizations(id,owner_person_id,slug,name,status)
  VALUES($1,$2,$3,'CI lifecycle seller','ACTIVE')`,
  [ids.org,ids.person,'ci-guest-seller-'+randomUUID()]);
 await db.query(`INSERT INTO organization_members(id,organization_id,user_id,role)
  VALUES($1,$2,$3,'ADMIN')`,[randomUUID(),ids.org,ids.user]);
 await db.query('INSERT INTO service_definitions(id,code,name) VALUES($1,$2,$3)',
  [ids.definition,'ci-guest-seller-'+randomUUID(),'CI seller service']);
 await db.query(`INSERT INTO service_offers
  (id,definition_id,organization_id,title,status,delivery_mode,contacts)
  VALUES($1,$2,$3,'CI seller offer','PUBLISHED','online','{}'::jsonb)`,
  [ids.offer,ids.definition,ids.org]);
 await db.query(`INSERT INTO guest_contacts
  (id,channel,encrypted_value,digest,verified_at,expires_at)
  VALUES($1,'email',$2,$3,now(),now()+interval '1 day')`,
  [ids.contact,contactCipherText,contactDigest]);
 await db.query(`INSERT INTO guest_capabilities
  (id,guest_contact_id,scope,token_hash,expires_at)
  VALUES($1,$2,'CREATE_REQUEST',$3,now()+interval '15 minutes')`,
  [ids.guestProof,ids.contact,guestTokenHash]);
 const first=await guestCreate();
 assert.equal(first.status,201,'guest verified proof must create a request through real HTTP');
 assert.match(first.headers.get('cache-control')??'',/no-store/);
 const receipt=await first.json();
 assert.equal(receipt.state,'pending');
 createdRequest=receipt.id;
 assert.match(createdRequest,/^[a-f0-9-]{36}$/);
 const accessCookie=first.headers.getSetCookie()
  .find(x=>x.startsWith('__Host-services_guest_request='))?.split(';')[0];
 assert.ok(accessCookie,'backend must issue request-specific HttpOnly guest cookie');
 assert.ok(!JSON.stringify(receipt).includes(guestToken));
 const initial=await guestStatus(createdRequest,accessCookie);
 assert.equal(initial.status,200);
 const original=await initial.json();
 assert.equal(original.state,'pending');
 assert.equal(original.version,1);
 assert.ok(!JSON.stringify(original).includes('PRIVATE CI JOURNEY NOTE'));

 const seller=await sellerInbox();
 assert.equal(seller.status,200,'seller must see guest-created committed request');
 const inbox=await seller.json();
 assert.ok(inbox.items.some(x=>x.id===createdRequest&&x.version===1&&
  x.state==='pending'&&x.sellerKind==='organization'));
 assert.equal(inbox.csrf_token,sellerSealed.csrf);
 const invalidCsrf=await sellerAccept(createdRequest,randomBytes(32).toString('base64url'));
 assert.equal(invalidCsrf.status,401,'forged seller CSRF must fail');
 assert.equal((await db.query('SELECT status FROM service_requests WHERE id=$1',
  [createdRequest])).rows[0]?.status,'PENDING');

 const key=randomUUID();
 const accepted=await sellerAccept(createdRequest,sellerSealed.csrf,1,key);
 assert.equal(accepted.status,200,'seller accepts the same guest-created request');
 assert.deepEqual(await accepted.json(),{outcome:'ok'});
 const replay=await sellerAccept(createdRequest,sellerSealed.csrf,1,key);
 assert.equal(replay.status,200,'same seller idempotency key returns same outcome');
 const final=await guestStatus(createdRequest,accessCookie);
 assert.equal(final.status,200);
 const state=await final.json();
 assert.equal(state.id,createdRequest);
 assert.equal(state.state,'accepted','guest scoped cookie reads seller decision');
 assert.equal(state.version,2);
 assert.ok(!JSON.stringify(state).includes('PRIVATE CI JOURNEY NOTE'));
 assert.equal((await guestStatus(createdRequest,null)).status,404,
  'anonymous browser cannot read guest decision');
 const foreign=await guestStatus(randomUUID(),accessCookie);
 assert.equal(foreign.status,404,'request-scoped cookie cannot read another ID');

 const persisted=await db.query('SELECT status,version FROM service_requests WHERE id=$1',
  [createdRequest]);
 assert.deepEqual(persisted.rows[0],{status:'ACCEPTED',version:2});
 const outbox=await db.query(
  'SELECT topic,safe_payload FROM domain_outbox_events WHERE subject_id=$1',
  [createdRequest]);
 assert.deepEqual(new Set(outbox.rows.map(x=>x.topic)),
  new Set(['service_request.created','service_request.accepted']));
 assert.ok(outbox.rows.every(x=>JSON.stringify(x.safe_payload)==='{}'));
 const notices=await db.query(`SELECT audience,channel,guest_contact_id::text
  FROM notification_intents WHERE dedupe_key=$1`,
  ['request-accept:guest:'+createdRequest]);
 assert.equal(notices.rowCount,1,'replayed decision must not duplicate client notices');
 assert.deepEqual(notices.rows[0],{
  audience:'CLIENT',channel:'EMAIL',guest_contact_id:ids.contact,
 });
 const stale=await sellerAccept(createdRequest,sellerSealed.csrf,1,randomUUID());
 assert.equal(stale.status,409,'different idempotency key cannot re-accept decision');

 // Continue the SAME committed request through independent OTP completion BFF.
 // CI-only adapter delivers the true generated OTP to an ephemeral 0600 file.
 const accessSession=openGuestRequestAccess(guestWebKey,accessCookie.split('=')[1]);
 assert.ok(accessSession&&accessSession.requestId===createdRequest);
 const guestCsrf=accessSession.csrf;
 const completionUrl='/api/guest-requests/'+createdRequest+'/completion';
 const completionPost=(suffix,payload,{cookie=accessCookie,csrf=guestCsrf,
  proof=networkProof,match}={})=>fetch(
  new URL(completionUrl+suffix,completionBase),{
   method:'POST',redirect:'manual',signal:AbortSignal.timeout(8000),
   headers:{'Content-Type':'application/json',
    Origin:'https://services.example.test','Sec-Fetch-Site':'same-origin',
    Cookie:cookie,'X-Services-CSRF':csrf,
    'X-Services-Network-Proof':proof,
    ...(match?{'If-Match':match}:{})},
   body:JSON.stringify(payload),
  });

 const deniedStart=await completionPost('/challenges',{locale:'kk'},
  {csrf:randomBytes(32).toString('base64url')});
 assert.equal(deniedStart.status,503);
 const forgedNetwork=await completionPost('/challenges',{locale:'kk'},
  {proof:'v1.invalid'});
 assert.equal(forgedNetwork.status,503);
 const started=await completionPost('/challenges',{locale:'kk'});
 assert.equal(started.status,202,'real OTP must be initiated through scoped guest BFF');
 const challengeResponse=await started.json();
 assert.deepEqual(Object.keys(challengeResponse),['challenge_id']);
 const challengeCookie=started.headers.getSetCookie()
  .find(x=>x.startsWith('__Host-services_guest_completion_challenge='))?.split(';')[0];
 assert.ok(challengeCookie);
 assert.match(started.headers.getSetCookie()[0]??'',/httponly/i);
 assert.ok(!JSON.stringify(challengeResponse).includes(guestToken));
 const otp=JSON.parse(await readFile(codeFile,'utf8'));
 assert.deepEqual({purpose:otp.purpose,destination:otp.destination},
  {purpose:'COMPLETE_REQUEST',destination:originalContact});
 assert.match(otp.code,/^[0-9]{6}$/);
 const challengePath='/challenges/'+challengeResponse.challenge_id+'/verify';
 const verificationCookie=accessCookie+'; '+challengeCookie;
 const wrongCode=otp.code==='999999'?'999998':'999999';
 assert.equal((await completionPost(challengePath,{code:wrongCode},
  {cookie:verificationCookie})).status,503);
 const verified=await completionPost(challengePath,{code:otp.code},
  {cookie:verificationCookie});
 assert.equal(verified.status,200);
 assert.deepEqual(await verified.json(),{verified:true});
 const completionCookie=verified.headers.getSetCookie()
  .find(x=>x.startsWith('__Host-services_guest_completion='))?.split(';')[0];
 assert.ok(completionCookie,'one-use write bearer is sealed in HttpOnly cookie');
 assert.match(verified.headers.getSetCookie().join(' '),/httponly/i);
 assert.ok(!verified.headers.getSetCookie().join(' ').includes(otp.code));
 const writeCookies=accessCookie+'; '+completionCookie;
 assert.equal((await completionPost('/confirm',{},
  {cookie:accessCookie,match:'"2"'})).status,503,
  'READ_CANCEL alone must never confirm completion');
 assert.equal((await completionPost('/confirm',{},
  {cookie:writeCookies,match:'W/"2"'})).status,409);
 const acceptedStill=await db.query('SELECT status,version FROM service_requests WHERE id=$1',
  [createdRequest]);
 assert.deepEqual(acceptedStill.rows[0],{status:'ACCEPTED',version:2});
 const finished=await completionPost('/confirm',{},
  {cookie:writeCookies,match:'"2"'});
 assert.equal(finished.status,200,'real OTP write proof must complete accepted request');
 assert.deepEqual(await finished.json(),
  {code:'COMPLETED',id:createdRequest,version:3});
 assert.ok(finished.headers.getSetCookie()
  .some(x=>x.startsWith('__Host-services_guest_completion=')&&/max-age=0/i.test(x)));
 const completedStatus=await guestStatus(createdRequest,accessCookie);
 assert.equal(completedStatus.status,200);
 const completedBody=await completedStatus.json();
 assert.equal(completedBody.state,'completed');
 assert.equal(completedBody.version,3);
 assert.equal((await completionPost('/confirm',{},
  {cookie:writeCookies,match:'"2"'})).status,503,
  'replayed one-use proof cannot duplicate completion');
 assert.equal((await db.query('SELECT id FROM service_experiences WHERE request_id=$1',
  [createdRequest])).rowCount,0,'guest completion must not create verified review');
 const completedEvents=await db.query(
  'SELECT topic,safe_payload FROM domain_outbox_events WHERE subject_id=$1',
  [createdRequest]);
 assert.deepEqual(new Set(completedEvents.rows.map(x=>x.topic)),
  new Set(['service_request.created','service_request.accepted',
   'service_request.completed']));
 assert.ok(completedEvents.rows.every(x=>JSON.stringify(x.safe_payload)==='{}'));
 assert.equal((await db.query('SELECT id FROM notification_intents WHERE dedupe_key=$1',
  ['request-completed:seller:'+createdRequest])).rowCount,1);
 console.log('Live CI guest CREATE -> seller ACCEPT -> delivered OTP -> guest COMPLETE -> refreshed status PASS');

}finally{
 if(connected){
  if(createdRequest){
   await db.query(`DELETE FROM notification_intents WHERE domain_event_id IN
    (SELECT id FROM domain_outbox_events WHERE subject_id=$1)`,
    [createdRequest]).catch(()=>{});
   await db.query('DELETE FROM domain_outbox_events WHERE subject_id=$1',
    [createdRequest]).catch(()=>{});
   await db.query('DELETE FROM service_request_events WHERE request_id=$1',
    [createdRequest]).catch(()=>{});
   await db.query('DELETE FROM guest_capabilities WHERE request_id=$1',
    [createdRequest]).catch(()=>{});
   await db.query('DELETE FROM service_requests WHERE id=$1',
    [createdRequest]).catch(()=>{});
  }
  await db.query(`DELETE FROM idempotency_records
   WHERE actor_scope IN ($1,$2)`,
   ['guest:'+ids.contact,'seller:'+ids.user]).catch(()=>{});
  await db.query('DELETE FROM guest_capabilities WHERE id=$1',
   [ids.guestProof]).catch(()=>{});
  await db.query('DELETE FROM guest_contacts WHERE id=$1',[ids.contact]).catch(()=>{});
  await db.query('DELETE FROM service_offers WHERE id=$1',[ids.offer]).catch(()=>{});
  await db.query('DELETE FROM organization_members WHERE organization_id=$1',
   [ids.org]).catch(()=>{});
  await db.query('DELETE FROM organizations WHERE id=$1',[ids.org]).catch(()=>{});
  await db.query('DELETE FROM service_definitions WHERE id=$1',
   [ids.definition]).catch(()=>{});
  await db.query('DELETE FROM sessions WHERE id=$1',[ids.session]).catch(()=>{});
  await db.query('DELETE FROM persons WHERE id=$1',[ids.person]).catch(()=>{});
  await db.query('DELETE FROM users WHERE id=$1',[ids.user]).catch(()=>{});
  await db.end();
 }
}
