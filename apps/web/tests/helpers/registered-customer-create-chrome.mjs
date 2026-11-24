import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

/**
 * Browser-level, real Chrome + real SSR test of the guarded customer form.
 * Only the browser's POST is mocked to deliberately simulate an uncertain
 * outcome. Separate CI E2E covers actual HTTP -> backend -> PostgreSQL writes.
 */
export async function exerciseRegisteredCreateChromeRetry({base,offer,sealedCookie}){
 assert.equal(process.env.CI,'true');
 const chrome=process.env.CHROME_BIN??'google-chrome';
 const dir=await mkdtemp(join(tmpdir(),'registered-form-chrome-'));
 let child,socket;
 try{
  child=spawn(chrome,[
   '--headless=new','--no-sandbox','--disable-gpu',
   '--disable-dev-shm-usage','--no-first-run',
   '--remote-debugging-port=0','--user-data-dir='+dir,'about:blank',
  ],{stdio:'ignore'});
  let ended=false;
  child.once('exit',()=>{ended=true;});
  child.once('error',()=>{ended=true;});
  let port;
  for(let attempt=0;attempt<200&&!ended;attempt++){
   try{
    const txt=await readFile(join(dir,'DevToolsActivePort'),'utf8');
    const n=Number(txt.split('\n')[0]);
    if(Number.isInteger(n)&&n>0&&n<65536){port=n;break;}
   }catch{}
   await pause(100);
  }
  assert.ok(port,'Chrome DevTools must start');
  const targets=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const target=targets.find(t=>t.type==='page');
  assert.ok(target?.webSocketDebuggerUrl);
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{
   socket.addEventListener('open',resolve,{once:true});
   socket.addEventListener('error',reject,{once:true});
  });
  let seq=0;
  const pending=new Map();
  socket.addEventListener('message',evt=>{
   const reply=JSON.parse(evt.data);
   if(!reply.id)return;
   const item=pending.get(reply.id);
   if(!item)return;
   pending.delete(reply.id);
   if(reply.error)item.reject(Error(reply.error.message));
   else item.resolve(reply.result);
  });
  async function send(method,params={}){
   const id=++seq;
   const value=new Promise((resolve,reject)=>{
    pending.set(id,{resolve,reject});
    socket.send(JSON.stringify({id,method,params}));
   });
   return await Promise.race([
    value,pause(12000).then(()=>{pending.delete(id);throw Error('CDP timeout: '+method);}),
   ]);
  }
  async function evaluate(source){
   const r=await send('Runtime.evaluate',{
    expression:source,returnByValue:true,awaitPromise:true,
   });
   if(r.exceptionDetails)throw Error('Chrome evaluation failed: '+r.exceptionDetails.text);
   return r.result?.value;
  }
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  const url=new URL('/ru/services/'+offer,base);
  const cookie=await send('Network.setCookie',{
   name:'__Host-services_account_web',value:sealedCookie,
   url:base,secure:true,httpOnly:true,sameSite:'Strict',path:'/',
  });
  assert.equal(cookie.success,true,'test-only HttpOnly cookie must be accepted by Chrome');
  const cookies=(await send('Network.getCookies',{urls:[base]})).cookies??[];
  assert.ok(cookies.some(c=>c.name==='__Host-services_account_web'&&
   c.httpOnly&&c.secure),'cookie must remain HttpOnly and Secure');
  // Browser-backed layout contract for the actual authenticated customer
  // form, not just the public catalog. All checks use an isolated CI-only
  // sealed session and the production-built Next.js server.
  for(const width of [320,375,768]){
   await send('Emulation.setDeviceMetricsOverride',{
    width,height:740,deviceScaleFactor:1,mobile:true,
   });
   await send('Page.navigate',{url:url.href});
   let measured;
   for(let attempt=0;attempt<100;attempt++){
    try{
     measured=await evaluate(`(()=>{
       const section=document.querySelector('section[aria-labelledby="customer-create-heading"]');
       const note=document.getElementById('customer-request-note');
       const consent=section?.querySelector('input[type="checkbox"]');
       const submit=section?.querySelector('button');
       const bounds=[note,consent,submit].map(el=>{
         const rect=el?.getBoundingClientRect();
         return {width:rect?.width??0,left:rect?.left??-1,right:rect?.right??-1};
       });
       return {
         ready:document.readyState==='complete',section:!!section,
         heading:document.getElementById('customer-create-heading')?.textContent??'',
         viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,
         bounds,
       };
     })()`);
    }catch(error){
     // Chrome discards the old JS context during Next navigation.
     if(attempt===99)throw error;
     await pause(100);continue;
    }
    if(measured.ready&&measured.heading&&measured.bounds.every(b=>b.width>0))break;
    await pause(100);
   }
   assert.equal(measured.heading,'Оставить заявку');
   assert.equal(measured.section,true,'authenticated form section required');
   assert.ok(measured.scrollWidth<=measured.viewport+1,
    'authenticated form overflows at '+width+'px: '+JSON.stringify(measured));
   assert.equal(measured.bounds.length,3);
   for(const control of measured.bounds){
    assert.ok(control.width>0&&control.left>=-1&&control.right<=width+1,
     'authenticated form control clipped at '+width+'px: '+JSON.stringify(control));
   }
   console.log('Chrome registered customer form mobile '+width+'px PASS');
  }
  // Restore the original 375px viewport for the real keyboard and
  // uncertain-commit retry interaction assertions below.
  await send('Emulation.setDeviceMetricsOverride',{
   width:375,height:740,deviceScaleFactor:1,mobile:true,
  });
  await send('Page.navigate',{url:url.href});
  let ready=false;
  for(let attempt=0;attempt<120;attempt++){
   ready=await evaluate(`document.readyState==='complete'&&
    !!document.getElementById('customer-create-heading')&&
    !!document.getElementById('customer-request-note')&&
    !!document.querySelector('input[type="checkbox"]')`);
   if(ready)break;
   await pause(100);
  }
  assert.equal(ready,true,'real SSR must show create form to a signed-in customer');
  const layout=await evaluate(`(()=>{
   const note=document.getElementById('customer-request-note');
   const check=document.querySelector('input[type="checkbox"]');
   const button=document.querySelector('section[aria-labelledby="customer-create-heading"] button');
   const rect=button?.getBoundingClientRect();
   return {title:document.getElementById('customer-create-heading')?.textContent,
    width:document.documentElement.scrollWidth,innerWidth,
    note:!!note,check:!!check,button:!!button,
    buttonWidth:rect?.width??0,buttonHeight:rect?.height??0,
    blocked:button?.disabled};
  })()`);
  assert.equal(layout.title,'Оставить заявку');
  assert.equal(layout.note,true);
  assert.equal(layout.check,true);
  assert.equal(layout.button,true);
  assert.equal(layout.blocked,true,'unconsented submission is blocked');
  assert.ok(layout.width<=layout.innerWidth+1,
   'registered form must not overflow mobile viewport');

  // This shim affects ONLY this Chrome page, not the real backend. It
  // captures what the hydrated React component actually attempts to send.
  const installed=await evaluate(`(()=>{
    window.__registeredChromeCaptured=[];
    window.fetch=async (url,options={})=>{
      if(url!=='/api/account/requests')throw Error('unexpected_client_fetch');
      const captured={
        url,method:options.method,credentials:options.credentials,
        cache:options.cache,redirect:options.redirect,
        key:options.headers?.['Idempotency-Key'],
        csrf:options.headers?.['X-Services-CSRF'],
        body:JSON.parse(options.body),
      };
      window.__registeredChromeCaptured.push(captured);
      if(window.__registeredChromeCaptured.length===1)
        return new Response(JSON.stringify({code:'UNAVAILABLE'}),{
          status:503,headers:{'Content-Type':'application/json',
          'Cache-Control':'private, no-store, max-age=0'},
        });
      return new Response(JSON.stringify({
       code:'CREATED',id:'123e4567-e89b-42d3-a456-426614174000',version:1,
      }),{status:201,headers:{'Content-Type':'application/json',
       'Cache-Control':'private, no-store, max-age=0'}});
    };
    return true;
  })()`);
  assert.equal(installed,true);
  // The SSR textarea can be replaced during React hydration. Wait for
  // the connected, enabled node to receive genuine Chrome keyboard focus.
  let focus=false;
  for(let attempt=0;attempt<30;attempt++){
   focus=await evaluate(`(()=>{
    const note=document.getElementById('customer-request-note');
    if(!note||!note.isConnected||note.disabled)return false;
    note.focus();return document.activeElement===note&&note.isConnected;
   })()`);
   if(focus)break;
   await pause(100);
  }
  assert.equal(focus,true,'note must accept keyboard input');
  await send('Input.insertText',{text:'Browser retry original note'});
  const textReady=await evaluate(`document.getElementById('customer-request-note').value`);
  assert.equal(textReady,'Browser retry original note');
  await evaluate(`document.querySelector('input[type="checkbox"]').click()`);
  let consentReady=false;
  for(let i=0;i<30;i++){
   consentReady=await evaluate(`(()=>{
    const node=document.querySelector('input[type="checkbox"]');
    const button=document.querySelector('section[aria-labelledby="customer-create-heading"] button');
    return node?.checked===true&&button?.disabled===false;
   })()`);
   if(consentReady)break;
   await pause(100);
  }
  assert.equal(consentReady,true);
  await evaluate(`document.querySelector('section[aria-labelledby="customer-create-heading"] button').click()`);
  let uncertain=false;
  for(let i=0;i<60;i++){
   uncertain=await evaluate(`(()=>{
    const section=document.querySelector('section[aria-labelledby="customer-create-heading"]');
    return section?.querySelector('[role="alert"]')?.textContent?.includes('Результат неизвестен')&&
     document.getElementById('customer-request-note')?.disabled===true&&
     section.querySelector('input[type="checkbox"]')?.disabled===true&&
     window.__registeredChromeCaptured?.length===1;
   })()`);
   if(uncertain)break;
   await pause(100);
  }
  assert.equal(uncertain,true,'unknown upstream commit freezes original note and consent');
  const retryLabel=await evaluate(`document.querySelector('section[aria-labelledby="customer-create-heading"] button')?.textContent`);
  assert.equal(retryLabel,'Проверить ту же заявку ещё раз');
  await evaluate(`document.querySelector('section[aria-labelledby="customer-create-heading"] button').click()`);
  let committed=false;
  for(let i=0;i<60;i++){
   committed=await evaluate(`(()=>{
    const section=document.querySelector('section[aria-labelledby="customer-create-heading"]');
    return !!section?.querySelector('[role="status"]')?.textContent?.includes('Заявка принята')&&
     window.__registeredChromeCaptured?.length===2;
   })()`);
   if(committed)break;
   await pause(100);
  }
  assert.equal(committed,true,'browser must render receipt only after exact 201');
  const attempts=await evaluate('window.__registeredChromeCaptured');
  assert.equal(attempts.length,2);
  assert.deepEqual(attempts[0],attempts[1],
   'unknown first commit must replay the SAME key AND SAME body');
  assert.match(attempts[0].key,/^registered_[0-9a-f]{32}$/);
  assert.match(attempts[0].csrf,/^[A-Za-z0-9_-]{43}$/);
  assert.equal(attempts[0].method,'POST');
  assert.equal(attempts[0].credentials,'same-origin');
  assert.equal(attempts[0].cache,'no-store');
  assert.equal(attempts[0].body.service_offer_id,offer);
  assert.equal(attempts[0].body.note,'Browser retry original note');
  assert.equal(attempts[0].body.consent_to_contact,true);
  const html=await evaluate('document.body.textContent');
  assert.ok(!html.includes(sealedCookie),'cookie must not leak into DOM');
  console.log('Real Chrome React registered form: 503 uncertain -> frozen -> same-key 201 receipt PASS');
 }finally{
  if(socket)socket.close();
  if(child&&!child.killed)child.kill('SIGTERM');
  await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});
 }
}
