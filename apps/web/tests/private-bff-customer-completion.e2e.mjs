import assert from 'node:assert/strict';
import {createHmac,randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {sealAccountWebSession} from '../src/lib/account-web-session-core.mjs';

// Run only against disposable CI database + test-only encrypted web sessions.
// Does not simulate OTP verification or authorize production login.
assert.equal(process.env.CI,'true');
assert.ok(process.env.RUNNER_TEMP);
const {Client}=createRequire(new URL('../../../services-back/package.json',import.meta.url))('pg');
const webKey=Buffer.from((await readFile(join(process.env.RUNNER_TEMP,
 'services-private-bff-account-key'),'utf8')).trim(),'base64');
const hmacKey=Buffer.from(process.env.ACCOUNT_SESSION_HMAC_KEY??'','base64');
assert.equal(webKey.length,32);
assert.equal(hmacKey.length,32);
const base=process.env.PRIVATE_BFF_TEST_BASE_URL??'http://127.0.0.1:3001';
const users=[randomUUID(),randomUUID(),randomUUID()];
const persons=[randomUUID(),randomUUID(),randomUUID()];
const sessions=[randomUUID(),randomUUID()];
const org=randomUUID(),def=randomUUID(),offer=randomUUID();
const owned=[randomUUID(),randomUUID()],foreign=randomUUID();
const bearer=[randomBytes(32).toString('base64url'),randomBytes(32).toString('base64url')];
const seal=bearer.map(token=>sealAccountWebSession(webKey,token,600));
const cookies=seal.map(s=>'__Host-services_account_web='+s.cookie);
const hashes=bearer.map(token=>createHmac('sha256',hmacKey)
 .update('services-session:v1\\0').update(token).digest('hex'));
const db=new Client({connectionString:process.env.DATABASE_URL});
const read=async cookie=>fetch(new URL('/ru/account/my-requests',base),{
 headers:{Cookie:cookie},redirect:'manual',signal:AbortSignal.timeout(8000),
});
const mutation=async({cookie=cookies[0],csrf=seal[0].csrf,id=owned[0],version=1,
 origin='https://services.example.test',site='same-origin'}={})=>fetch(
 new URL('/api/account/requests/'+id+'/complete',base),{
  method:'POST',redirect:'manual',signal:AbortSignal.timeout(8000),
  headers:{Cookie:cookie,Origin:origin,'Sec-Fetch-Site':site,
   'X-Services-CSRF':csrf,'If-Match':'"'+version+'"',
   'Content-Type':'application/json'},
  body:'{}',
 });
let connected=false,fixtureReady=false;
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
   [sessions[i],users[i],hashes[i],randomUUID()]);
 }
 await db.query(`INSERT INTO organizations(id,owner_person_id,slug,name,status)
  VALUES($1,$2,$3,'Customer journey seller','ACTIVE')`,
  [org,persons[2],'customer-e2e-'+randomUUID()]);
 await db.query(`INSERT INTO service_definitions(id,code,name)
  VALUES($1,$2,'Customer journey service')`,
  [def,'customer-e2e-'+randomUUID()]);
 await db.query(`INSERT INTO service_offers
  (id,definition_id,organization_id,title,status,delivery_mode,contacts)
  VALUES($1,$2,$3,'Customer journey offer','PUBLISHED','online','{}'::jsonb)`,
  [offer,def,org]);
 for(const [id,customer,status] of [
  [owned[0],persons[0],'ACCEPTED'],
  [owned[1],persons[0],'PENDING'],
  [foreign,persons[1],'ACCEPTED'],
 ]){
  await db.query(`INSERT INTO service_requests
   (id,offer_id,customer_person_id,source_context,
    seller_organization_id,status,accepted_at,note)
   VALUES($1,$2,$3,'ORGANIZATION',$4,$5::"RequestStatus",
    CASE WHEN $5='ACCEPTED' THEN now() ELSE NULL END,
    'SECRET JOURNEY NOTE')`,[id,offer,customer,org,status]);
 }
 fixtureReady=true;

 const page=await read(cookies[0]);
 assert.equal(page.status,200,'real Next.js page must read real customer inventory');
 assert.match(page.headers.get('cache-control')??'',/no-store/i);
 const html=await page.text();
 assert.match(html,/Мои заказы/);
 assert.match(html,/Принята/);
 assert.match(html,/Подтвердить завершение/);
 assert.ok(html.includes(owned[0].slice(0,8))&&html.includes(owned[1].slice(0,8)));
 assert.ok(!html.includes(foreign.slice(0,8)),'foreign request must be absent');
 assert.ok(!html.includes('SECRET JOURNEY NOTE'),'private note must never render');
 assert.ok(!html.includes(bearer[0]),'backend account bearer must never render');

 const strangerPage=await read(cookies[1]);
 assert.equal(strangerPage.status,200);
 const strangerHtml=await strangerPage.text();
 assert.ok(strangerHtml.includes(foreign.slice(0,8)));
 assert.ok(!strangerHtml.includes(owned[0].slice(0,8)));
 assert.equal((await read('')).status,404,'no account cookie must deny page');

 const deniedCsrf=await mutation({csrf:randomBytes(32).toString('base64url')});
 assert.equal(deniedCsrf.status,404);
 const deniedSite=await mutation({site:'cross-site'});
 assert.equal(deniedSite.status,404);
 const deniedForeign=await mutation({cookie:cookies[1],csrf:seal[1].csrf});
 assert.equal(deniedForeign.status,404,'foreign account must not complete owned request');
 const untouched=await db.query('SELECT status,version FROM service_requests WHERE id=$1',
  [owned[0]]);
 assert.deepEqual(untouched.rows[0],{status:'ACCEPTED',version:1});
 const noExperience=await db.query(
  'SELECT count(*)::int AS n FROM service_experiences WHERE request_id=$1',[owned[0]]);
 assert.equal(noExperience.rows[0].n,0);

 const completed=await mutation();
 assert.equal(completed.status,200,'CSRF-authenticated owner must confirm completion');
 assert.match(completed.headers.get('cache-control')??'',/no-store/i);
 assert.deepEqual(await completed.json(),
  {code:'COMPLETED',id:owned[0],version:2});
 const persisted=await db.query('SELECT status,version FROM service_requests WHERE id=$1',
  [owned[0]]);
 assert.deepEqual(persisted.rows[0],{status:'COMPLETED',version:2});
 const experiences=await db.query(
  'SELECT count(*)::int AS n FROM service_experiences WHERE request_id=$1',[owned[0]]);
 assert.equal(experiences.rows[0].n,1);
 const notices=await db.query(
  'SELECT count(*)::int AS n FROM notification_intents WHERE dedupe_key=$1',
  ['request-completed:seller:'+owned[0]]);
 assert.equal(notices.rows[0].n,1);
 const afterPage=await read(cookies[0]);
 assert.equal(afterPage.status,200);
 const afterHtml=await afterPage.text();
 assert.match(afterHtml,/Завершена/);
 assert.ok(afterHtml.includes(owned[0].slice(0,8)));

 const duplicate=await mutation();
 assert.equal(duplicate.status,409,'stale If-Match must deny duplicate confirmation');
 const oneExperience=await db.query(
  'SELECT count(*)::int AS n FROM service_experiences WHERE request_id=$1',[owned[0]]);
 assert.equal(oneExperience.rows[0].n,1);
 const pending=await mutation({id:owned[1]});
 assert.equal(pending.status,409,'pending request cannot be completed');
 const unchanged=await db.query('SELECT status,version FROM service_requests WHERE id=$1',
  [owned[1]]);
 assert.deepEqual(unchanged.rows[0],{status:'PENDING',version:1});

 await db.query('UPDATE sessions SET revoked_at=now() WHERE id=$1',[sessions[0]]);
 const revoked=await mutation({id:owned[1]});
 assert.equal(revoked.status,503,'revoked bearer must never reach mutation');
 assert.equal((await read(cookies[0])).status,404,
  'revoked account session must deny page on server render');
 console.log('Current frontend/backend live customer list -> complete -> refreshed status PASS');
}finally{
 if(connected){
  if(fixtureReady){
   const requestIds=[...owned,foreign];
   await db.query(`DELETE FROM notification_intents WHERE domain_event_id IN
    (SELECT id FROM domain_outbox_events WHERE subject_id=ANY($1::uuid[]))`,
    [requestIds]).catch(()=>{});
   await db.query('DELETE FROM service_experiences WHERE request_id=ANY($1::uuid[])',
    [requestIds]).catch(()=>{});
   await db.query('DELETE FROM domain_outbox_events WHERE subject_id=ANY($1::uuid[])',
    [requestIds]).catch(()=>{});
   await db.query('DELETE FROM service_request_events WHERE request_id=ANY($1::uuid[])',
    [requestIds]).catch(()=>{});
   await db.query('DELETE FROM service_requests WHERE id=ANY($1::uuid[])',
    [requestIds]).catch(()=>{});
   await db.query('DELETE FROM service_offers WHERE id=$1',[offer]).catch(()=>{});
   await db.query('DELETE FROM organizations WHERE id=$1',[org]).catch(()=>{});
   await db.query('DELETE FROM service_definitions WHERE id=$1',[def]).catch(()=>{});
  }
  await db.query('DELETE FROM sessions WHERE id=ANY($1::uuid[])',[sessions]).catch(()=>{});
  await db.query('DELETE FROM persons WHERE id=ANY($1::uuid[])',[persons]).catch(()=>{});
  await db.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[users]).catch(()=>{});
  await db.end();
 }
}
