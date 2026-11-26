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
const sessions=[randomUUID(),randomUUID(),randomUUID()];
const sellerToken=randomBytes(32).toString('base64url');
const sellerSealed=sealAccountWebSession(webKey,sellerToken,600);
const sellerMemberId=randomUUID();
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
 for(let i=0;i<3;i++){
  await db.query(`INSERT INTO sessions(id,user_id,token_hash,family_id,expires_at)
   VALUES($1,$2,$3,$4,now()+interval '15 minutes')`,
   [sessions[i],users[i],hash([token,foreignToken,sellerToken][i]),randomUUID()]);
 }
 await db.query(`INSERT INTO organizations(id,owner_person_id,slug,name,status)
  VALUES($1,$2,$3,'Registered E2E seller','ACTIVE')`,
  [organization,persons[2],'registered-e2e-'+randomUUID()]);
 await db.query("INSERT INTO organization_members(id,organization_id,user_id,role) VALUES($1,$2,$3,'ADMIN')",[sellerMemberId,organization,users[2]]);
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

 // Continue the SAME newly created registered request, rather than a
 // separately inserted accepted row, through a real seller and owner session.
 const sellerInbox=await fetch(new URL('/api/seller/requests?limit=20',base),{
  headers:{Cookie:cookie(sellerSealed),'Sec-Fetch-Site':'same-origin'},
  redirect:'manual',signal:AbortSignal.timeout(8000),
 });
 assert.equal(sellerInbox.status,200,'seller must see newly created customer request');
 const sellerInventory=await sellerInbox.json();
 assert.ok(sellerInventory.items.some(row=>row.id===receipt.id&&
  row.state==='pending'&&row.version===1));
 assert.equal(sellerInventory.csrf_token,sellerSealed.csrf);
 const acceptKey=randomUUID();
 const accept=({csrf=sellerSealed.csrf,key=acceptKey,version=1}={})=>fetch(
  new URL('/api/seller/requests/'+receipt.id+'/accept',base),{
   method:'POST',redirect:'manual',signal:AbortSignal.timeout(8000),
   headers:{Cookie:cookie(sellerSealed),'Sec-Fetch-Site':'same-origin',
    Origin:'https://services.example.test','Content-Type':'application/json'},
   body:JSON.stringify({version,csrf_token:csrf,idempotency_key:key}),
  });
 assert.equal((await accept({csrf:randomBytes(32).toString('base64url')})).status,401,
  'forged seller CSRF cannot accept request');
 const accepted=await accept();
 assert.equal(accepted.status,200);
 assert.deepEqual(await accepted.json(),{outcome:'ok'});
 const replayed=await accept();
 assert.equal(replayed.status,200,'same seller idempotency key replays safely');
 assert.deepEqual(await replayed.json(),{outcome:'ok'});
 assert.deepEqual((await db.query('SELECT status,version FROM service_requests WHERE id=$1',
  [receipt.id])).rows[0],{status:'ACCEPTED',version:2});
 const acceptedOwn=await inventory();
 assert.equal(acceptedOwn.status,200);
 const acceptedHtml=await acceptedOwn.text();
 assert.match(acceptedHtml,/Принята/);
 assert.ok(acceptedHtml.includes(receipt.id.slice(0,8)));
 assert.match(acceptedHtml,/Подтвердить завершение/,
  'registered owner can confirm only after seller acceptance');

 // Acceptance creates a durable IN_APP intent, not an instant delivered message.
 // Verify the real BFF + backend inbox hides pending delivery and foreign accounts.
 const notifications=({session=sealed,site='same-origin'}={})=>fetch(
  new URL('/api/account/notifications',base),{
   headers:{Cookie:cookie(session),'Sec-Fetch-Site':site},
   redirect:'manual',signal:AbortSignal.timeout(8000),
  });
 const absent=await notifications();
 assert.equal(absent.status,200);
 assert.match(absent.headers.get('cache-control')??'',/no-store/);
 assert.deepEqual(await absent.json(),{items:[]},
  'notification intent is not delivered until a delivery materializes');
 const notice=await db.query(
  'SELECT id::text,state,channel,recipient_person_id::text FROM notification_intents WHERE dedupe_key=$1',
  ['request-accept:client:'+receipt.id]);
 assert.equal(notice.rows.length,1);
 assert.equal(notice.rows[0].channel,'IN_APP');
 assert.equal(notice.rows[0].recipient_person_id,persons[0]);
 assert.equal(notice.rows[0].state,'PENDING');
 const deliveryId=randomUUID();
 // Simulate the separately authorized in-app materializer's successful
 // database transition in this CI-only fixture. This is NOT SMS/email delivery.
 await db.query("INSERT INTO notification_deliveries(id,intent_id,channel,state,delivered_at) VALUES($1,$2,'IN_APP','DELIVERED',now())",
  [deliveryId,notice.rows[0].id]);
 await db.query("UPDATE notification_intents SET state='DELIVERED' WHERE id=$1",
  [notice.rows[0].id]);
 const recipient=await notifications();
 assert.equal(recipient.status,200,'owner inbox endpoint must be accessible');
 assert.match(recipient.headers.get('cache-control')??'',/no-store/);
 assert.match(recipient.headers.get('x-robots-tag')??'',/noindex/);
 assert.equal(recipient.headers.get('set-cookie'),null);
 const inbox=await recipient.json();
 assert.equal(inbox.items.length,1,'owner sees one delivered acceptance event');
 assert.equal(inbox.items[0].id,notice.rows[0].id);
 assert.equal(inbox.items[0].subject_id,receipt.id);
 assert.equal(inbox.items[0].topic,'service_request.accepted');
 assert.ok(!JSON.stringify(inbox).includes(token));
 assert.ok(!JSON.stringify(inbox).includes(body.note));
 const foreignNotices=await notifications({session:foreignSealed});
 assert.equal(foreignNotices.status,200);
 assert.deepEqual(await foreignNotices.json(),{items:[]},
  'another authenticated person cannot view the recipient inbox');
 assert.equal((await notifications({site:'cross-site'})).status,404);
 const notificationPage=await fetch(new URL('/ru/account/notifications',base),{
  headers:{Cookie:cookie(sealed)},redirect:'manual',signal:AbortSignal.timeout(8000),
 });
 assert.equal(notificationPage.status,200,'authenticated notification UI page exists');
 const notificationHtml=await notificationPage.text();
 assert.match(notificationHtml,/Уведомления/);
 assert.ok(!notificationHtml.includes(token)&&!notificationHtml.includes(body.note));


 // Keep the same registered request and prove both directions of schedule
 // negotiation over the real BFF and migrated PostgreSQL.
 const schedulePath='/api/account/requests/'+receipt.id+'/schedule-proposals';
 const active=(session=sealed)=>fetch(new URL(schedulePath+'/active',base),{
  headers:{Cookie:cookie(session),'Sec-Fetch-Site':'same-origin'},
  redirect:'manual',signal:AbortSignal.timeout(8000),
 });
 const schedule=({session=sealed,csrf=session.csrf,version,key=randomUUID(),suffix='',payload={}})=>fetch(
  new URL(schedulePath+suffix,base),{
   method:'POST',redirect:'manual',signal:AbortSignal.timeout(8000),
   headers:{Cookie:cookie(session),Origin:'https://services.example.test','Sec-Fetch-Site':'same-origin',
    'X-Services-CSRF':csrf,'If-Match':'"'+version+'"','Idempotency-Key':key,'Content-Type':'application/json'},
   body:JSON.stringify(payload),
  });
 const start=new Date(Date.now()+7*86400000);
 start.setUTCMinutes(0,0,0);
 const proposalBody={start_at:start.toISOString(),end_at:new Date(start.getTime()+3600000).toISOString(),
  timezone:'Asia/Almaty',local_start_at:new Date(start.getTime()+18000000).toISOString().slice(0,19),
  utc_offset_seconds:18000};
 assert.equal((await active(foreignSealed)).status,404);
 const emptySchedule=await active();
 assert.equal(emptySchedule.status,200);
 assert.match(emptySchedule.headers.get('cache-control')??'',/no-store/);
 assert.deepEqual(await emptySchedule.json(),{request_id:receipt.id,request_version:2,actor:'customer',can_propose:true,proposal:null});
 assert.equal((await schedule({session:sellerSealed,csrf:randomBytes(32).toString('base64url'),version:2,payload:proposalBody})).status,404);
 assert.equal((await schedule({session:foreignSealed,version:2,payload:proposalBody})).status,404);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM schedule_proposals WHERE request_id=$1',[receipt.id])).rows[0].n,0);
 const proposeKey=randomUUID();
 const proposedResponse=await schedule({session:sellerSealed,version:2,key:proposeKey,payload:proposalBody});
 assert.equal(proposedResponse.status,201);
 const proposed=await proposedResponse.json();
 assert.equal(proposed.initiator,'seller');
 assert.equal(proposed.request_version,3);
 const replayProposal=await schedule({session:sellerSealed,version:2,key:proposeKey,payload:proposalBody});
 assert.equal(replayProposal.status,201);
 assert.deepEqual(await replayProposal.json(),{...proposed,replayed:true});
 const customerView=await active();
 assert.equal(customerView.status,200);
 const view=await customerView.json();
 assert.equal(view.proposal.id,proposed.id);
 assert.equal(view.proposal.can_resolve,true);
 assert.equal((await (await active(sellerSealed)).json()).proposal.can_resolve,false);
 const confirmPath='/'+proposed.id+'/confirm';
 assert.equal((await schedule({session:sellerSealed,version:3,suffix:confirmPath})).status,409);
 assert.equal((await schedule({version:2,suffix:confirmPath})).status,409);
 assert.equal((await schedule({session:foreignSealed,version:3,suffix:confirmPath})).status,404);
 assert.equal((await db.query('SELECT version FROM service_requests WHERE id=$1',[receipt.id])).rows[0].version,3);
 const confirmKey=randomUUID();
 const confirmation=await schedule({version:3,key:confirmKey,suffix:confirmPath});
 assert.equal(confirmation.status,200);
 const confirmedSchedule=await confirmation.json();
 assert.equal(confirmedSchedule.status,'confirmed');
 assert.equal(confirmedSchedule.request_version,4);
 const confirmReplay=await schedule({version:3,key:confirmKey,suffix:confirmPath});
 assert.equal(confirmReplay.status,200);
 assert.deepEqual(await confirmReplay.json(),{...confirmedSchedule,replayed:true});
 assert.equal((await (await active()).json()).proposal,null);
 const persisted=await db.query('SELECT version,scheduled_start_at,scheduled_end_at FROM service_requests WHERE id=$1',[receipt.id]);
 assert.equal(persisted.rows[0].version,4);
 assert.equal(persisted.rows[0].scheduled_start_at.toISOString(),proposalBody.start_at);
 assert.equal(persisted.rows[0].scheduled_end_at.toISOString(),proposalBody.end_at);
 const counter=await schedule({version:4,payload:proposalBody});
 assert.equal(counter.status,201);
 const customerProposal=await counter.json();
 assert.equal(customerProposal.initiator,'customer');
 assert.equal(customerProposal.request_version,5);
 assert.equal((await (await active(sellerSealed)).json()).proposal.can_resolve,true);
 // Exercise the actual hydrated seller controls, with no mocked fetch.
 await exerciseRegisteredCreateChromeRetry({base:'http://127.0.0.1:3011',offer,sealedCookie:sellerSealed.cookie,
  scheduleScenario:async({send,evaluate,pause})=>{
   await send('Emulation.setDeviceMetricsOverride',{width:375,height:740,deviceScaleFactor:1,mobile:true});
   await send('Page.navigate',{url:new URL('/ru/account/requests','http://127.0.0.1:3011').href});

   const row="Array.from(document.querySelectorAll('li')).find(el=>el.querySelector('button')&&el.textContent.includes('Registered request E2E offer')&&Array.from(el.querySelectorAll('button')).some(b=>b.textContent==='Посмотреть предложения времени'))";
   let opened=false;
   for(let i=0;i<100;i++){
    try{
     opened=await evaluate("(()=>{const r="+row+";const b=r&&Array.from(r.querySelectorAll('button')).find(b=>b.textContent==='Посмотреть предложения времени');if(!b||b.disabled)return false;b.click();return true;})()");
    }catch{}
    if(opened)break;
    await pause(100);
   }
   assert.equal(opened,true,'hydrated seller row must expose schedule panel');
   // Observe the actual browser fetch without mocking any response.
   // The CI proxy below rewrites Origin only on the schedule mutation.
   await evaluate(`(()=>{const original=window.fetch.bind(window);window.__scheduleResult=null;
    window.fetch=async (url,options={})=>{
     const response=await original(url,options);
     if(typeof url==='string'&&url.endsWith('/decline')&&options.method==='POST')
      window.__scheduleResult={status:response.status};
     return response;
    };return true;})()`);
   let resolved=false;
   for(let i=0;i<100;i++){
    try{
     resolved=await evaluate("(()=>{const r="+row+";const section=r&&Array.from(r.querySelectorAll('section')).find(s=>s.textContent.includes('Активное предложение времени')&&s.textContent.includes('Предложение клиента'));const b=section&&Array.from(section.querySelectorAll('button')).find(b=>b.textContent==='Отклонить');if(!b||b.disabled)return false;b.click();return true;})()");
    }catch{}
    if(resolved)break;
    await pause(100);
   }
   assert.equal(resolved,true,'seller must be able to decline a customer proposal through React');

   let committed=false;
   for(let i=0;i<100;i++){
    const current=await db.query('SELECT version FROM service_requests WHERE id=$1',[receipt.id]);
    if(current.rows[0]?.version===6){committed=true;break;}
    await pause(100);
   }
   const browserResult=await evaluate('window.__scheduleResult');
   assert.equal(committed,true,'actual browser click must commit through BFF and PostgreSQL; HTTP status='+JSON.stringify(browserResult));
   console.log('Real Chrome seller schedule decline -> BFF -> PostgreSQL PASS');
  },
 });
 assert.deepEqual((await db.query('SELECT status::text,version FROM service_requests WHERE id=$1',[receipt.id])).rows[0],{status:'ACCEPTED',version:6});
 assert.equal((await (await active()).json()).proposal,null);
 const proposalStates=await db.query('SELECT status::text FROM schedule_proposals WHERE request_id=$1 ORDER BY revision',[receipt.id]);
 assert.deepEqual(proposalStates.rows,[{status:'CONFIRMED'},{status:'DECLINED'}]);
 const scheduleEffects=await db.query("SELECT topic,count(*)::int AS n FROM domain_outbox_events WHERE subject_id=$1 AND topic LIKE 'service_request.schedule_%' GROUP BY topic ORDER BY topic",[receipt.id]);
 assert.deepEqual(scheduleEffects.rows,[{topic:'service_request.schedule_confirmed',n:1},{topic:'service_request.schedule_declined',n:1},{topic:'service_request.schedule_proposed',n:2}]);
 console.log('Registered bilateral schedule BFF -> backend -> PostgreSQL PASS');

 const finish=({session=sealed,csrf=session.csrf,version=6}={})=>fetch(
  new URL('/api/account/requests/'+receipt.id+'/complete',base),{
   method:'POST',redirect:'manual',signal:AbortSignal.timeout(8000),
   headers:{Cookie:cookie(session),'Sec-Fetch-Site':'same-origin',
    Origin:'https://services.example.test','Content-Type':'application/json',
    'X-Services-CSRF':csrf,'If-Match':'"'+version+'"'},
   body:'{}',
  });
 assert.equal((await finish({csrf:randomBytes(32).toString('base64url')})).status,404);
 assert.equal((await finish({session:foreignSealed})).status,404,
  'foreign account cannot complete another owner request');
 // Denials must leave both the state and durable effects untouched, not
 // merely return an error to the browser.
 assert.deepEqual((await db.query('SELECT status,version FROM service_requests WHERE id=$1',
  [receipt.id])).rows[0],{status:'ACCEPTED',version:6});
 const deniedCompletionEffects=await db.query(`
  SELECT
   (SELECT count(*)::int FROM service_experiences WHERE request_id=$1) AS experiences,
   (SELECT count(*)::int FROM domain_outbox_events
    WHERE subject_id=$1 AND topic='service_request.completed') AS outbox,
   (SELECT count(*)::int FROM notification_intents WHERE dedupe_key=$2) AS notices
 `,[receipt.id,'request-completed:seller:'+receipt.id]);
 assert.deepEqual(deniedCompletionEffects.rows[0],{experiences:0,outbox:0,notices:0},
  'forged CSRF and foreign account completion must leave no durable effects');
 const confirmed=await finish();
 assert.equal(confirmed.status,200,'registered owner confirms the accepted request');
 assert.match(confirmed.headers.get('cache-control')??'',/no-store/);
 assert.deepEqual(await confirmed.json(),{code:'COMPLETED',id:receipt.id,version:7});
 assert.deepEqual((await db.query('SELECT status,version FROM service_requests WHERE id=$1',
  [receipt.id])).rows[0],{status:'COMPLETED',version:7});
 assert.equal((await finish()).status,409,'stale confirmation cannot commit twice');
 assert.equal((await db.query('SELECT count(*)::int AS n FROM service_experiences WHERE request_id=$1',
  [receipt.id])).rows[0].n,1,'completion creates exactly one experience');
 const finishedOwn=await inventory();
 assert.equal(finishedOwn.status,200);
 const finishedHtml=await finishedOwn.text();
 assert.match(finishedHtml,/Завершена/);
 assert.ok(finishedHtml.includes(receipt.id.slice(0,8)));
 assert.ok(!finishedHtml.includes(token)&&!finishedHtml.includes(body.note));
 const events=await db.query('SELECT topic,safe_payload FROM domain_outbox_events WHERE subject_id=$1',
  [receipt.id]);
 assert.deepEqual(new Set(events.rows.map(row=>row.topic)),
  new Set(['service_request.created','service_request.accepted','service_request.completed','service_request.schedule_proposed','service_request.schedule_confirmed','service_request.schedule_declined']));
 assert.ok(events.rows.every(row=>!JSON.stringify(row.safe_payload).includes(body.note)&&!JSON.stringify(row.safe_payload).includes(token)),
  'outbox excludes private customer request note');
 for(const prefix of ['request-created:seller:','request-accept:client:','request-completed:seller:']){
  const intent=await db.query('SELECT count(*)::int AS n FROM notification_intents WHERE dedupe_key=$1',
   [prefix+receipt.id]);
  assert.equal(intent.rows[0].n,1,'one notification intent for '+prefix);
 }
 console.log('Registered full E2E: public offer -> CREATE -> seller ACCEPT -> owner COMPLETE -> fresh inventory PASS');

 await db.query('UPDATE sessions SET revoked_at=now() WHERE id=$1',[sessions[0]]);
 const revoked=await submit({key:'registered_revoked_'+randomUUID().replace(/-/g,'')});
 assert.equal(revoked.status,503,'revoked bearer must never report creation success');
 const revokedNotifications=await notifications();
 assert.equal(revokedNotifications.status,401,
  'revoked account session must not access delivered IN_APP notifications');
 assert.deepEqual(await revokedNotifications.json(),{code:'AUTH_REQUIRED'});
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
  await db.query(`DELETE FROM notification_deliveries WHERE intent_id IN
    (SELECT id FROM notification_intents WHERE domain_event_id IN
     (SELECT id FROM domain_outbox_events WHERE subject_id=ANY($1::uuid[])))`,
   [requestIds]).catch(()=>{});
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
  await db.query('DELETE FROM service_experiences WHERE request_id=ANY($1::uuid[])',[requestIds]).catch(()=>{});
  await db.query('DELETE FROM cancellation_snapshot_revisions WHERE request_id=ANY($1::uuid[])',[requestIds]).catch(()=>{});
  await db.query('DELETE FROM cancellation_snapshots WHERE request_id=ANY($1::uuid[])',[requestIds]).catch(()=>{});
  await db.query('DELETE FROM schedule_proposals WHERE request_id=ANY($1::uuid[])',[requestIds]).catch(()=>{});
  await db.query("DELETE FROM idempotency_records WHERE actor_scope=ANY($1::text[]) AND route LIKE '%/schedule-proposals%'",[users.map(id=>'user:'+id)]).catch(()=>{});
  await db.query('DELETE FROM service_requests WHERE id=ANY($1::uuid[])',
   [requestIds]).catch(()=>{});
  await db.query('DELETE FROM service_offers WHERE id=$1',[offer]).catch(()=>{});
  await db.query('DELETE FROM organization_members WHERE id=$1',[sellerMemberId]).catch(()=>{});
  await db.query('DELETE FROM organizations WHERE id=$1',[organization]).catch(()=>{});
  await db.query('DELETE FROM service_definitions WHERE id=$1',[definition]).catch(()=>{});
  await db.query('DELETE FROM sessions WHERE id=ANY($1::uuid[])',[sessions]).catch(()=>{});
  await db.query('DELETE FROM persons WHERE id=ANY($1::uuid[])',[persons]).catch(()=>{});
  await db.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[users]).catch(()=>{});
  await db.end();
 }
}
