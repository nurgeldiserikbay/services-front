import assert from 'node:assert/strict';
import {createHmac,randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {sealAccountWebSession} from '../src/lib/account-web-session-core.mjs';
import {exerciseSellerMobileChrome} from './helpers/seller-mobile-chrome.mjs';

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
 // The isolated BFF must revalidate the account session against the live
 // backend rather than trusting an encrypted but potentially stale cookie.
 // A second live session for the same user behaves like another device.
 const remoteSessionId=randomUUID();
 const remoteBearer=randomBytes(32).toString('base64url');
 const remoteHash=createHmac('sha256',hmacKey)
  .update('services-session:v1\0').update(remoteBearer).digest('hex');
 await db.query(`INSERT INTO sessions(id,user_id,token_hash,family_id,expires_at)
   VALUES($1,$2,$3,$4,now()+interval '15 minutes')`,
  [remoteSessionId,userId,remoteHash,randomUUID()]);
 const devices=await fetch(new URL('/api/account/sessions',base),{
  headers:{'Sec-Fetch-Site':'same-origin',Cookie:cookie},
  signal:AbortSignal.timeout(8000),redirect:'manual',
 });
 assert.equal(devices.status,200,'valid backing session must list devices over live HTTP');
 assert.match(devices.headers.get('cache-control')??'',/no-store/i);
 assert.match(devices.headers.get('x-robots-tag')??'',/noindex/i);
 assert.equal(devices.headers.get('set-cookie'),null);
 const inventory=await devices.json();
 assert.ok(Array.isArray(inventory.items));
 assert.ok(inventory.items.some(item=>item.id===sessionId&&item.current===true),
  'real backend must identify the caller current session');
 assert.equal(inventory.csrf_token,sealed.csrf);
 assert.ok(inventory.items.some(item=>item.id===remoteSessionId&&!item.current),
  'same-account other session must be visible to the active user');
 const revokeRequest=async(id,csrf=sealed.csrf)=>fetch(new URL('/api/account/sessions/'+id,base),{
  method:'DELETE',redirect:'manual',signal:AbortSignal.timeout(8000),
  headers:{'Sec-Fetch-Site':'same-origin',Cookie:cookie,
   Origin:'https://services.example.test','x-services-csrf':csrf},
 });
 const currentDenied=await revokeRequest(sessionId);
 assert.equal(currentDenied.status,409,'remote revoke must not target current session');
 assert.deepEqual(await currentDenied.json(),{code:'CURRENT_SESSION'});
 const wrongCsrfDenied=await revokeRequest(remoteSessionId,randomBytes(32).toString('base64url'));
 assert.equal(wrongCsrfDenied.status,404,'invalid CSRF must not revoke another session');
 const notRevoked=await db.query('SELECT revoked_at FROM sessions WHERE id=$1',[remoteSessionId]);
 assert.equal(notRevoked.rows[0].revoked_at,null,'CSRF rejection must leave session active');
 const crossSiteDenied=await fetch(new URL('/api/account/sessions/'+remoteSessionId,base),{
  method:'DELETE',redirect:'manual',signal:AbortSignal.timeout(8000),
  headers:{'Sec-Fetch-Site':'cross-site',Cookie:cookie,
   Origin:'https://services.example.test','x-services-csrf':sealed.csrf},
 });
 assert.equal(crossSiteDenied.status,404,
  'cross-site DELETE cannot revoke another device even with a valid cookie and CSRF');
 const foreignOriginDenied=await fetch(new URL('/api/account/sessions/'+remoteSessionId,base),{
  method:'DELETE',redirect:'manual',signal:AbortSignal.timeout(8000),
  headers:{'Sec-Fetch-Site':'same-origin',Cookie:cookie,
   Origin:'https://attacker.example.test','x-services-csrf':sealed.csrf},
 });
 assert.equal(foreignOriginDenied.status,404,
  'untrusted Origin cannot revoke an account device');
 const preAllowed=await db.query('SELECT revoked_at FROM sessions WHERE id=$1',
  [remoteSessionId]);
 assert.equal(preAllowed.rows[0].revoked_at,null,
  'cross-site and Origin rejection must cause no PostgreSQL mutation');
 const remoteRevoked=await revokeRequest(remoteSessionId);
 assert.equal(remoteRevoked.status,204,'authenticated remote device must be revocable');
 assert.match(remoteRevoked.headers.get('cache-control')??'',/no-store/i);
 assert.equal(remoteRevoked.headers.get('set-cookie'),null);
 const replayRemote=await revokeRequest(remoteSessionId);
 assert.equal(replayRemote.status,404,
  'replay after remote revocation must not report a second successful logout');
 assert.deepEqual(await replayRemote.json(),{code:'UNAVAILABLE'});
 const persistedRevocation=await db.query('SELECT revoked_at FROM sessions WHERE id=$1',[remoteSessionId]);
 assert.ok(persistedRevocation.rows[0].revoked_at instanceof Date,
  'remote revocation must be committed in PostgreSQL');
 const stillCurrent=await db.query('SELECT revoked_at FROM sessions WHERE id=$1',[sessionId]);
 assert.equal(stillCurrent.rows[0].revoked_at,null,
  'other-device logout must not revoke the active web session');
 const afterRemoteRevoke=await fetch(new URL('/api/account/sessions',base),{
  headers:{'Sec-Fetch-Site':'same-origin',Cookie:cookie},
  signal:AbortSignal.timeout(8000),redirect:'manual',
 });
 assert.equal(afterRemoteRevoke.status,200);
 const afterRemoteInventory=await afterRemoteRevoke.json();
 assert.ok(afterRemoteInventory.items.some(item=>item.id===sessionId&&item.current));
 assert.equal(afterRemoteInventory.items.some(item=>item.id===remoteSessionId),false,
  'revoked device must disappear from refreshed backend inventory');

 assert.ok(!JSON.stringify(inventory).includes(bearer));
 assert.ok(!JSON.stringify(inventory).includes(tokenHash));
 const wrongOrigin=await fetch(new URL('/api/account/sessions',base),{
  headers:{'Sec-Fetch-Site':'cross-site',Cookie:cookie},
  signal:AbortSignal.timeout(8000),redirect:'manual',
 });
 assert.equal(wrongOrigin.status,404,'cross-site inventory read must not reach session data');
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
 // The authorized seller UI must show the same PostgreSQL-backed rows on
 // narrow mobile and tablet Chrome, with all filters/actions in viewport.
 await exerciseSellerMobileChrome({
  base,sealedCookie:sealed.cookie,requestId:fixture.requestIds[0],
 });
 // A valid but unrelated account must not inherit another seller's grants.
 await db.query('INSERT INTO users(id) VALUES($1)',[outsiderId]);
 await db.query(`INSERT INTO sessions(id,user_id,token_hash,family_id,expires_at)
  VALUES($1,$2,$3,$4,now()+interval '15 minutes')`,
  [outsiderSessionId,outsiderId,outsiderHash,randomUUID()]);
 // A different real account's session ID must never be revocable through
 // this user's still-valid cookie, even if its UUID is known.
 const foreignRevoke=await revokeRequest(outsiderSessionId);
 assert.equal(foreignRevoke.status,404,
  'foreign account session cannot be revoked through another account');
 assert.deepEqual(await foreignRevoke.json(),{code:'UNAVAILABLE'});
 assert.match(foreignRevoke.headers.get('cache-control')??'',/no-store/i);
 const foreignUnchanged=await db.query('SELECT revoked_at FROM sessions WHERE id=$1',
  [outsiderSessionId]);
 assert.equal(foreignUnchanged.rows[0].revoked_at,null,
  'foreign session must remain active in PostgreSQL');
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

 // Logout must never be a cross-site logout CSRF vector. Exercise the
 // unrelated fixture account so the seller's lifecycle remains independently
 // testable after its own authenticated session is revoked.
 const outsiderLogout=async({csrf=outsiderPage.csrf_token,site='same-origin',
  origin='https://services.example.test'}={})=>fetch(new URL('/api/account/logout',base),{
  method:'POST',redirect:'manual',signal:AbortSignal.timeout(8000),
  headers:{'Sec-Fetch-Site':site,Cookie:outsiderCookie,
   Origin:origin,'x-services-csrf':csrf},
 });
 const crossSiteLogout=await outsiderLogout({site:'cross-site'});
 assert.equal(crossSiteLogout.status,404,'cross-site request cannot force account logout');
 assert.equal(crossSiteLogout.headers.get('set-cookie'),null,
  'denied logout must not clear an existing browser session cookie');
 const invalidCsrfLogout=await outsiderLogout({csrf:randomBytes(32).toString('base64url')});
 assert.equal(invalidCsrfLogout.status,404,'invalid CSRF cannot force account logout');
 assert.equal(invalidCsrfLogout.headers.get('set-cookie'),null);
 const preLogout=await db.query('SELECT revoked_at FROM sessions WHERE id=$1',
  [outsiderSessionId]);
 assert.equal(preLogout.rows[0].revoked_at,null,
  'denied logout requests must never change PostgreSQL session state');
 const confirmedLogout=await outsiderLogout();
 assert.equal(confirmedLogout.status,204,'confirmed logout must revoke live backend session');
 assert.match(confirmedLogout.headers.get('cache-control')??'',/no-store/i);
 assert.match(confirmedLogout.headers.get('x-robots-tag')??'',/noindex/i);
 const clearCookie=confirmedLogout.headers.get('set-cookie')??'';
 assert.match(clearCookie,/__Host-services_account_web=/);
 assert.match(clearCookie,/Max-Age=0/i);
 assert.match(clearCookie,/HttpOnly/i);
 assert.match(clearCookie,/Secure/i);
 assert.ok(!clearCookie.includes(outsiderBearer),
  'logout response must not expose backend bearer');
 const loggedOutDb=await db.query('SELECT revoked_at FROM sessions WHERE id=$1',
  [outsiderSessionId]);
 assert.ok(loggedOutDb.rows[0].revoked_at instanceof Date,
  'successful logout must commit backend revocation before HTTP 204');
 const loggedOutDevices=await fetch(new URL('/api/account/sessions',base),{
  headers:{'Sec-Fetch-Site':'same-origin',Cookie:outsiderCookie},
  signal:AbortSignal.timeout(8000),redirect:'manual',
 });
 assert.equal(loggedOutDevices.status,503,
  'replayed old cookie must not authorize account inventory after logout');
 assert.deepEqual(await loggedOutDevices.json(),{code:'UNAVAILABLE'});
 const repeatLogout=await outsiderLogout();
 assert.equal(repeatLogout.status,503,
  'logout with stale cookie must not falsely report repeated backend success');
 assert.match(repeatLogout.headers.get('set-cookie')??'',/Max-Age=0/i,
  'failed backend logout still clears the local cookie');

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

  // Committing a notification intent is NOT provider delivery. No external
  // provider worker runs in this integration test, so a seller decision must
  // not fabricate a successful send or acknowledgement in PostgreSQL.
  const deliveryProof=await db.query(`
   SELECT n.state AS intent_state,n.attempts,
     d.state AS delivery_state,d.provider_ref,d.delivered_at,
     d.attempt_count
   FROM notification_intents n
   LEFT JOIN notification_deliveries d ON d.intent_id=n.id
   WHERE n.id=$1::uuid
  `,[notification.intent_id]);
  assert.ok(deliveryProof.rows.length>=1,
   'committed notification intent must be queryable');
  for(const delivery of deliveryProof.rows){
   assert.equal(delivery.intent_state,'PENDING',
    'seller decision alone must not mark the intent delivered');
   assert.equal(delivery.attempts,0,
    'no delivery worker must have attempted provider I/O');
   if(delivery.delivery_state!==null){
    assert.equal(delivery.delivery_state,'PENDING',
     'delivery row without provider worker cannot be marked sent');
    assert.equal(delivery.attempt_count,0);
    assert.equal(delivery.provider_ref,null);
    assert.equal(delivery.delivered_at,null);
   }
  }


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

 // A still-active other device must remain safe if the browser's own
 // backing PostgreSQL session is later revoked while its cookie remains valid.
 const postRevocationTargetId=randomUUID();
 const postRevocationBearer=randomBytes(32).toString('base64url');
 const postRevocationHash=createHmac('sha256',hmacKey)
  .update('services-session:v1\0').update(postRevocationBearer).digest('hex');
 await db.query(`INSERT INTO sessions(id,user_id,token_hash,family_id,expires_at)
  VALUES($1,$2,$3,$4,now()+interval '15 minutes')`,
  [postRevocationTargetId,userId,postRevocationHash,randomUUID()]);
 await db.query('UPDATE sessions SET revoked_at=now() WHERE id=$1',[sessionId]);
 const deniedRemoteFromRevoked=await revokeRequest(postRevocationTargetId);
 assert.equal(deniedRemoteFromRevoked.status,503,
  'expired backing auth must not revoke an active other session via sealed cookie');
 assert.match(deniedRemoteFromRevoked.headers.get('cache-control')??'',/no-store/i);
 assert.equal(deniedRemoteFromRevoked.headers.get('set-cookie'),null);
 const activeOther=await db.query('SELECT revoked_at FROM sessions WHERE id=$1',
  [postRevocationTargetId]);
 assert.equal(activeOther.rows[0].revoked_at,null,
  'revoked actor cannot change another session in committed PostgreSQL state');
 const revokedDevices=await fetch(new URL('/api/account/sessions',base),{
  headers:{'Sec-Fetch-Site':'same-origin',Cookie:cookie},
  signal:AbortSignal.timeout(8000),redirect:'manual',
 });
 assert.equal(revokedDevices.status,503,
  'revoked backing session must not grant device inventory despite a valid web cookie');
 assert.match(revokedDevices.headers.get('cache-control')??'',/no-store/i);
 assert.equal(revokedDevices.headers.get('set-cookie'),null);
 assert.deepEqual(await revokedDevices.json(),{code:'UNAVAILABLE'});
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
  await db.query('DELETE FROM sessions WHERE user_id=$1',[userId]).catch(()=>{});
  await db.query('DELETE FROM users WHERE id=$1',[userId]).catch(()=>{});
 }
 await db.end();
}
