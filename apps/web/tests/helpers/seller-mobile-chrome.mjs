import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

// Runs only with a disposable PostgreSQL-backed seller fixture.
// Never authorizes a real user or exercises external OTP delivery.
export async function exerciseSellerMobileChrome({base,sealedCookie,requestId}){
 assert.equal(process.env.CI,'true');
 const dir=await mkdtemp(join(tmpdir(),'seller-mobile-chrome-'));
 const child=spawn(process.env.CHROME_BIN??'google-chrome',[
  '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
  '--no-first-run','--remote-debugging-port=0','--user-data-dir='+dir,'about:blank',
 ],{stdio:'ignore'});
 let closed=false,socket;
 child.once('exit',()=>{closed=true;});
 child.once('error',()=>{closed=true;});
 try{
  let port;
  for(let attempt=0;attempt<250&&!closed;attempt++){
   try{
    const data=await readFile(join(dir,'DevToolsActivePort'),'utf8');
    const candidate=Number(data.split('\n')[0]);
    if(Number.isInteger(candidate)&&candidate>0&&candidate<65536){port=candidate;break;}
   }catch{}
   await pause(100);
  }
  assert.ok(port,'Seller mobile Chrome must start');
  const targets=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const tab=targets.find(x=>x.type==='page');
  assert.ok(tab?.webSocketDebuggerUrl);
  socket=new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{
   socket.addEventListener('open',resolve,{once:true});
   socket.addEventListener('error',reject,{once:true});
  });
  let seq=0;
  const pending=new Map();
  socket.addEventListener('message',event=>{
   const result=JSON.parse(event.data);
   const job=pending.get(result.id);
   if(!job)return;
   pending.delete(result.id);
   if(result.error)job.reject(Error(result.error.message));
   else job.resolve(result.result);
  });
  async function send(method,params={}){
   const id=++seq;
   let timeout;
   try{return await Promise.race([
    new Promise((resolve,reject)=>{
     pending.set(id,{resolve,reject});
     socket.send(JSON.stringify({id,method,params}));
    }),
    new Promise((_resolve,reject)=>{
     timeout=setTimeout(()=>reject(Error('Chrome DevTools timeout: '+method)),12000);
    }),
   ]);}finally{clearTimeout(timeout);pending.delete(id);}
  }
  async function evaluate(expression){
   const response=await send('Runtime.evaluate',{
    expression,returnByValue:true,awaitPromise:true,
   });
   if(response.exceptionDetails)throw Error('Chrome execution context: '+response.exceptionDetails.text);
   return response.result?.value;
  }
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  const cookie=await send('Network.setCookie',{
   name:'__Host-services_account_web',value:sealedCookie,url:base,
   secure:true,httpOnly:true,sameSite:'Strict',path:'/',
  });
  assert.equal(cookie.success,true);
  const browserCookies=(await send('Network.getCookies',{urls:[base]})).cookies??[];
  assert.ok(browserCookies.some(c=>c.name==='__Host-services_account_web'&&c.httpOnly&&c.secure));
  for(const width of [320,375,768]){
   await send('Emulation.setDeviceMetricsOverride',{
    width,height:740,deviceScaleFactor:1,mobile:true,
   });
   for(const locale of ['kk','ru']){
    await send('Page.navigate',{url:new URL('/'+locale+'/seller/requests',base).href});
    let state;
    for(let attempt=0;attempt<120;attempt++){
     try{
      state=await evaluate('(()=>{'+
       'const main=document.querySelector("main#main-content");'+
       'const sections=[...document.querySelectorAll("section[aria-label]")];'+
       'const buttons=[...main?.querySelectorAll("button")??[]];'+
       'const visible=buttons.filter(b=>b.getBoundingClientRect().width>0);'+
       'return {ready:document.readyState==="complete",'+
       'lang:document.documentElement.lang,'+
       'title:main?.querySelector("h1")?.textContent?.trim()??"",'+
       'documentWidth:document.documentElement.scrollWidth,viewport:innerWidth,'+
       'requestVisible:main?.textContent?.includes("Signed seller CI offer")??false,'+
       'requestIdVisible:main?.textContent?.includes("'+requestId+'")??false,'+
       'buttonCount:visible.length,'+
       'filters:main?.querySelectorAll("button[aria-pressed]").length??0,'+
       'controls:visible.map(b=>{const r=b.getBoundingClientRect();'+
       'return {name:b.textContent?.trim()??"",width:r.width,left:r.left,right:r.right};})'+
       '};})()');
     }catch(error){
      // Next may replace the prior JS context while navigating.
      if(attempt===119)throw error;
      await pause(100);
      continue;
     }
     if(state.ready&&state.requestVisible&&state.filters>=4)break;
     await pause(100);
    }
    assert.equal(state.lang,locale);
    assert.equal(state.title,locale==='kk'?'Менің өтінімдерім':'Мои заявки');
    assert.equal(state.requestVisible,true,'authorized seller must see seeded request');
    assert.ok(state.filters>=4,'seller status filters required');
    assert.ok(state.buttonCount>=6,'seller filters and actions required');
    assert.ok(state.documentWidth<=state.viewport+1,
     'seller viewport overflow '+locale+' '+width+': '+JSON.stringify(state));
    for(const control of state.controls){
     assert.ok(control.width>0&&control.left>=-1&&control.right<=width+1,
      'seller clipped control '+locale+' '+width+': '+JSON.stringify(control));
    }
    console.log('Live signed-in seller Chrome '+locale+' '+width+'px PASS');
   }
  }
 }finally{
  if(socket)socket.close();
  if(!closed)child.kill('SIGTERM');
  await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});
 }
}
