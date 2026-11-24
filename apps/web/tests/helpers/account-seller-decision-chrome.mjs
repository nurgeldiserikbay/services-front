import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

/** Real Next.js/React decision -> private BFF -> PostgreSQL, in an isolated CI account.
 * The CI server has a trusted public HTTPS origin while Chrome uses a loopback
 * transport. Chrome's Origin header is mapped to that configured CI origin;
 * cookie, CSRF, session, seller membership and decision authorization are real.
 */
export async function exerciseAccountSellerDecisionChrome({
 base,sealedCookie,requestId,locale='kk',action='accept',
}){
 assert.equal(process.env.CI,'true');
 assert.ok(action==='accept'||action==='decline','supported seller decision only');
 const dir=await mkdtemp(join(tmpdir(),'account-seller-decision-chrome-'));
 let child,socket,ended=false;
 try{
  child=spawn(process.env.CHROME_BIN??'google-chrome',[
   '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
   '--no-first-run','--remote-debugging-port=0','--user-data-dir='+dir,'about:blank',
  ],{stdio:'ignore'});
  child.once('exit',()=>{ended=true;});
  child.once('error',()=>{ended=true;});
  let port;
  for(let attempt=0;attempt<200&&!ended;attempt++){
   try{
    const raw=await readFile(join(dir,'DevToolsActivePort'),'utf8');
    const candidate=Number(raw.split('\n')[0]);
    if(Number.isInteger(candidate)&&candidate>0&&candidate<65536){
     port=candidate;break;
    }
   }catch{}
   await pause(100);
  }
  assert.ok(port,'account decision Chrome DevTools must start');
  const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const target=targets.find(t=>t.type==='page');
  assert.ok(target?.webSocketDebuggerUrl);
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{
   socket.addEventListener('open',resolve,{once:true});
   socket.addEventListener('error',reject,{once:true});
  });
  let seq=0;const pending=new Map(),decisionStatuses=[],requestAttempts=[],networkFailures=[];
  socket.addEventListener('message',event=>{
   const reply=JSON.parse(event.data);
   if(reply.method==='Fetch.requestPaused'){
     const request=reply.params?.request;
     const headers=Object.entries(request?.headers??{})
       .filter(([name])=>name.toLowerCase()!=='origin')
       .map(([name,value])=>({name,value:String(value)}));
     headers.push({name:'Origin',value:'https://services.example.test'});
     void send('Fetch.continueRequest',{
       requestId:reply.params.requestId,headers,
     }).catch(error=>networkFailures.push('continueRequest: '+error.message));
   }
   if(reply.method==='Network.requestWillBeSent'&&
      reply.params?.request?.url?.includes('/api/seller/requests/'))
     requestAttempts.push({url:reply.params.request.url,method:reply.params.request.method});
   if(reply.method==='Network.loadingFailed')
     networkFailures.push(reply.params?.errorText??'unknown network failure');
   if(reply.method==='Network.responseReceived'&&
      reply.params?.response?.url?.includes('/api/seller/requests/'+requestId+'/'+action)){
    decisionStatuses.push(reply.params.response.status);
   }
   if(!reply.id)return;
   const item=pending.get(reply.id);
   if(!item)return;
   pending.delete(reply.id);
   if(reply.error)item.reject(Error(reply.error.message));
   else item.resolve(reply.result);
  });
  async function send(method,params={}){
   const id=++seq;let timer;
   try{return await Promise.race([
    new Promise((resolve,reject)=>{
     pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));
    }),
    new Promise((_resolve,reject)=>{
     timer=setTimeout(()=>reject(Error('account decision Chrome timeout '+method)),12000);
    }),
   ]);}finally{clearTimeout(timer);pending.delete(id);}
  }
  async function evaluate(source){
   const reply=await send('Runtime.evaluate',{
    expression:source,returnByValue:true,awaitPromise:true,
   });
   if(reply.exceptionDetails)throw Error('Chrome evaluation failed: '+
    (reply.exceptionDetails.exception?.description??reply.exceptionDetails.text));
   return reply.result?.value;
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
  await send('Page.navigate',{url:new URL('/'+locale+'/account/requests',base).href});
  const shortId=requestId.slice(0,8);
  let button;
  for(let attempt=0;attempt<120;attempt++){
   try{
    button=await evaluate('(()=>{'+
     'const inbox=[...document.querySelectorAll("main section[aria-label]")].find(x=>'+
       'x.getAttribute("aria-label")==='+JSON.stringify(locale==='kk'?'Өтінімдер':'Заявки')+');'+
     'const name='+JSON.stringify(shortId)+';'+
     'const node=[...inbox?.querySelectorAll("button[aria-label]")??[]].find(b=>'+
       'b.getAttribute("aria-label")?.startsWith('+
         JSON.stringify(action==='accept'?(locale==='kk'?'Қабылдау:':'Принять:'):(locale==='kk'?'Бас тарту:':'Отклонить:'))+')&&'+
       'b.getAttribute("aria-label")?.endsWith("№ "+name));'+
     'if(!node||node.disabled||!node.isConnected)return null;'+
     'const rect=node.getBoundingClientRect();node.focus();'+
     'return {label:node.getAttribute("aria-label"),focused:document.activeElement===node,'+
       'width:rect.width,left:rect.left,right:rect.right,lang:document.documentElement.lang};'+
    '})()');
   }catch{button=null;}
   if(button?.focused&&button.width>0)break;
   await pause(100);
  }
  assert.ok(button?.focused,'real pending row must have focusable '+action+' button');
  assert.equal(button.lang,locale);
  assert.ok(button.width>0&&button.left>=-1&&button.right<=376,
   'seller decision must not be clipped at 375px');
  const ax=await send('Accessibility.getFullAXTree');
  assert.ok(ax.nodes?.some(n=>!n.ignored&&n.role?.value==='button'&&
    n.name?.value===button.label),'seller decision must have Chrome AX name');
  // The deployment origin is HTTPS; the test-only transport is loopback HTTP.
  // Intercept only this seller decision POST and map Origin at the network layer;
  // browser authentication, CSRF, body, session and backend response stay real.
  await send('Fetch.enable',{patterns:[{
   urlPattern:'*/api/seller/requests/*/'+action,requestStage:'Request',
  }]});
  await send('Input.dispatchKeyEvent',{
   type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,
   text:'\r',unmodifiedText:'\r',
  });
  await send('Input.dispatchKeyEvent',{
   type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,
  });
  let state;
  for(let attempt=0;attempt<120;attempt++){
   try{
    state=await evaluate('(()=>{'+
     'const section=[...document.querySelectorAll("main section[aria-label]")].find(x=>'+
       'x.getAttribute("aria-label")==='+JSON.stringify(locale==='kk'?'Өтінімдер':'Заявки')+');'+
     'const matching=[...section?.querySelectorAll("li")??[]].find(li=>'+
       'li.textContent?.includes('+JSON.stringify(shortId)+')||'+
       '[...li.querySelectorAll("button[aria-label]")].some(b=>'+
        'b.getAttribute("aria-label")?.endsWith('+JSON.stringify('№ '+shortId)+')));'+
     'const items=[...section?.querySelectorAll("li")??[]];'+
     'return {path:location.pathname,lang:document.documentElement.lang,'+
      'statuses:items.map(li=>li.querySelector("span")?.textContent?.trim()??""),'+
      'pendingActions:[...section?.querySelectorAll("button[aria-label]")??[]].filter(b=>'+
        'b.getAttribute("aria-label")?.endsWith('+JSON.stringify('№ '+shortId)+')).length,'+
      'alerts:[...section?.querySelectorAll("[role=alert]")??[]].map(n=>n.textContent?.trim()),'+
      'text:section?.textContent??""};'+
    '})()');
   }catch{state=null;}
   if(decisionStatuses.includes(200)&&state?.statuses.includes(action==='accept'?'accepted':'declined')&&
      state.pendingActions===0)break;
   await pause(100);
  }
  const diagnostic=await evaluate('(()=>({'+
    'active:document.activeElement?.getAttribute("aria-label")??null,'+
    'path:location.pathname,ready:document.readyState,'+
    'errors:[...document.querySelectorAll("[role=alert]")].map(n=>n.textContent?.trim()),'+
    'pendingButtons:[...document.querySelectorAll("button[aria-label]")].map(n=>({'+
      'name:n.getAttribute("aria-label"),disabled:n.disabled}))'+
   '}))()');
  assert.deepEqual(decisionStatuses,[200],
   'real browser decision response: '+JSON.stringify({
     requestAttempts,networkFailures,diagnostic,state,decisionStatuses,
   }));
  assert.equal(state?.lang,locale);
  assert.ok(state?.statuses.includes(action==='accept'?'accepted':'declined'),
   'React inbox must refresh and render '+action+' status after BFF commit: '+JSON.stringify(state));
  assert.equal(state?.pendingActions,0,'finalized request cannot retain action buttons');
  assert.deepEqual(state?.alerts,[],'successful decision must not show an error');
  assert.ok(!state.text.includes(sealedCookie));
  console.log('Chrome authenticated account seller '+action+' -> live refreshed status '+locale+' PASS');
 }finally{
  if(socket)socket.close();
  if(child&&!ended)child.kill('SIGTERM');
  await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});
 }
}
