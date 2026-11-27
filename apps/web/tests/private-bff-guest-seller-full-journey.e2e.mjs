import assert from 'node:assert/strict';
import {createCipheriv,createHmac,randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
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
  VALUES($1,$2,$3,'CI seller offer','PUBLISHED','online','{"methods":["guest_request"]}'::jsonb)`,
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
 // Independently prove scoped MANAGE_SCHEDULE OTP before completion.
 const scheduleAccess='/api/guest-requests/'+createdRequest+'/schedule-access';
 const scheduleUrl='/api/guest-requests/'+createdRequest+'/schedule-proposals';
 const signNetwork=()=>{
  const ts=String(Date.now());
  return 'v1.'+networkDigest+'.'+ts+'.'+createHmac('sha256',networkKey)
   .update('services-otp-network:v1\n').update(networkDigest).update('\n').update(ts).digest('hex');
 };
 const schedulePost=(path,payload,cookie=accessCookie,extra={})=>fetch(new URL(path,completionBase),{
  method:'POST',redirect:'manual',signal:AbortSignal.timeout(8000),
  headers:{'Content-Type':'application/json',Origin:'https://services.example.test',
   'Sec-Fetch-Site':'same-origin',Cookie:cookie,'X-Services-CSRF':guestCsrf,...extra},
  body:JSON.stringify(payload),
 });
 const scheduleBootstrap=await fetch(new URL(scheduleAccess+'/bootstrap',completionBase),{
  headers:{'Sec-Fetch-Site':'same-origin',Cookie:accessCookie},redirect:'manual',signal:AbortSignal.timeout(8000),
 });
 assert.equal(scheduleBootstrap.status,200);
 assert.deepEqual(await scheduleBootstrap.json(),{csrf_token:guestCsrf});
 assert.notEqual((await schedulePost(scheduleUrl+'/active',{})).status,200,'READ_CANCEL cannot read schedule');
 let scheduleChallenge,scheduleCookie,proposed,offered;
 // Verify real Chrome can carry the scoped HttpOnly cookies through the
 // isolated browser ingress. This is a browser transport gate, not UI acceptance.
 const {spawn}=await import('node:child_process');
 const {mkdtemp,rm}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');
 const profile=await mkdtemp(join(tmpdir(),'services-guest-chrome-'));
 const browser=spawn(process.env.CHROME_BIN??'google-chrome',[
  '--headless=new','--no-sandbox','--disable-dev-shm-usage',
  '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank',
 ],{stdio:'ignore'});
 let ws;
 try{
  let port;
  for(let i=0;i<200&&!port;i++){
   try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);}catch{}
   if(!port)await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(port,'guest Chrome DevTools startup');
  const targets=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  ws=new WebSocket(targets.find(x=>x.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  let sequence=0;
  const send=(method,params={})=>new Promise((resolve,reject)=>{
   const id=++sequence;
   const timer=setTimeout(()=>{ws.removeEventListener('message',receive);reject(Error('Chrome timeout: '+method));},10000);
   function receive(event){const response=JSON.parse(event.data);if(response.id!==id)return;
    clearTimeout(timer);ws.removeEventListener('message',receive);
    if(response.error)reject(Error(response.error.message));else resolve(response.result);}
   ws.addEventListener('message',receive);ws.send(JSON.stringify({id,method,params}));
  });
  const ingress='http://127.0.0.1:3013';
  for(const cookie of [accessCookie]){
   const separator=cookie.indexOf('=');
   const result=await send('Network.setCookie',{name:cookie.slice(0,separator),value:cookie.slice(separator+1),
    url:ingress,path:'/',secure:true,httpOnly:true,sameSite:'Strict'});
   assert.equal(result.success,true);
  }
  await send('Page.navigate',{url:ingress+'/kk'});
  const evaluate=async expression=>{
   const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
   assert.ok(!result.exceptionDetails,'guest Chrome evaluation failed');return result.result.value;
  };
  let ready=false;
  for(let i=0;i<100&&!ready;i++){
   try{ready=await evaluate('location.origin==='+JSON.stringify(ingress)+'&&document.readyState==="complete"');}catch{}
   if(!ready)await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.equal(ready,true);
  // The browser receives and stores both OTP cookies from actual HTTP responses.
  // Only the initial request cookie is seeded by the fixture.
  const browserPost=async(path,payload,extra={})=>evaluate(`(async()=>{
   const response=await fetch(${JSON.stringify(path)},{method:'POST',
    headers:${JSON.stringify({'Content-Type':'application/json','X-Services-CSRF':guestCsrf,...extra})},
    body:${JSON.stringify(JSON.stringify(payload))}});
   return {status:response.status,body:await response.json()};
  })()`);
  // Exercise initial OTP in a separate disposable contact, without seeding
  // its challenge or CREATE_REQUEST cookie. Preserve the existing lifecycle.
  // Verify the actual published offer page exposes the real guest wizard.
  await send('Page.navigate',{url:ingress+'/kk/services/'+ids.offer});
  let wizardReady=false;
  for(let i=0;i<100&&!wizardReady;i++){
   try{wizardReady=await evaluate('location.pathname==='+JSON.stringify('/kk/services/'+ids.offer)+'&&document.readyState==="complete"&&!!document.querySelector("#guest-contact")');}catch{}
   if(!wizardReady)await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.equal(wizardReady,true,'published offer exposes guest request form');
  assert.equal(await evaluate('document.querySelector("#guest-contact").type'),'tel');
  assert.ok(await evaluate('Array.from(document.querySelectorAll("button")).some(b=>b.textContent.trim()==="Жалғастыру")'));
  console.log('Live CI Chrome published offer guest wizard render PASS');
  const initialContact='ci-create-'+randomBytes(8).toString('hex')+'@example.org';
  // Drive real React controls instead of calling the BFF from test JavaScript.
  const waitForUi=async(expression,label)=>{
   for(let i=0;i<100;i++){
    if(await evaluate(expression))return;
    await new Promise(resolve=>setTimeout(resolve,100));
   }
   assert.fail(label);
  };
  const clickButton=async(label)=>{
   const clicked=await evaluate(`(()=>{const b=Array.from(document.querySelectorAll('button')).find(x=>x.textContent.trim()===${JSON.stringify(label)}&&!x.disabled);if(!b)return false;b.click();return true;})()`);
   assert.equal(clicked,true,'enabled UI button: '+label);
  };
  const fill=async(selector,value)=>{
   assert.equal(await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return false;el.focus();return true;})()`),true);
   await send('Input.insertText',{text:value});
   assert.equal(await evaluate('document.querySelector('+JSON.stringify(selector)+').value')===value,true,'UI input populated');
  };
  assert.equal(await evaluate(`(()=>{const label=Array.from(document.querySelectorAll('label')).find(x=>x.textContent.trim()==='Email');const radio=label?.querySelector('input[type=radio]');if(!radio)return false;radio.click();return true;})()`),true);
  await waitForUi('document.querySelector("#guest-contact")?.type==="email"','email channel selected');
  await fill('#guest-contact',initialContact);
  await fill('#guest-note','PRIVATE CHROME CREATE NOTE');
  assert.equal(await evaluate(`(()=>{const el=document.querySelector('#guest-contact').closest('form').querySelector('input[type=checkbox]');if(!el)return false;el.click();return el.checked;})()`),true);
  await clickButton('Жалғастыру');
  await waitForUi('!!document.querySelector("#guest-otp-code")','OTP step rendered after real delivery');
  const initialOtp=JSON.parse(await readFile(codeFile,'utf8'));
  assert.equal(initialOtp.purpose,'CREATE_REQUEST');
  assert.equal(initialOtp.destination===initialContact,true,'OTP delivered to UI contact');
  assert.equal(/^[0-9]{6}$/.test(initialOtp.code),true);
  await fill('#guest-otp-code',initialOtp.code);
  await clickButton('Кодты тексеру');
  await waitForUi('Array.from(document.querySelectorAll("button")).some(x=>x.textContent.trim()==="Өтінімді жіберу"&&!x.disabled)','verified UI ready step');
  const initialCookies=await send('Network.getCookies',{urls:[ingress]});
  assert.ok(initialCookies.cookies.some(x=>x.name==='__Host-services_guest_create'&&x.httpOnly&&x.secure));
  assert.equal(await evaluate("document.cookie.includes('__Host-services_guest_create')"),false);
  assert.equal(await evaluate('!!document.querySelector(\'section[aria-label="Өтінім қабылданды"]\')'),false,'OTP alone cannot create receipt');
  await clickButton('Өтінімді жіберу');
  await waitForUi('!!document.querySelector(\'section[aria-label="Өтінім қабылданды"] strong\')','committed receipt rendered');
  const browserRequestId=await evaluate('document.querySelector(\'section[aria-label="Өтінім қабылданды"] strong\').textContent.trim()');
  assert.match(browserRequestId,/^[a-f0-9-]{36}$/);
  assert.notEqual(browserRequestId,createdRequest);
  const browserPersisted=await db.query('SELECT status,version FROM service_requests WHERE id=$1',[browserRequestId]);
  assert.deepEqual(browserPersisted.rows[0],{status:'PENDING',version:1});
  const browserEvents=await db.query('SELECT topic,safe_payload FROM domain_outbox_events WHERE subject_id=$1',[browserRequestId]);
  assert.deepEqual(browserEvents.rows,[{topic:'service_request.created',safe_payload:{}}]);
  const browserReceiptCookies=await send('Network.getCookies',{urls:[ingress]});
  assert.ok(browserReceiptCookies.cookies.some(x=>x.name==='__Host-services_guest_request'&&x.httpOnly&&x.secure));
  const browserStatus=await evaluate(`(async()=>{
   const response=await fetch(${JSON.stringify('/api/guest-requests/'+browserRequestId+'/status')},{cache:'no-store'});
   return {status:response.status,body:await response.json()};
  })()`);
  assert.equal(browserStatus.status,200);
  assert.equal(browserStatus.body.id,browserRequestId);
  assert.equal(browserStatus.body.state,'pending');
  assert.ok(!JSON.stringify(browserStatus.body).includes('PRIVATE CHROME CREATE NOTE'));
  // Seller commits a decision for the request created by the real wizard.
  const browserAccepted=await sellerAccept(browserRequestId,sellerSealed.csrf,1,randomUUID());
  assert.equal(browserAccepted.status,200,'seller accepts browser-created request');
  await clickButton('Күйін жаңарту');
  await waitForUi('Array.from(document.querySelectorAll("section[aria-label]")).some(x=>x.getAttribute("aria-label")==="Өтінімнің қазіргі күйі"&&x.querySelector("[role=status]")?.textContent.trim()==="Орындаушы қабылдады")','accepted decision rendered in actual receipt UI');
  assert.deepEqual((await db.query('SELECT status,version FROM service_requests WHERE id=$1',[browserRequestId])).rows[0],{status:'ACCEPTED',version:2});
  assert.ok(await evaluate('Array.from(document.querySelectorAll("section[aria-label]")).some(x=>x.getAttribute("aria-label")==="Қызмет уақытын өзгерту")'),'accepted receipt exposes schedule UI');
  console.log('Live CI Chrome guest receipt refresh after seller acceptance PASS');
  // Age only the verified initial challenge for this disposable UI contact.
  const uiDigest=createHmac('sha256',guestBackendKey).update('guest-contact:v1\0').update('email\0'+initialContact).digest('hex');
  const agedUi=await db.query(`UPDATE guest_challenges SET created_at=now()-interval '10 minutes'
   WHERE purpose='CREATE_REQUEST' AND guest_contact_id IN (SELECT id FROM guest_contacts WHERE digest=$1)`,[uiDigest]);
  assert.equal(agedUi.rowCount,1);
  await clickButton('Растау кодын сұрау');
  const scheduleInput='#guest-schedule-code-'+browserRequestId;
  await waitForUi('!!document.querySelector('+JSON.stringify(scheduleInput)+')','schedule OTP UI rendered');
  const uiScheduleOtp=JSON.parse(await readFile(codeFile,'utf8'));
  assert.equal(uiScheduleOtp.purpose,'MANAGE_SCHEDULE');
  assert.equal(uiScheduleOtp.destination===initialContact,true);
  await fill(scheduleInput,uiScheduleOtp.code);
  await clickButton('Кодты тексеру');
  await waitForUi('document.body.textContent.includes("Қайта жоспарлау рұқсаты расталды.")','schedule OTP verified in UI');
  const uiScheduleCookies=await send('Network.getCookies',{urls:[ingress]});
  assert.ok(uiScheduleCookies.cookies.some(x=>x.name==='__Host-services_guest_schedule'&&x.httpOnly&&x.secure));
  await clickButton('Уақыт ұсынысын көру');
  await waitForUi('!Array.from(document.querySelectorAll("button")).some(x=>x.textContent.trim()==="Уақыт ұсынысын көру")','active schedule loaded in actual UI');
  // Assert successful load, not merely disappearance of a loading control.
  await waitForUi('document.body.textContent.includes("Белсенді ұсыныс жоқ.")','empty active schedule rendered');
  assert.equal(await evaluate(`(()=>{const el=Array.from(document.querySelectorAll('summary')).find(x=>x.textContent.trim()==='Жаңа уақыт ұсыну');if(!el)return false;el.click();return true;})()`),true);
  const uiSlot=new Date(Date.now()+7*86400000);uiSlot.setUTCMinutes(0,0,0);
  const wall=(date)=>new Date(date.getTime()+18000000).toISOString().slice(0,16);
  const uiStart=wall(uiSlot),uiEnd=wall(new Date(uiSlot.getTime()+3600000));
  // Native datetime-local controls have locale-specific segments; set their
  // DOM values, dispatch input/change, and submit through the real React form.
  assert.equal(await evaluate(`(()=>{const a=document.querySelector('input[name=start]'),b=document.querySelector('input[name=end]');if(!a||!b)return false;a.value=${JSON.stringify(uiStart)};b.value=${JSON.stringify(uiEnd)};for(const el of [a,b]){el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}return a.validity.valid&&b.validity.valid;})()`),true);
  await clickButton('Ұсынысты жіберу');
  await waitForUi('document.body.textContent.includes("Клиент ұсынды")','guest proposal rendered');
  assert.ok(await evaluate('document.body.textContent.includes("Сіз бұл ұсынысты қазір растай алмайсыз.")'),'own proposal cannot be confirmed');
  assert.deepEqual((await db.query('SELECT status,version FROM service_requests WHERE id=$1',[browserRequestId])).rows[0],{status:'ACCEPTED',version:3});
  const uiEvents=await db.query("SELECT topic,count(*)::int AS n FROM domain_outbox_events WHERE subject_id=$1 AND topic='service_request.schedule_proposed' GROUP BY topic",[browserRequestId]);
  assert.deepEqual(uiEvents.rows,[{topic:'service_request.schedule_proposed',n:1}]);
  console.log('Live CI Chrome guest schedule proposal actual UI PASS');
  const uiCounterSlot=new Date(uiSlot.getTime()+86400000);
  const uiCounterBody={start_at:uiCounterSlot.toISOString(),end_at:new Date(uiCounterSlot.getTime()+3600000).toISOString(),
   timezone:'Asia/Almaty',local_start_at:wall(uiCounterSlot)+':00',utc_offset_seconds:18000};
  const uiCounter=await fetch(new URL('/api/account/requests/'+browserRequestId+'/schedule-proposals',base),{
   method:'POST',redirect:'manual',signal:AbortSignal.timeout(8000),
   headers:{Cookie:sellerCookie,Origin:'https://services.example.test','Sec-Fetch-Site':'same-origin',
    'X-Services-CSRF':sellerSealed.csrf,'If-Match':'"3"','Idempotency-Key':randomUUID(),'Content-Type':'application/json'},
   body:JSON.stringify(uiCounterBody),
  });
  assert.equal(uiCounter.status,201,'seller counterproposal committed');
  const uiCounterReceipt=await uiCounter.json();
  assert.equal(uiCounterReceipt.request_version,4);
  await clickButton('Күйін жаңарту');
  await waitForUi('Array.from(document.querySelectorAll("button")).some(x=>x.textContent.trim()==="Растау кодын сұрау"&&!x.disabled)','fresh schedule UI after version refresh');
  const agedScheduleUi=await db.query(`UPDATE guest_challenges SET created_at=now()-interval '10 minutes'
   WHERE request_id=$1 AND purpose='MANAGE_SCHEDULE' AND consumed_at IS NOT NULL`,[browserRequestId]);
  assert.equal(agedScheduleUi.rowCount,1);
  await clickButton('Растау кодын сұрау');
  await waitForUi('!!document.querySelector('+JSON.stringify(scheduleInput)+')','counterproposal OTP UI');
  const counterOtp=JSON.parse(await readFile(codeFile,'utf8'));
  assert.equal(counterOtp.purpose,'MANAGE_SCHEDULE');
  assert.equal(counterOtp.destination===initialContact,true);
  await fill(scheduleInput,counterOtp.code);
  await clickButton('Кодты тексеру');
  await waitForUi('document.body.textContent.includes("Қайта жоспарлау рұқсаты расталды.")','counterproposal access verified');
  await clickButton('Уақыт ұсынысын көру');
  await waitForUi('document.body.textContent.includes("Орындаушы ұсынды")','seller counterproposal visible');
  await clickButton('Растау');
  await waitForUi('document.body.textContent.includes("Белсенді ұсыныс жоқ.")','confirmed proposal removed from active UI');
  assert.deepEqual((await db.query('SELECT status,version FROM service_requests WHERE id=$1',[browserRequestId])).rows[0],{status:'ACCEPTED',version:5});
  const uiConfirmedEvents=await db.query("SELECT topic,count(*)::int AS n FROM domain_outbox_events WHERE subject_id=$1 AND topic='service_request.schedule_confirmed' GROUP BY topic",[browserRequestId]);
  assert.deepEqual(uiConfirmedEvents.rows,[{topic:'service_request.schedule_confirmed',n:1}]);
  console.log('Live CI Chrome guest confirms seller counterproposal through actual UI PASS');

  await send('Network.deleteCookies',{name:'__Host-services_guest_schedule',url:ingress});
  console.log('Live CI Chrome guest schedule OTP and active schedule UI PASS');
  // Restore the original request cookie for the independent schedule lifecycle.
  const restored=await send('Network.setCookie',{name:'__Host-services_guest_request',
   value:accessCookie.slice(accessCookie.indexOf('=')+1),url:ingress,path:'/',secure:true,httpOnly:true,sameSite:'Strict'});
  assert.equal(restored.success,true);
  console.log('Live CI Chrome OTP-authorized request creation and committed status PASS');
  await send('Network.deleteCookies',{name:'__Host-services_guest_create',url:ingress});
  console.log('Live CI Chrome initial CREATE_REQUEST OTP issuance and verification PASS');
  const started=await browserPost(scheduleAccess+'/challenges',{locale:'kk'},
   {'X-Services-Network-Proof':signNetwork()});
  assert.equal(started.status,202,'Chrome schedule OTP start');
  scheduleChallenge=started.body;
  assert.deepEqual(Object.keys(scheduleChallenge),['challenge_id']);
  const otp=JSON.parse(await readFile(codeFile,'utf8'));
  assert.equal(otp.purpose,'MANAGE_SCHEDULE');
  assert.equal(otp.destination,originalContact);
  assert.match(otp.code,/^[0-9]{6}$/);
  const verified=await browserPost(scheduleAccess+'/challenges/'+scheduleChallenge.challenge_id+'/verify',{code:otp.code});
  assert.equal(verified.status,200,'Chrome schedule OTP verification');
  assert.deepEqual(verified.body,{verified:true});
  const stored=await send('Network.getCookies',{urls:[ingress]});
  const scoped=stored.cookies.find(x=>x.name==='__Host-services_guest_schedule');
  assert.ok(scoped?.httpOnly&&scoped.secure,'Chrome must store server-issued secure HttpOnly schedule cookie');
  scheduleCookie=scoped.name+'='+scoped.value;
  console.log('Live CI Chrome schedule OTP issuance and verification PASS');
  const result=await evaluate(`(async()=>{
   const response=await fetch(${JSON.stringify(scheduleUrl+'/active')},{method:'POST',
    headers:{'Content-Type':'application/json','X-Services-CSRF':${JSON.stringify(guestCsrf)}},body:'{}'});
   return {status:response.status,body:await response.json(),cookieVisible:document.cookie.includes('__Host-services_guest_')};
  })()`);
  assert.equal(result.status,200,'Chrome scoped schedule read');
  assert.deepEqual(result.body,{request_id:createdRequest,request_version:2,actor:'customer',can_propose:true,proposal:null});
  assert.equal(result.cookieVisible,false,'guest auth cookies must not be visible to JavaScript');
  console.log('Live CI Chrome guest scoped schedule transport PASS');
 const scheduleRead=await schedulePost(scheduleUrl+'/active',{},accessCookie+'; '+scheduleCookie);
 assert.equal(scheduleRead.status,200,'verified guest active schedule read');
 assert.deepEqual(await scheduleRead.json(),{request_id:createdRequest,request_version:2,actor:'customer',can_propose:true,proposal:null});
 assert.equal((await db.query('SELECT version FROM service_requests WHERE id=$1',[createdRequest])).rows[0]?.version,2);
 console.log('Live CI guest schedule OTP and scoped active read PASS');
 // Exercise both actors against the same committed guest request.
 const scheduleCookies=accessCookie+'; '+scheduleCookie;
 const guestMutation=async(suffix,version,payload={},key=randomUUID(),cookie=scheduleCookies)=>{
  if(cookie!==scheduleCookies)return schedulePost(scheduleUrl+suffix,payload,cookie,{'If-Match':'"'+version+'"','Idempotency-Key':key});
  const result=await browserPost(scheduleUrl+suffix,payload,{'If-Match':'"'+version+'"','Idempotency-Key':key});
  return {status:result.status,json:async()=>result.body};
 };
 const sellerMutation=(suffix,version,payload={},key=randomUUID())=>fetch(
  new URL('/api/account/requests/'+createdRequest+'/schedule-proposals'+suffix,base),{
   method:'POST',redirect:'manual',signal:AbortSignal.timeout(8000),
   headers:{Cookie:sellerCookie,Origin:'https://services.example.test','Sec-Fetch-Site':'same-origin',
    'X-Services-CSRF':sellerSealed.csrf,'If-Match':'"'+version+'"','Idempotency-Key':key,'Content-Type':'application/json'},
   body:JSON.stringify(payload),
  });
 const slot=new Date(Date.now()+7*86400000);slot.setUTCMinutes(0,0,0);
 const proposalBody={start_at:slot.toISOString(),end_at:new Date(slot.getTime()+3600000).toISOString(),
  timezone:'Asia/Almaty',local_start_at:new Date(slot.getTime()+18000000).toISOString().slice(0,19),
  utc_offset_seconds:18000};
 assert.notEqual((await guestMutation('',2,proposalBody,randomUUID(),accessCookie)).status,201);
 const proposalKey=randomUUID();
 const proposedResponse=await guestMutation('',2,proposalBody,proposalKey);
 assert.equal(proposedResponse.status,201,'guest proposes through scoped BFF');
 proposed=await proposedResponse.json();
 assert.equal(proposed.initiator,'customer');assert.equal(proposed.request_version,3);
 const proposalReplay=await guestMutation('',2,proposalBody,proposalKey);
 assert.equal(proposalReplay.status,201);
 assert.deepEqual(await proposalReplay.json(),{...proposed,replayed:true});
 const ownConfirm=await guestMutation('/'+proposed.id+'/confirm',3);
 if(ownConfirm.status!==409){
  const {openGuestScheduleSession}=await import('../src/lib/guest-schedule-session-core.mjs');
  const proof=openGuestScheduleSession(guestWebKey,'schedule',scheduleCookie.split('=')[1]);
  assert.ok(proof);
  const direct=await fetch(new URL('/v1/requests/'+createdRequest+'/schedule-proposals/'+proposed.id+'/confirm','https://localhost:8445'),{
   method:'POST',redirect:'manual',signal:AbortSignal.timeout(5000),
   headers:{'Content-Type':'application/json','Guest-Capability':proof.value,'If-Match':'"3"','Idempotency-Key':randomUUID()},body:'{}',
  });
  console.error('CI schedule boundary diagnostic (no secrets)',{bffStatus:ownConfirm.status,backendStatus:direct.status});
  if(direct.body)await direct.body.cancel().catch(()=>{});
 }
 assert.equal(ownConfirm.status,409,'guest cannot confirm own proposal');
 const decline=await sellerMutation('/'+proposed.id+'/decline',3);
 assert.equal(decline.status,200);assert.equal((await decline.json()).request_version,4);
 const sellerProposal=await sellerMutation('',4,proposalBody);
 assert.equal(sellerProposal.status,201);
 offered=await sellerProposal.json();assert.equal(offered.initiator,'seller');assert.equal(offered.request_version,5);
 const guestViewResult=await browserPost(scheduleUrl+'/active',{});
 const guestView={status:guestViewResult.status,json:async()=>guestViewResult.body};
 assert.equal(guestView.status,200);
 const offeredView=await guestView.json();
 assert.equal(offeredView.proposal.id,offered.id);assert.equal(offeredView.proposal.can_resolve,true);
 assert.equal((await guestMutation('/'+offered.id+'/confirm',4)).status,409,'stale guest version denied');
 const confirmKey=randomUUID();
 const confirmedResponse=await guestMutation('/'+offered.id+'/confirm',5,{},confirmKey);
 assert.equal(confirmedResponse.status,200);
 const confirmed=await confirmedResponse.json();assert.equal(confirmed.status,'confirmed');assert.equal(confirmed.request_version,6);
 const confirmReplay=await guestMutation('/'+offered.id+'/confirm',5,{},confirmKey);
 assert.equal(confirmReplay.status,200);assert.deepEqual(await confirmReplay.json(),{...confirmed,replayed:true});
 const afterScheduleResult=await browserPost(scheduleUrl+'/active',{});
 const afterSchedule={status:afterScheduleResult.status,json:async()=>afterScheduleResult.body};
 assert.equal(afterSchedule.status,200);assert.equal((await afterSchedule.json()).proposal,null);
 assert.equal((await db.query('SELECT version FROM service_requests WHERE id=$1',[createdRequest])).rows[0]?.version,6);
 const effects=await db.query("SELECT topic,count(*)::int AS n FROM domain_outbox_events WHERE subject_id=$1 AND topic LIKE 'service_request.schedule_%' GROUP BY topic ORDER BY topic",[createdRequest]);
 assert.deepEqual(effects.rows,[{topic:'service_request.schedule_confirmed',n:1},{topic:'service_request.schedule_declined',n:1},{topic:'service_request.schedule_proposed',n:2}]);
 console.log('Live CI guest proposal, seller decline, seller proposal, guest confirm and exact replay PASS');

  // Remove only the schedule capability from the browser; READ_CANCEL
  // must remain insufficient even when Chrome supplies valid fetch metadata.
  await send('Network.deleteCookies',{name:'__Host-services_guest_schedule',url:ingress});
  const denied=await evaluate(`(async()=>{
   const response=await fetch(${JSON.stringify(scheduleUrl+'/active')},{method:'POST',
    headers:{'Content-Type':'application/json','X-Services-CSRF':${JSON.stringify(guestCsrf)}},body:'{}'});
   return response.status;
  })()`);
  assert.ok(denied>=400&&denied<500||denied===503,'Chrome READ_CANCEL must not authorize schedule access');
  // Bootstrap must still work with the original request-scoped cookie.
  const bootstrap=await evaluate(`(async()=>{
   const response=await fetch(${JSON.stringify(scheduleAccess+'/bootstrap')},{cache:'no-store'});
   return {status:response.status,body:await response.json(),cache:response.headers.get('cache-control')};
  })()`);
  assert.equal(bootstrap.status,200);
  assert.deepEqual(bootstrap.body,{csrf_token:guestCsrf});
  assert.match(bootstrap.cache??'',/no-store/);
  console.log('Live CI Chrome guest schedule scope separation and bootstrap PASS');

 }finally{
  ws?.close();browser.kill('SIGTERM');
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
 }
 // Both OTP purposes share contact cooldown. Age only this disposable
 // fixture's already verified challenge, never relax production quota.
 const aged=await db.query(`UPDATE guest_challenges SET created_at=now()-interval '10 minutes'
  WHERE id=$1 AND request_id=$2 AND purpose='MANAGE_SCHEDULE'`,[scheduleChallenge.challenge_id,createdRequest]);
 assert.equal(aged.rowCount,1);
 const completionUrl='/api/guest-requests/'+createdRequest+'/completion';
 const bootstrap=(id,cookie,fetchSite='same-origin')=>fetch(
  new URL('/api/guest-requests/'+id+'/completion/bootstrap',completionBase),{
   method:'GET',cache:'no-store',redirect:'manual',
   signal:AbortSignal.timeout(8000),
   headers:{'Sec-Fetch-Site':fetchSite,...(cookie?{Cookie:cookie}:{})},
  });
 assert.equal((await bootstrap(createdRequest,null)).status,404,
  'missing guest request cookie cannot reveal CSRF token');
 assert.equal((await bootstrap(randomUUID(),accessCookie)).status,404,
  'request-bound cookie must not bootstrap a foreign request');
 assert.equal((await bootstrap(createdRequest,accessCookie,'cross-site')).status,404,
  'cross-site fetch metadata cannot bootstrap CSRF');
 const bootstrapped=await bootstrap(createdRequest,accessCookie);
 assert.equal(bootstrapped.status,200);
 assert.match(bootstrapped.headers.get('cache-control')??'',/no-store/);
 assert.equal(bootstrapped.headers.get('set-cookie'),null,
  'CSRF bootstrap must not rotate or expose an authentication cookie');
 assert.deepEqual(await bootstrapped.json(),{csrf_token:guestCsrf});
 const completionPost=(suffix,payload,{cookie=accessCookie,csrf=guestCsrf,
  proof=signNetwork(),match}={})=>fetch(
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
 if(started.status!==202){
  const challengeRows=await db.query(`SELECT count(*)::int AS n
   FROM guest_challenges WHERE request_id=$1 AND purpose='COMPLETE_REQUEST'`,
   [createdRequest]);
  const networkRows=await db.query(`SELECT count(*)::int AS n
   FROM guest_otp_network_issuances WHERE network_digest=$1
    AND purpose='COMPLETE_REQUEST'`,[networkDigest]);
  let directBackendStatus='request_not_sent';
  try{
   const backend=await fetch(new URL('/v1/guest-requests/'+createdRequest+
    '/completion/challenges','https://localhost:8445'),{
    method:'POST',redirect:'manual',signal:AbortSignal.timeout(5000),
    headers:{'Content-Type':'application/json','Guest-Capability':accessSession.capability,
     'X-Services-Network-Proof':networkProof},body:'{"locale":"kk"}',
   });
   directBackendStatus=backend.status;
   if(backend.body)void backend.body.cancel().catch(()=>{});
  }catch{directBackendStatus='transport_unavailable';}
  console.error('CI OTP boundary diagnostic (no secrets)',{
   status:started.status,deliveryObserved:existsSync(codeFile),
   challengeRows:challengeRows.rows[0]?.n,networkRows:networkRows.rows[0]?.n,
   networkProofAgeMs:Date.now()-Number(timestamp),directBackendStatus,
  });
 }
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
  {cookie:accessCookie,match:'"6"'})).status,503,
  'READ_CANCEL alone must never confirm completion');
 assert.equal((await completionPost('/confirm',{},
  {cookie:writeCookies,match:'W/"6"'})).status,409);
 // A syntactically valid but stale strong ETag must not consume the sealed
 // write proof. The same cookie can still complete using the actual version.
 assert.equal((await completionPost('/confirm',{},
  {cookie:writeCookies,match:'"5"'})).status,503,
  'BFF intentionally hides upstream version conflict as unavailable; proof remains sealed');
 assert.equal((await db.query(`SELECT count(*)::int AS n
  FROM domain_outbox_events WHERE subject_id=$1
  AND topic='service_request.completed'`,[createdRequest])).rows[0]?.n,0);
 assert.equal((await db.query(`SELECT count(*)::int AS n
  FROM guest_capabilities WHERE request_id=$1
  AND scope='COMPLETE_REQUEST' AND consumed_at IS NOT NULL`,
  [createdRequest])).rows[0]?.n,0);
 const acceptedStill=await db.query('SELECT status,version FROM service_requests WHERE id=$1',
  [createdRequest]);
 assert.deepEqual(acceptedStill.rows[0],{status:'ACCEPTED',version:6});
 const finished=await completionPost('/confirm',{},
  {cookie:writeCookies,match:'"6"'});
 assert.equal(finished.status,200,'real OTP write proof must complete accepted request');
 assert.deepEqual(await finished.json(),
  {code:'COMPLETED',id:createdRequest,version:7});
 assert.ok(finished.headers.getSetCookie()
  .some(x=>x.startsWith('__Host-services_guest_completion=')&&/max-age=0/i.test(x)));
 const completedStatus=await guestStatus(createdRequest,accessCookie);
 assert.equal(completedStatus.status,200);
 const completedBody=await completedStatus.json();
 assert.equal(completedBody.state,'completed');
 assert.equal(completedBody.version,7);
 assert.equal((await completionPost('/confirm',{},
  {cookie:writeCookies,match:'"6"'})).status,503,
  'replayed one-use proof cannot duplicate completion');
 assert.equal((await db.query('SELECT id FROM service_experiences WHERE request_id=$1',
  [createdRequest])).rowCount,0,'guest completion must not create verified review');
 const completedEvents=await db.query(
  'SELECT topic,safe_payload FROM domain_outbox_events WHERE subject_id=$1',
  [createdRequest]);
 assert.deepEqual(new Set(completedEvents.rows.map(x=>x.topic)),
  new Set(['service_request.created','service_request.accepted',
   'service_request.completed','service_request.schedule_proposed','service_request.schedule_confirmed','service_request.schedule_declined']));
 // Preserve exact privacy assertions for every event type, including schedule metadata.
 const expectedScheduleEvents=[
  {topic:'service_request.schedule_proposed',safe_payload:{proposal_id:proposed.id,revision:proposed.revision}},
  {topic:'service_request.schedule_declined',safe_payload:{proposal_id:proposed.id,revision:proposed.revision}},
  {topic:'service_request.schedule_proposed',safe_payload:{proposal_id:offered.id,revision:offered.revision}},
  {topic:'service_request.schedule_confirmed',safe_payload:{proposal_id:offered.id,revision:offered.revision}},
 ];
 const eventKey=x=>x.topic+':'+(x.safe_payload.proposal_id??'');
 assert.deepEqual(completedEvents.rows.filter(x=>x.topic.startsWith('service_request.schedule_')).sort((a,b)=>eventKey(a).localeCompare(eventKey(b))),
  expectedScheduleEvents.sort((a,b)=>eventKey(a).localeCompare(eventKey(b))));
 const lifecycleEvents=completedEvents.rows.filter(x=>!x.topic.startsWith('service_request.schedule_'));
 assert.equal(lifecycleEvents.length,3);
 assert.ok(lifecycleEvents.every(x=>JSON.stringify(x.safe_payload)==='{}'));
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
