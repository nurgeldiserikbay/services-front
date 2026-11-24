import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

/**
 * The account page is first loaded with a genuine, live-authorized test
 * session. PostgreSQL revokes the backing session while Chrome remains open.
 * A manual React refresh must purge all previously displayed private rows,
 * and a fresh SSR navigation must deny the same sealed cookie.
 */
export async function exerciseSellerSessionRevocationChrome({
 base,sealedCookie,onRevoke,locale='kk',minimumRows=4,
}){
 assert.equal(process.env.CI,'true');
 assert.equal(typeof onRevoke,'function');
 const dir=await mkdtemp(join(tmpdir(),'seller-revoked-chrome-'));
 let processExited=false,child,socket;
 try{
  child=spawn(process.env.CHROME_BIN??'google-chrome',[
   '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
   '--no-first-run','--remote-debugging-port=0','--user-data-dir='+dir,'about:blank',
  ],{stdio:'ignore'});
  child.once('error',()=>{processExited=true;});
  child.once('exit',()=>{processExited=true;});
  let port;
  for(let attempt=0;attempt<200&&!processExited;attempt++){
   try{
    const raw=await readFile(join(dir,'DevToolsActivePort'),'utf8');
    port=Number(raw.split('\n')[0]);
    if(Number.isInteger(port)&&port>0&&port<65536)break;
   }catch{}
   await sleep(100);
  }
  assert.ok(port,'Chrome DevTools is required for session revocation acceptance');
  const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const target=targets.find(item=>item.type==='page');
  assert.ok(target?.webSocketDebuggerUrl);
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{
   socket.addEventListener('open',resolve,{once:true});
   socket.addEventListener('error',reject,{once:true});
  });
  let sequence=0,requestStatuses=[],documentStatuses=[];
  const pending=new Map();
  socket.addEventListener('message',event=>{
   const reply=JSON.parse(event.data);
   if(reply.method==='Network.responseReceived'){
    const url=reply.params?.response?.url??'';
    if(url.includes('/api/seller/requests'))requestStatuses.push(reply.params.response.status);
    if(reply.params?.type==='Document'&&url.includes('/'+locale+'/account/requests'))
     documentStatuses.push(reply.params.response.status);
   }
   if(!reply.id)return;
   const call=pending.get(reply.id);
   if(!call)return;
   pending.delete(reply.id);
   if(reply.error)call.reject(Error(reply.error.message));
   else call.resolve(reply.result);
  });
  async function send(method,params={}){
   const id=++sequence;let timeout;
   try{
    return await Promise.race([
     new Promise((resolve,reject)=>{
      pending.set(id,{resolve,reject});
      socket.send(JSON.stringify({id,method,params}));
     }),
     new Promise((_resolve,reject)=>{
      timeout=setTimeout(()=>reject(Error('Chrome revocation '+method+' timed out')),12000);
     }),
    ]);
   }finally{clearTimeout(timeout);pending.delete(id);}
  }
  async function evaluate(expression){
   const result=await send('Runtime.evaluate',{
    expression,returnByValue:true,awaitPromise:true,
   });
   if(result.exceptionDetails)throw Error('Chrome JS error: '+
    (result.exceptionDetails.exception?.description??result.exceptionDetails.text));
   return result.result?.value;
  }
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
  const cookie=await send('Network.setCookie',{
   name:'__Host-services_account_web',value:sealedCookie,url:base,
   secure:true,httpOnly:true,sameSite:'Strict',path:'/',
  });
  assert.equal(cookie.success,true);
  await send('Emulation.setDeviceMetricsOverride',{
   width:375,height:740,deviceScaleFactor:1,mobile:true,
  });
  const targetUrl=new URL('/'+locale+'/account/requests',base).href;
  await send('Page.navigate',{url:targetUrl});
  let initial;
  for(let i=0;i<120;i++){
   try{
    initial=await evaluate('(()=>{'+
     'const inbox=[...document.querySelectorAll("main section[aria-label]")].find(s=>'+
      's.getAttribute("aria-label")==='+JSON.stringify(locale==='kk'?'Өтінімдер':'Заявки')+');'+
     'return {lang:document.documentElement.lang,rows:inbox?.querySelectorAll("ul li").length??0,'+
      'refresh:[...inbox?.querySelectorAll("button")??[]].find(b=>'+
       'b.textContent?.trim()==='+JSON.stringify(locale==='kk'?'Жаңарту':'Обновить')+')?.disabled===false,'+
      'visible:!!inbox,text:inbox?.textContent??""};'+
    '})()');
   }catch{initial=null;}
   if(initial?.rows>=minimumRows&&initial.refresh&&initial.lang===locale)break;
   await sleep(100);
  }
  assert.ok(initial?.rows>=minimumRows,
   'private seller rows must have been visible BEFORE backing session revocation: '+
    JSON.stringify(initial));
  assert.equal(initial.refresh,true,'authorized refresh must be enabled');
  assert.ok(initial.text.includes('Signed seller CI offer'),
   'pre-revocation content must include known private CI request');
  await onRevoke();
  requestStatuses=[];
  // Trigger the real UI handler, rather than navigating away or calling the BFF
  // directly. The old private rows must disappear when the BFF replies 401.
  const clicked=await evaluate('(()=>{'+
   'const inbox=[...document.querySelectorAll("main section[aria-label]")].find(s=>'+
    's.getAttribute("aria-label")==='+JSON.stringify(locale==='kk'?'Өтінімдер':'Заявки')+');'+
   'const button=[...inbox?.querySelectorAll("button")??[]].find(b=>'+
    'b.textContent?.trim()==='+JSON.stringify(locale==='kk'?'Жаңарту':'Обновить')+');'+
   'if(!button||button.disabled)return false;button.click();return true;'+
  '})()');
  assert.equal(clicked,true,'real refresh button must be actionable after revocation');
  let revoked;
  for(let i=0;i<120;i++){
   try{
    revoked=await evaluate('(()=>{'+
     'const inbox=[...document.querySelectorAll("main section[aria-label]")].find(s=>'+
      's.getAttribute("aria-label")==='+JSON.stringify(locale==='kk'?'Өтінімдер':'Заявки')+');'+
     'return {rows:inbox?.querySelectorAll("ul li").length??-1,'+
      'alert:inbox?.querySelector("[role=alert]")?.textContent?.trim()??"",'+
      'privateText:inbox?.textContent?.includes("Signed seller CI offer")??true,'+
      'lang:document.documentElement.lang};'+
    '})()');
   }catch{revoked=null;}
   if(requestStatuses.includes(401)&&revoked?.rows===0&&
      revoked.alert===(locale==='kk'?'Сессия аяқталды. Аккаунтқа қайта кіріңіз.':
       'Сессия завершена. Войдите в аккаунт снова.'))break;
   await sleep(100);
  }
  assert.ok(requestStatuses.includes(401),
   'revoked browser refresh must be denied by live BFF: '+JSON.stringify(requestStatuses));
  assert.equal(revoked?.rows,0,'private seller rows must be purged from live React view');
  assert.equal(revoked.privateText,false,'stale private titles must not survive revocation');
  assert.equal(revoked.alert,locale==='kk'?
   'Сессия аяқталды. Аккаунтқа қайта кіріңіз.':
   'Сессия завершена. Войдите в аккаунт снова.');
  assert.equal(revoked.lang,locale);
  await send('Page.navigate',{url:targetUrl});
  let denied;
  for(let i=0;i<120;i++){
   try{
    denied=await evaluate('(()=>({'+
     'ready:document.readyState==="complete",lang:document.documentElement.lang,'+
     'text:document.body?.textContent??"",privateRows:document.querySelectorAll("main ul li").length,'+
     'inbox:!![...document.querySelectorAll("main section[aria-label]")].find(s=>'+
      's.getAttribute("aria-label")==='+JSON.stringify(locale==='kk'?'Өтінімдер':'Заявки')+')'+
    '}))()');
   }catch{denied=null;}
   if(documentStatuses.includes(404)&&denied?.ready)break;
   await sleep(100);
  }
  assert.ok(documentStatuses.includes(404),
   'SSR page must fail closed after session revocation: '+JSON.stringify(documentStatuses));
  assert.equal(denied?.inbox,false,'revoked session must not hydrate seller workspace');
  assert.ok(!denied?.text.includes('Signed seller CI offer'),
   'SSR denial must never expose the cached private request title');
  assert.ok(!denied?.text.includes(sealedCookie),'session cookie must not appear in SSR HTML');
  console.log('Chrome seller session revocation -> React private rows purged + SSR 404 PASS');
 }finally{
  if(socket)socket.close();
  if(child&&!processExited)child.kill('SIGTERM');
  await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});
 }
}
