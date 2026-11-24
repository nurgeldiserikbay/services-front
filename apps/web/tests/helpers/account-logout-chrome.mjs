import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

/** Real signed test account → Chrome logout click → BFF → backend revoke. */
export async function exerciseAccountLogoutChrome({base,sealedCookie,locale='kk'}){
 assert.equal(process.env.CI,'true');
 const dir=await mkdtemp(join(tmpdir(),'account-logout-chrome-'));
 let child,socket,exited=false;
 try{
  child=spawn(process.env.CHROME_BIN??'google-chrome',[
   '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
   '--no-first-run','--remote-debugging-port=0','--user-data-dir='+dir,'about:blank',
  ],{stdio:'ignore'});
  child.once('exit',()=>{exited=true;});
  child.once('error',()=>{exited=true;});
  let port;
  for(let i=0;i<200&&!exited;i++){
   try{
    port=Number((await readFile(join(dir,'DevToolsActivePort'),'utf8')).split('\n')[0]);
    if(Number.isInteger(port)&&port>0&&port<65536)break;
   }catch{}
   await sleep(100);
  }
  assert.ok(port,'Chrome logout DevTools must start');
  const pages=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const target=pages.find(x=>x.type==='page');
  assert.ok(target?.webSocketDebuggerUrl);
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{
   socket.addEventListener('open',resolve,{once:true});
   socket.addEventListener('error',reject,{once:true});
  });
  let id=0;const waiting=new Map(),logoutStatuses=[],inventoryStatuses=[],networkFailures=[];
  socket.addEventListener('message',event=>{
   const reply=JSON.parse(event.data);
   if(reply.method==='Fetch.requestPaused'){
    const request=reply.params.request;
    const headers=Object.entries(request.headers??{})
     .filter(([name])=>name.toLowerCase()!=='origin')
     .map(([name,value])=>({name,value:String(value)}));
    headers.push({name:'Origin',value:'https://services.example.test'});
    void send('Fetch.continueRequest',{requestId:reply.params.requestId,headers})
     .catch(err=>networkFailures.push('intercept '+err.message));
   }
   if(reply.method==='Network.responseReceived'){
    const url=reply.params.response.url;
    if(url.includes('/api/account/logout'))logoutStatuses.push(reply.params.response.status);
    if(url.includes('/api/account/sessions'))inventoryStatuses.push(reply.params.response.status);
   }
   if(reply.method==='Network.loadingFailed')
    networkFailures.push(reply.params?.errorText??'unknown');
   if(!reply.id)return;
   const promise=waiting.get(reply.id);
   if(!promise)return;
   waiting.delete(reply.id);
   if(reply.error)promise.reject(Error(reply.error.message));
   else promise.resolve(reply.result);
  });
  async function send(method,params={}){
   const next=++id;let timer;
   try{return await Promise.race([
    new Promise((resolve,reject)=>{
     waiting.set(next,{resolve,reject});
     socket.send(JSON.stringify({id:next,method,params}));
    }),
    new Promise((_resolve,reject)=>{
     timer=setTimeout(()=>reject(Error('Chrome logout '+method+' timeout')),12000);
    }),
   ]);}finally{clearTimeout(timer);waiting.delete(next);}
  }
  async function evaluate(expression){
   const result=await send('Runtime.evaluate',{
    expression,returnByValue:true,awaitPromise:true,
   });
   if(result.exceptionDetails)throw Error('Chrome logout evaluation failed: '+
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
  await send('Page.navigate',{url:new URL('/'+locale+'/account',base).href});
  let button;
  const expected=locale==='kk'?'Аккаунттан шығу':'Выйти из аккаунта';
  for(let i=0;i<120;i++){
   try{
    button=await evaluate('(()=>{'+
     'const target=[...document.querySelectorAll("main button")].find(b=>'+
      'b.textContent?.trim()==='+JSON.stringify(expected)+');'+
     'if(!target||target.disabled||!target.isConnected)return null;'+
     'const rect=target.getBoundingClientRect();target.focus();'+
     'return {focused:document.activeElement===target,name:target.textContent.trim(),'+
      'width:rect.width,left:rect.left,right:rect.right,height:rect.height};'+
    '})()');
   }catch{button=null;}
   if(button?.focused)break;
   await sleep(100);
  }
  assert.equal(button?.name,expected,'authorized account must render logout button');
  assert.equal(button.focused,true,'logout button must take keyboard focus');
  assert.ok(button.height>=44&&button.width>0&&button.left>=-1&&button.right<=376,
   'mobile logout target must fit 375px viewport');
  const ax=await send('Accessibility.getFullAXTree');
  assert.ok(ax.nodes?.some(node=>!node.ignored&&node.role?.value==='button'&&
    node.name?.value===expected),'Chrome accessibility name for sign out');
  // Only the POST Origin is mapped to the configured CI HTTPS origin;
  // the real cookie, CSRF, backend revocation and response remain unchanged.
  await send('Fetch.enable',{patterns:[{
   urlPattern:'*/api/account/logout',requestStage:'Request',
  }]});
  await send('Input.dispatchKeyEvent',{
   type:'keyDown',key:'Enter',code:'Enter',
   windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r',
  });
  await send('Input.dispatchKeyEvent',{
   type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,
  });
  let result;
  for(let i=0;i<120;i++){
   try{
    result=await evaluate('(()=>({'+
     'path:location.pathname,ready:document.readyState==="complete",'+
     'privatePanel:!!document.querySelector("main [aria-label] button"),'+
     'text:document.body?.textContent??""'+
    '}))()');
   }catch{result=null;}
   if(logoutStatuses.includes(204)&&result?.path==='/'+locale&&result.ready)break;
   await sleep(100);
  }
  assert.deepEqual(logoutStatuses,[204],
   'real Chrome must confirm only one BFF logout: '+JSON.stringify({
    logoutStatuses,inventoryStatuses,networkFailures,result,
   }));
  assert.ok(inventoryStatuses.includes(200),'CSRF must be read via the real session BFF');
  assert.equal(result?.path,'/'+locale,'successful logout returns to public catalog');
  assert.ok(!result?.text.includes('Мой аккаунт')&&!result?.text.includes('Менің аккаунтым'),
   'protected account home content must be removed after full navigation');
  const cookies=(await send('Network.getCookies',{urls:[base]})).cookies??[];
  assert.equal(cookies.some(c=>c.name==='__Host-services_account_web'),false,
   'server must clear HttpOnly session cookie after logout');
  console.log('Chrome account logout -> real BFF 204 -> public navigation + cookie purge PASS');
 }finally{
  if(socket)socket.close();
  if(child&&!exited)child.kill('SIGTERM');
  await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});
 }
}
