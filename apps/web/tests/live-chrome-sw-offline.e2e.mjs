import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

// Actual Chromium service worker registration, Cache Storage and offline mode.
// Headless desktop Chrome does not establish Android installability.
const base=process.env.WEB_BASE_URL??'http://127.0.0.1:3000';
const origin=new URL(base).origin;
const dir=await mkdtemp(join(tmpdir(),'services-sw-chrome-'));
const proc=spawn(process.env.CHROME_BIN??'google-chrome',[
 '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
 '--no-first-run','--no-default-browser-check','--remote-debugging-port=0',
 '--user-data-dir='+dir,'about:blank',
],{stdio:'ignore'});
let exited=false;
proc.once('exit',()=>{exited=true;});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let ws;
try{
 let port;
 for(let n=0;n<250;n++){
  if(exited)throw Error('Chrome unexpectedly exited');
  try{
   const lines=(await readFile(join(dir,'DevToolsActivePort'),'utf8')).split('\n');
   port=Number(lines[0]);
   if(Number.isInteger(port)&&port>0)break;
  }catch{}
  await sleep(100);
 }
 assert.ok(port,'Chrome did not expose DevTools');
 const targets=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
 const tab=targets.find(x=>x.type==='page');
 assert.ok(tab?.webSocketDebuggerUrl);
 ws=new WebSocket(tab.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{
  ws.addEventListener('open',resolve,{once:true});
  ws.addEventListener('error',reject,{once:true});
 });
 let id=0;
 const pending=new Map();
 ws.addEventListener('message',event=>{
  const msg=JSON.parse(event.data);
  if(!msg.id)return;
  const job=pending.get(msg.id);
  if(!job)return;
  pending.delete(msg.id);
  if(msg.error)job.reject(Error(msg.error.message));
  else job.resolve(msg.result);
 });
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{
  const current=++id;
  const timeout=setTimeout(()=>{
   pending.delete(current);
   reject(Error('DevTools timeout: '+method));
  },10000);
  pending.set(current,{
   resolve:value=>{clearTimeout(timeout);resolve(value);},
   reject:error=>{clearTimeout(timeout);reject(error);},
  });
  ws.send(JSON.stringify({id:current,method,params,...(sessionId?{sessionId}:{})}));
 });
 const evaluate=async expression=>{
  const result=await send('Runtime.evaluate',{
   expression,returnByValue:true,awaitPromise:true,
  });
  if(result.exceptionDetails)throw Error(result.exceptionDetails.text);
  return result.result?.value;
 };
 const until=async(fn,label)=>{
  for(let n=0;n<90;n++){
   try{const value=await fn();if(value)return value;}catch{}
   await sleep(120);
  }
  throw Error('Chrome condition timed out: '+label);
 };
 await send('Page.enable');
 await send('Runtime.enable');
 await send('Network.enable');
 await send('Page.navigate',{url:origin+'/kk'});
 await until(()=>evaluate('document.readyState==="complete" && document.documentElement.lang==="kk"'),'initial page');
 // React's OfflineRegistration registers /sw.js on the actual page.
 await until(()=>evaluate('(async()=>{const r=await navigator.serviceWorker.getRegistration("/");return !!r?.active&&!!navigator.serviceWorker.controller})()'),'registered and controlling worker');
 const before=await evaluate('(async()=>{const names=await caches.keys();const details=[];for(const name of names){const cache=await caches.open(name);const keys=await cache.keys();details.push({name,urls:keys.map(x=>new URL(x.url).pathname)});}return details})()');
 assert.deepEqual(before,[{name:'services-offline-shell-v1',urls:['/offline.html']}],
  'only generic public offline page may be cached');
 // Chromium service workers run in a separate DevTools target. Offline
 // emulation on the page target alone can leave the worker network online,
 // so explicitly make both the document and its active worker offline.
 const workerTargets=await send('Target.getTargets');
 const serviceWorker=workerTargets.targetInfos.find(x=>x.type==='service_worker'&&x.url.startsWith(origin+'/sw.js'));
 assert.ok(serviceWorker,'active service worker DevTools target must exist');
 const attached=await send('Target.attachToTarget',{targetId:serviceWorker.targetId,flatten:true});
 assert.ok(attached.sessionId,'Chrome must attach to worker target');
 await send('Network.enable',{},attached.sessionId);
 const noNetwork={offline:true,latency:0,downloadThroughput:0,uploadThroughput:0};
 await send('Network.emulateNetworkConditions',noNetwork,attached.sessionId);
 await send('Network.emulateNetworkConditions',noNetwork);
 await send('Page.navigate',{url:origin+'/ru'});
 await until(()=>evaluate('document.querySelector("main#main-content")?.textContent?.includes("Нет подключения")===true'),'offline public navigation');
 const offline=await evaluate('({body:document.body.textContent,lang:document.documentElement.lang})');
 assert.match(offline.body,/Нет подключения/);
 // Test the actual controlled page's fetch interceptor, not a mock worker.
 const privateChecks=await evaluate('(async()=>{const urls=["/api/guest-requests","/api/account/notifications","/api/seller/requests"];const out=[];for(const path of urls){try{const response=await fetch(path,{cache:"no-store",signal:AbortSignal.timeout(3000)});out.push({path,status:response.status});}catch{out.push({path,status:"network-failed"});}}return out;})()');
 assert.ok(privateChecks.every(x=>x.status==='network-failed'),
  'private API requests must fail offline without cached successful responses: '+JSON.stringify(privateChecks));
 const after=await evaluate('(async()=>{const names=await caches.keys();const results=[];for(const name of names){const entries=await(await caches.open(name)).keys();results.push({name,urls:entries.map(x=>new URL(x.url).pathname)});}return results})()');
 assert.deepEqual(after,before,'private requests must not add Cache Storage entries');
 const online={offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1};
 await send('Network.emulateNetworkConditions',online,attached.sessionId);
 await send('Network.emulateNetworkConditions',online);
 await send('Page.navigate',{url:origin+'/kk'});
 await until(()=>evaluate('document.documentElement.lang==="kk" && !!document.querySelector("form[role=search]")'),'online recovery');
 console.log('Real Chrome SW: registered, controlled, public offline fallback, private failures, no cache leakage, and recovery');
}finally{
 if(ws)ws.close();
 if(!exited)proc.kill('SIGTERM');
 await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
