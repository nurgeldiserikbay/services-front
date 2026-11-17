import assert from 'node:assert/strict';
import {createHmac,randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {sealAccountWebSession} from '../src/lib/account-web-session-core.mjs';

// CI-only real HTTP and PostgreSQL boundary test: verifies a legitimately
// sealed *test fixture* web cookie reaches backend bearer authorization.
// Does NOT simulate verified account OTP/login or grant production access.
assert.equal(process.env.CI,'true','do not run fixture creation outside CI');
const requireBackend=createRequire(new URL('../../../services-back/package.json',import.meta.url));
const {Client}=requireBackend('pg');
const base=process.env.PRIVATE_BFF_TEST_BASE_URL??'http://127.0.0.1:3001';
const keyPath=join(process.env.RUNNER_TEMP??'', 'services-private-bff-account-key');
assert.ok(process.env.RUNNER_TEMP,'requires isolated GitHub runner');
const key=Buffer.from((await readFile(keyPath,'utf8')).trim(),'base64');
assert.equal(key.length,32);
const hmacKey=Buffer.from(process.env.ACCOUNT_SESSION_HMAC_KEY??'','base64');
assert.equal(hmacKey.length,32);
const bearer=randomBytes(32).toString('base64url');
const tokenHash=createHmac('sha256',hmacKey)
 .update('services-session:v1\0').update(bearer).digest('hex');
const userId=randomUUID(),sessionId=randomUUID(),familyId=randomUUID();
const outsiderId=randomUUID(),outsiderSessionId=randomUUID();
const outsiderBearer=randomBytes(32).toString('base64url');
const outsiderHash=createHmac('sha256',hmacKey)
 .update('services-session:v1\0')
 .update(outsiderBearer).digest('hex');
const fixture={
 personId:randomUUID(),orgId:randomUUID(),definitionId:randomUUID(),
 offerId:randomUUID(),guestIds:[randomUUID(),randomUUID()],
 requestIds:[randomUUID(),randomUUID()],
};
const sealed=sealAccountWebSession(key,bearer,600);
const cookie='__Host-services_account_web='+sealed.cookie;
const outsiderCookie='__Host-services_account_web='+sealAccountWebSession(key,outsiderBearer,600).cookie;
const db=new Client({connectionString:process.env.DATABASE_URL});
await db.connect();
let userCreated=false;
async function inbox(){
 return fetch(new URL('/api/seller/requests?limit=20',base),{
  headers:{'Sec-Fetch-Site':'same-origin',Cookie:cookie},
  signal:AbortSignal.timeout(8000),redirect:'manual',
 });
}
try{
 await db.query('INSERT INTO users(id) VALUES($1)',[userId]);
 userCreated=true;
 await db.query(`INSERT INTO sessions(id,user_id,token_hash,family_id,expires_at)
   VALUES($1,$2,$3,$4,now()+interval '15 minutes')`,
  [sessionId,userId,tokenHash,familyId]);
 const good=await inbox();
 assert.equal(good.status,200,'active backend bearer must reach seller inbox');
 assert.match(good.headers.get('cache-control')??'',/no-store/i);
 assert.match(good.headers.get('x-robots-tag')??'',/noindex/i);
 assert.match(good.headers.get('referrer-policy')??'',/no-referrer/i);
 assert.equal(good.headers.get('set-cookie'),null);
 const body=await good.json();
 assert.deepEqual(body.items,[],'new account has no seller membership');
 assert.equal(body.next_cursor,null);
 assert.match(body.csrf_token,/^[A-Za-z0-9_-]{43}$/);
 assert.equal(body.csrf_token,sealed.csrf);
 assert.ok(!JSON.stringify(body).includes(bearer));
 assert.ok(!JSON.stringify(body).includes(sealed.cookie));

 // Create committed, isolated seller resources so the real backend process,
 // not this test's SQL connection, must authorize and mutate them.
 await db.query('INSERT INTO persons(id,user_id) VALUES($1,$2)',[fixture.personId,userId]);
 await db.query(`INSERT INTO organizations(id,owner_person_id,slug,name,status)
  VALUES($1,$2,$3,'CI seller owner','ACTIVE')`,
  [fixture.orgId,fixture.personId,'ci-signed-seller-'+randomUUID()]);
 await db.query(`INSERT INTO organization_members(id,organization_id,user_id,role)
  VALUES($1,$2,$3,'ADMIN')`,[randomUUID(),fixture.orgId,userId]);
 await db.query('INSERT INTO service_definitions(id,code,name) VALUES($1,$2,$3)',
  [fixture.definitionId,'ci-signed-seller-'+randomUUID(),'CI test service']);
 await db.query(`INSERT INTO service_offers(
  id,definition_id,organization_id,title,status,delivery_mode,contacts
  ) VALUES($1,$2,$3,'Signed seller CI offer','PUBLISHED','online','{}'::jsonb)`,
  [fixture.offerId,fixture.definitionId,fixture.orgId]);
 for(let i=0;i<2;i++){
  await db.query(`INSERT INTO guest_contacts(
    id,channel,encrypted_value,digest,verified_at,expires_at
    ) VALUES($1,'email','test-encrypted',$2,now(),now()+interval '1 day')`,
   [fixture.guestIds[i],'ci-signed-guest-'+randomUUID()]);
  await db.query(`INSERT INTO service_requests(
    id,offer_id,guest_contact_id,source_context,seller_organization_id,status
    ) VALUES($1,$2,$3,'ORGANIZATION',$4,'PENDING')`,
   [fixture.requestIds[i],fixture.offerId,fixture.guestIds[i],fixture.orgId]);
 }
 // A valid but unrelated account must not inherit another seller's grants.
 await db.query('INSERT INTO users(id) VALUES($1)',[outsiderId]);
 await db.query(`INSERT INTO sessions(id,user_id,token_hash,family_id,expires_at)
  VALUES($1,$2,$3,$4,now()+interval '15 minutes')`,
  [outsiderSessionId,outsiderId,outsiderHash,randomUUID()]);
 const outsiderRead=await fetch(new URL('/api/seller/requests',base),{
  headers:{'Sec-Fetch-Site':'same-origin',Cookie:outsiderCookie},
  signal:AbortSignal.timeout(8000),redirect:'manual',
 });
 assert.equal(outsiderRead.status,200);
 const outsiderPage=await outsiderRead.json();
 assert.deepEqual(outsiderPage.items,[],'unrelated seller cannot read pending requests');
 const outsiderDecision=await fetch(new URL(
  '/api/seller/requests/'+fixture.requestIds[0]+'/accept',base),{
  method:'POST',redirect:'manual',signal:AbortSignal.timeout(8000),
  headers:{'Sec-Fetch-Site':'same-origin',Cookie:outsiderCookie,
   Origin:'https://services.example.test','Content-Type':'application/json'},
  body:JSON.stringify({version:1,csrf_token:outsiderPage.csrf_token,
   idempotency_key:randomUUID()}),
 });
 assert.equal(outsiderDecision.status,403,'unrelated seller must be forbidden');
 assert.equal((await outsiderDecision.json()).code,'FORBIDDEN');
 const foreignRequest=await db.query('SELECT status,version FROM service_requests WHERE id=$1',
  [fixture.requestIds[0]]);
 assert.deepEqual(foreignRequest.rows[0],{status:'PENDING',version:1});

 // A foreign account's forbidden write must not create an outbox event or
 // notification for the target. PostgreSQL side effects are authoritative,
 // independently of sanitized HTTP error content.
 const unauthorizedEvents=await db.query(
  'SELECT count(*)::integer AS n FROM domain_outbox_events WHERE subject_id=$1',
  [fixture.requestIds[0]]);
 assert.equal(unauthorizedEvents.rows[0].n,0,
  'cross-account seller decision must emit no outbox event');
 const unauthorizedNotices=await db.query(
  'SELECT count(*)::integer AS n FROM notification_intents WHERE dedupe_key=$1',
  ['request-accept:guest:'+fixture.requestIds[0]]);
 assert.equal(unauthorizedNotices.rows[0].n,0,
  'cross-account seller decision must emit no notification intent');

 const populated=await inbox();
 assert.equal(populated.status,200,'seller must read only own committed requests');
 const page=await populated.json();
 assert.deepEqual(new Set(page.items.map(x=>x.id)),new Set(fixture.requestIds));
 assert.ok(page.items.every(x=>x.sellerKind==='organization'&&
  x.version===1&&x.state==='pending'));
 assert.equal(page.csrf_token,sealed.csrf);
 async function decision(id,action,idempotencyKey,version=1,csrf=sealed.csrf){
  return fetch(new URL('/api/seller/requests/'+id+'/'+action,base),{
   method:'POST',redirect:'manual',signal:AbortSignal.timeout(8000),
   headers:{'Sec-Fetch-Site':'same-origin',Cookie:cookie,
    Origin:'https://services.example.test','Content-Type':'application/json'},
   body:JSON.stringify({version,csrf_token:csrf,idempotency_key:idempotencyKey}),
  });
 }
 // A wrong CSRF must fail without touching the authoritative request.
 const csrfDenied=await decision(fixture.requestIds[0],'accept',randomUUID(),1,
  randomBytes(32).toString('base64url'));
 assert.equal(csrfDenied.status,401,'wrong CSRF must fail');
 const untouched=await db.query('SELECT status,version FROM service_requests WHERE id=$1',
  [fixture.requestIds[0]]);
 assert.equal(untouched.rows[0].status,'PENDING');
 assert.equal(untouched.rows[0].version,1);

 const csrfEvents=await db.query(
  'SELECT count(*)::integer AS n FROM domain_outbox_events WHERE subject_id=$1',
  [fixture.requestIds[0]]);
 assert.equal(csrfEvents.rows[0].n,0,
  'rejected CSRF must not create an outbox event');
 const csrfNotices=await db.query(
  'SELECT count(*)::integer AS n FROM notification_intents WHERE dedupe_key=$1',
  ['request-accept:guest:'+fixture.requestIds[0]]);
 assert.equal(csrfNotices.rows[0].n,0,
  'rejected CSRF must not create a notification intent');

 for(const [index,action] of ['accept','decline'].entries()){
  const id=fixture.requestIds[index],key=randomUUID();
  const first=await decision(id,action,key);
  assert.equal(first.status,200,action+' must be authorized by backend');
  assert.deepEqual(await first.json(),{outcome:'ok'});
  const replay=await decision(id,action,key);
  assert.equal(replay.status,200,'idempotent retry must be successful');
  assert.deepEqual(await replay.json(),{outcome:'ok'});
  const row=await db.query('SELECT status,version FROM service_requests WHERE id=$1',[id]);
  assert.deepEqual(row.rows[0],{status:action==='accept'?'ACCEPTED':'DECLINED',version:2});
  const notices=await db.query(`SELECT count(*)::integer AS n FROM notification_intents
   WHERE dedupe_key=$1`,['request-'+action+':guest:'+id]);
  assert.equal(notices.rows[0].n,1,'replay cannot duplicate notification intent');

  // The outbox and notification are one committed logical action, not merely
  // two independent counts. Verify the exact event/intent foreign key, guest
  // recipient and external channel; replay must not duplicate either record.
  const linked=await db.query(`
   SELECT o.id::text AS event_id,o.topic,o.subject_kind,
     o.subject_id::text AS subject_id,
     n.id::text AS intent_id,n.domain_event_id::text AS linked_event_id,
     n.guest_contact_id::text AS guest_contact_id,n.audience,n.channel,
     n.dedupe_key,n.recipient_person_id
   FROM domain_outbox_events o
   JOIN notification_intents n ON n.domain_event_id=o.id
   WHERE o.subject_id=$1::uuid
  `,[id]);
  assert.equal(linked.rows.length,1,
   'decision and idempotent replay must produce exactly one linked outbox/intent pair');
  const notification=linked.rows[0];
  assert.equal(notification.event_id,notification.linked_event_id);
  assert.equal(notification.topic,'service_request.'+
   (action==='accept'?'accepted':'declined'));
  assert.equal(notification.subject_kind,'ServiceRequest');
  assert.equal(notification.subject_id,id);
  assert.equal(notification.guest_contact_id,fixture.guestIds[index]);
  assert.equal(notification.audience,'CLIENT');
  assert.equal(notification.channel,'EMAIL');
  assert.equal(notification.dedupe_key,'request-'+action+':guest:'+id);
  assert.equal(notification.recipient_person_id,null);

  const stale=await decision(id,action,randomUUID());
  assert.equal(stale.status,409,'new key cannot reapply a finalized decision');

  // A finalized accept/decline cannot be reversed with a different
  // idempotency key. This must neither mutate the canonical row nor create
  // an opposite notification intent in the PostgreSQL-backed backend.
  const opposite=action==='accept'?'decline':'accept';
  const deniedOpposite=await decision(id,opposite,randomUUID());
  assert.equal(deniedOpposite.status,409,
   'finalized '+action+' must reject a conflicting '+opposite+' decision');
  assert.deepEqual(await deniedOpposite.json(),{code:'CONFLICT'});
  const unchangedDecision=await db.query(
   'SELECT status,version FROM service_requests WHERE id=$1',[id]);
  assert.deepEqual(unchangedDecision.rows[0],{
   status:action==='accept'?'ACCEPTED':'DECLINED',version:2,
  });
  const oppositeNotice=await db.query(
   'SELECT count(*)::integer AS n FROM notification_intents WHERE dedupe_key=$1',
   ['request-'+opposite+':guest:'+id]);
  assert.equal(oppositeNotice.rows[0].n,0,
   'conflicting decision must not produce the opposite notification intent');

 }
 const pendingPage=await fetch(new URL('/api/seller/requests?state=pending',base),{
  headers:{'Sec-Fetch-Site':'same-origin',Cookie:cookie},redirect:'manual',
  signal:AbortSignal.timeout(8000),
 });
 assert.equal(pendingPage.status,200);
 assert.deepEqual((await pendingPage.json()).items,[]);

 await db.query('UPDATE sessions SET revoked_at=now() WHERE id=$1',[sessionId]);
 const revoked=await inbox();
 assert.equal(revoked.status,401,'revocation must defeat still-valid web cookie');
 const denied=await revoked.json();
 assert.equal(denied.code,'AUTH_REQUIRED');
 assert.ok(!JSON.stringify(denied).includes(bearer));
 assert.equal(revoked.headers.get('set-cookie'),null);

 // A web cookie that is still within its local expiry must not authorize a
 // mutation after the backing PostgreSQL session is revoked. Verify that
 // the denied request emits no new notification or outbox side effects.
 const beforeRevokedDecision=await db.query(
  'SELECT count(*)::integer AS n FROM notification_intents WHERE dedupe_key=$1',
  ['request-accept:guest:'+fixture.requestIds[0]]);
 const revokedDecision=await decision(fixture.requestIds[0],'accept',randomUUID(),2);
 assert.equal(revokedDecision.status,401,
  'revoked backend session must deny seller mutation even with valid CSRF');
 assert.match(revokedDecision.headers.get('cache-control')??'',/no-store/i);
 assert.match(revokedDecision.headers.get('x-robots-tag')??'',/noindex/i);
 assert.equal(revokedDecision.headers.get('set-cookie'),null);
 assert.deepEqual(await revokedDecision.json(),{code:'AUTH_REQUIRED'});
 const afterRevokedDecision=await db.query(
  'SELECT count(*)::integer AS n FROM notification_intents WHERE dedupe_key=$1',
  ['request-accept:guest:'+fixture.requestIds[0]]);
 assert.equal(afterRevokedDecision.rows[0].n,beforeRevokedDecision.rows[0].n,
  'revoked seller mutation must not create a notification');
 const unchangedAfterRevocation=await db.query(
  'SELECT status,version FROM service_requests WHERE id=$1',[fixture.requestIds[0]]);
 assert.deepEqual(unchangedAfterRevocation.rows[0],{status:'ACCEPTED',version:2});

 console.log('Signed web cookie -> actual backend empty seller inbox -> revoked bearer denied');
}finally{
 if(userCreated){
  // The test database is ephemeral, but still clean all committed fixtures.
  const ids=fixture.requestIds;
  await db.query(`DELETE FROM notification_intents
    WHERE domain_event_id IN
     (SELECT id FROM domain_outbox_events WHERE subject_id=ANY($1::uuid[]))`,[ids]).catch(()=>{});
  await db.query('DELETE FROM idempotency_records WHERE actor_scope=$1',
   ['seller:'+userId]).catch(()=>{});
  await db.query('DELETE FROM domain_outbox_events WHERE subject_id=ANY($1::uuid[])',
   [ids]).catch(()=>{});
  await db.query('DELETE FROM service_request_events WHERE request_id=ANY($1::uuid[])',
   [ids]).catch(()=>{});
  await db.query('DELETE FROM service_requests WHERE id=ANY($1::uuid[])',[ids]).catch(()=>{});
  await db.query('DELETE FROM guest_contacts WHERE id=ANY($1::uuid[])',
   [fixture.guestIds]).catch(()=>{});
  await db.query('DELETE FROM service_offers WHERE id=$1',[fixture.offerId]).catch(()=>{});
  await db.query('DELETE FROM organization_members WHERE organization_id=$1',
   [fixture.orgId]).catch(()=>{});
  await db.query('DELETE FROM organizations WHERE id=$1',[fixture.orgId]).catch(()=>{});
  await db.query('DELETE FROM service_definitions WHERE id=$1',
   [fixture.definitionId]).catch(()=>{});
  await db.query('DELETE FROM persons WHERE id=$1',[fixture.personId]).catch(()=>{});
  await db.query('DELETE FROM sessions WHERE id=$1',[outsiderSessionId]).catch(()=>{});
  await db.query('DELETE FROM users WHERE id=$1',[outsiderId]).catch(()=>{});
  await db.query('DELETE FROM sessions WHERE id=$1',[sessionId]).catch(()=>{});
  await db.query('DELETE FROM users WHERE id=$1',[userId]).catch(()=>{});
 }
 await db.end();
}
