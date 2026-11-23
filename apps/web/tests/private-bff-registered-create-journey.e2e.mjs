import assert from 'node:assert/strict';
import {createHmac,randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {sealAccountWebSession} from '../src/lib/account-web-session-core.mjs';
import {exerciseRegisteredCreateChromeRetry} from './helpers/registered-customer-create-chrome.mjs';

// Disposable real Next.js -> HTTPS backend -> PostgreSQL evidence only.
// CI intentionally inserts isolated fixture sessions, NOT real OTP login.
assert.equal(process.env.CI,'true');
assert.ok(process.env.RUNNER_TEMP);
const {Client}=createRequire(new URL('../../../services-back/package.json',import.meta.url))('pg');
const webKey=Buffer.from((await readFile(join(process.env.RUNNER_TEMP,
 'services-private-bff-account-key'),'utf8')).trim(),'base64');
const hmacKey=Buffer.from(process.env.ACCOUNT_SESSION_HMAC_KEY??'','base64');
assert.equal(webKey.length,32);
assert.equal(hmacKey.length,32);
const base=process.env.PRIVATE_BFF_TEST_BASE_URL??'http://127.0.0.1:3001';
const token=randomBytes(32).toString('base64url');
const foreignToken=randomBytes(32).toString('base64url');
const sealed=sealAccountWebSession(webKey,token,600);
const foreignSealed=sealAccountWebSession(webKey,foreignToken,600);
const cookie=s=>'__Host-services_account_web='+s.cookie;
const hash=value=>createHmac('sha256',hmacKey)
 .update('services-session:v1\0').update(value).digest('hex');
const users=[randomUUID(),randomUUID(),randomUUID()];
const persons=[randomUUID(),randomUUID(),randomUUID()];
const sessions=[randomUUID(),randomUUID()];
const organization=randomUUID(),definition=randomUUID(),offer=randomUUID();
const idem='registered_e2e_'+randomUUID().replace(/-/g,'');
const body={service_offer_id:offer,note:'CI SECRET REGISTERED NOTE',consent_to_contact:true};
const db=new Client({connectionString:process.env.DATABASE_URL});
const requestIds=[];
let connected=false;
const submit=({session=sealed,csrf=session.csrf,origin='https://services.example.test',
 site='same-origin',key=idem,payload=body}={})=>fetch(
 new URL('/api/account/requests',base),{
  method:'POST',redirect:'manual',signal:AbortSignal.timeout(8000),
  headers:{Cookie:cookie(session),Origin:origin,'Sec-Fetch-Site':site,
   'X-Services-CSRF':csrf,'Idempotency-Key':key,'Content-Type':'application/json'},
  body:JSON.stringify(payload),
 });
async function inventory(session=sealed){
 return fetch(new URL('/ru/account/my-requests',base),{
  headers:{Cookie:cookie(session),'Sec-Fetch-Site':'same-origin'},
  redirect:'manual',signal:AbortSignal.timeout(8000),
 });
}
try{
 await db.connect();connected=true;
 for(let i=0;i<3;i++){
  await db.query('INSERT INTO users(id) VALUES($1)',[users[i]]);
  await db.query('INSERT INTO persons(id,user_id) VALUES($1,$2)',
   [persons[i],users[i]]);
 }
 for(let i=0;i<2;i++){
  await db.query(`INSERT INTO sessions(id,user_id,token_hash,family_id,expires_at)
   VALUES($1,$2,$3,$4,now()+interval '15 minutes')`,
   [sessions[i],users[i],hash(i===0?token:foreignToken),randomUUID()]);
 }
 await db.query(`INSERT INTO organizations(id,owner_person_id,slug,name,status)
  VALUES($1,$2,$3,'Registered E2E seller','ACTIVE')`,
  [organization,persons[2],'registered-e2e-'+randomUUID()]);
 await db.query(`INSERT INTO service_definitions(id,code,name)
  VALUES($1,$2,'Registered customer E2E')`,
  [definition,'registered-e2e-'+randomUUID()]);
 await db.query(`INSERT INTO service_offers
  (id,definition_id,organization_id,title,status,delivery_mode,contacts)
  VALUES($1,$2,$3,'Registered request E2E offer','PUBLISHED','online','{}'::jsonb)`,
  [offer,definition,organization]);

 const validPage=await fetch(new URL('/ru/services/'+offer,base),{
  headers:{Cookie:cookie(sealed)},redirect:'manual',signal:AbortSignal.timeout(8000),
 });
 assert.equal(validPage.status,200,'valid account should access published offer');
 const offerHtml=await validPage.text();
 assert.match(offerHtml,/Оставить заявку/,
  'authenticated SSR must render registered request create form');
 assert.ok(!offerHtml.includes(token)&&!offerHtml.includes(body.note),
  'backend bearer and note never appear in public offer HTML');
 const foreignPage=await fetch(new URL('/ru/services/'+offer,base),{
  redirect:'manual',signal:AbortSignal.timeout(8000),
 });
 assert.ok(!(await foreignPage.text()).includes('Оставить заявку'),
  'anonymous offer page must not render account create form');

 await exerciseRegisteredCreateChromeRetry({
  base,offer,sealedCookie:sealed.cookie,
 });
 const csrfDenied=await submit({csrf:randomBytes(32).toString('base64url')});
 assert.equal(csrfDenied.status,404,'invalid CSRF must deny before backend call');
 const siteDenied=await submit({site:'cross-site'});
 assert.equal(siteDenied.status,404,'cross-site request is forbidden');
 const originDenied=await submit({origin:'https://attacker.example.test'});
 assert.equal(originDenied.status,404,'foreign origin is forbidden');
 const tampered=await submit({payload:{...body,customer_person_id:persons[1]}});
 assert.equal(tampered.status,400,'customer person must never be client-selectable');
 let counts=await db.query(
  'SELECT count(*)::text AS n FROM service_requests WHERE offer_id=$1',[offer]);
 assert.equal(counts.rows[0]?.n,'0','denied requests must cause no creation');

 const first=await submit();
 assert.equal(first.status,201,'real browser BFF must create through live backend');
 assert.match(first.headers.get('cache-control')??'',/no-store/i);
 assert.equal(first.headers.get('set-cookie'),null);
 const receipt=await first.json();
 assert.deepEqual(Object.keys(receipt).sort(),['code','id','version']);
 assert.equal(receipt.code,'CREATED');
 assert.equal(receipt.version,1);
 assert.match(receipt.id,/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 requestIds.push(receipt.id);
 const replay=await submit();
 assert.equal(replay.status,201);
 assert.deepEqual(await replay.json(),receipt,'same key must replay the committed receipt');
 const changed=await submit({payload:{...body,note:'Changed'}});
 assert.equal(changed.status,409,'same key different payload must conflict');

 const request=await db.query(`
  SELECT customer_person_id::text,guest_contact_id::text,
   seller_organization_id::text,status::text,version
  FROM service_requests WHERE id=$1`,[receipt.id]);
 assert.equal(request.rows[0]?.customer_person_id,persons[0]);
 assert.equal(request.rows[0]?.guest_contact_id,null);
 assert.equal(request.rows[0]?.seller_organization_id,organization);
 assert.equal(request.rows[0]?.status,'PENDING');
 assert.equal(request.rows[0]?.version,1);
 const effects=await db.query(`
  SELECT
   (SELECT count(*)::int FROM service_request_events
    WHERE request_id=$1 AND kind='CREATED') AS audits,
   (SELECT count(*)::int FROM domain_outbox_events
    WHERE subject_id=$1 AND topic='service_request.created') AS outbox,
   (SELECT count(*)::int FROM notification_intents
    WHERE dedupe_key=$2) AS notices`,
  [receipt.id,'request-created:seller:'+receipt.id]);
 assert.deepEqual(effects.rows[0],{audits:1,outbox:1,notices:1});

 // Exercise the exact optional-comment behavior of the localized form:
 // an empty editor sends JSON note:null, not an empty or invented note.
 const blankPayload={service_offer_id:offer,note:null,consent_to_contact:true};
 const blankKey='registered_null_'+randomUUID().replace(/-/g,'');
 const blankResponse=await submit({key:blankKey,payload:blankPayload});
 assert.equal(blankResponse.status,201,'empty comment must create through real BFF');
 const blankReceipt=await blankResponse.json();
 assert.equal(blankReceipt.code,'CREATED');
 assert.equal(blankReceipt.version,1);
 assert.notEqual(blankReceipt.id,receipt.id);
 requestIds.push(blankReceipt.id);
 const blankReplay=await submit({key:blankKey,payload:blankPayload});
 assert.equal(blankReplay.status,201);
 assert.deepEqual(await blankReplay.json(),blankReceipt);
 const blankStored=await db.query(`
  SELECT customer_person_id::text, note FROM service_requests
  WHERE id=$1::uuid
 `,[blankReceipt.id]);
 assert.equal(blankStored.rows[0]?.customer_person_id,persons[0]);
 assert.equal(blankStored.rows[0]?.note,null,'empty note persists as SQL NULL');
 const blankEffects=await db.query(`
  SELECT
   (SELECT count(*)::int FROM service_request_events
    WHERE request_id=$1 AND kind='CREATED') AS audits,
   (SELECT count(*)::int FROM domain_outbox_events
    WHERE subject_id=$1 AND topic='service_request.created') AS outbox,
   (SELECT count(*)::int FROM notification_intents
    WHERE dedupe_key=$2) AS notices
 `,[blankReceipt.id,'request-created:seller:'+blankReceipt.id]);
 assert.deepEqual(blankEffects.rows[0],{audits:1,outbox:1,notices:1},
  'null-note retry must not duplicate audit, outbox or notification');

 const own=await inventory();
 assert.equal(own.status,200,'real customer request inventory must load');
 const ownHtml=await own.text();
 assert.ok(ownHtml.includes(receipt.id.slice(0,8))&&
  ownHtml.includes(blankReceipt.id.slice(0,8)),
  'both noted and blank-note requests must appear in owner inventory');
 assert.ok(!ownHtml.includes(body.note)&&!ownHtml.includes(token),
  'private note and bearer must not appear in inventory');
 const foreign=await inventory(foreignSealed);
 assert.equal(foreign.status,200);
 const foreignHtml=await foreign.text();
 assert.ok(!foreignHtml.includes(receipt.id.slice(0,8))&&
  !foreignHtml.includes(blankReceipt.id.slice(0,8)),
  'foreign account must not see either customer request');

 // Five persisted account requests inside the last minute exhaust the
 // backend ceiling. These CI-only rows never represent provider activity.
 for(let i=0;i<3;i++){
  const seeded=randomUUID();
  requestIds.push(seeded);
  await db.query(`
   INSERT INTO service_requests
    (id,offer_id,customer_person_id,source_context,
     seller_organization_id,status,note)
   VALUES($1::uuid,$2::uuid,$3::uuid,'ORGANIZATION',$4::uuid,
    'PENDING',NULL)
  `,[seeded,offer,persons[0],organization]);
 }
 const blockedKey='registered_budget_'+randomUUID().replace(/-/g,'');
 const blocked=await submit({key:blockedKey});
 assert.equal(blocked.status,429,'account ceiling must surface a sanitized 429');
 assert.deepEqual(await blocked.json(),{code:'RATE_LIMITED'});
 assert.match(blocked.headers.get('cache-control')??'',/no-store/);
 assert.equal(blocked.headers.get('set-cookie'),null);
 // A previously committed idempotency key must still recover the original
 // receipt at the limit, even if another newer key is denied.
 const replayAtBudget=await submit();
 assert.equal(replayAtBudget.status,201);
 assert.deepEqual(await replayAtBudget.json(),receipt);
 const blockedLedger=await db.query(`
  SELECT count(*)::text AS n FROM idempotency_records
  WHERE actor_scope=$1 AND route='/account/requests' AND key=$2
 `,['account:'+persons[0],blockedKey]);
 assert.equal(blockedLedger.rows[0]?.n,'0',
  'a budget denial may not create a successful replay ledger');

 await db.query('UPDATE sessions SET revoked_at=now() WHERE id=$1',[sessions[0]]);
 const revoked=await submit({key:'registered_revoked_'+randomUUID().replace(/-/g,'')});
 assert.equal(revoked.status,503,'revoked bearer must never report creation success');
 const revokedList=await inventory();
 assert.ok([200,404].includes(revokedList.status),
  'Next streaming notFound can return HTTP 200');
 const revokedHtml=await revokedList.text();
 assert.match(revokedHtml,/noindex/i);
 assert.ok(!revokedHtml.includes(receipt.id.slice(0,8)),
  'revoked session must not reveal private request inventory');
 counts=await db.query(
  'SELECT count(*)::text AS n FROM service_requests WHERE offer_id=$1',[offer]);
 assert.equal(counts.rows[0]?.n,'5',
  'budget rejection and revocation cannot create a sixth request');
 console.log('Registered customer Next.js -> BFF -> backend -> PostgreSQL -> own inventory PASS');
}finally{
 if(connected){
  // CI-only disposable fixtures; delete dependent events before request rows.
  await db.query(`DELETE FROM notification_intents
   WHERE domain_event_id IN
    (SELECT id FROM domain_outbox_events WHERE subject_id=ANY($1::uuid[]))`,
   [requestIds]).catch(()=>{});
  await db.query('DELETE FROM domain_outbox_events WHERE subject_id=ANY($1::uuid[])',
   [requestIds]).catch(()=>{});
  await db.query('DELETE FROM service_request_events WHERE request_id=ANY($1::uuid[])',
   [requestIds]).catch(()=>{});
  await db.query('DELETE FROM idempotency_records WHERE actor_scope=$1 AND route=$2',
   ['account:'+persons[0],'/account/requests']).catch(()=>{});
  await db.query('DELETE FROM service_requests WHERE id=ANY($1::uuid[])',
   [requestIds]).catch(()=>{});
  await db.query('DELETE FROM service_offers WHERE id=$1',[offer]).catch(()=>{});
  await db.query('DELETE FROM organizations WHERE id=$1',[organization]).catch(()=>{});
  await db.query('DELETE FROM service_definitions WHERE id=$1',[definition]).catch(()=>{});
  await db.query('DELETE FROM sessions WHERE id=ANY($1::uuid[])',[sessions]).catch(()=>{});
  await db.query('DELETE FROM persons WHERE id=ANY($1::uuid[])',[persons]).catch(()=>{});
  await db.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[users]).catch(()=>{});
  await db.end();
 }
}
