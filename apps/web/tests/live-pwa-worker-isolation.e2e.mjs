import assert from 'node:assert/strict';
import vm from 'node:vm';

// Exercise the ACTUAL worker served by the built Next.js production server.
// These checks do not substitute for a device install/offline browser test.
const base=process.env.WEB_BASE_URL??'http://127.0.0.1:3000';
const origin=new URL(base).origin;
const response=await fetch(new URL('/sw.js',base),{
  signal:AbortSignal.timeout(8000),redirect:'error',
});
assert.equal(response.status,200,'production worker must be served');
assert.match(response.headers.get('content-type')??'',/javascript/i);
assert.match(response.headers.get('cache-control')??'',/no-store/i);
const worker=await response.text();
assert.ok(worker.length>100&&worker.length<32768,'worker must be bounded');

const listeners=new Map();
const operations=[];
const offlineShell={status:200,body:'PUBLIC_OFFLINE_SHELL_ONLY'};
const cache={
  add:async path=>{operations.push(['cache.add',path]);},
  match:async path=>{operations.push(['cache.match',path]);return path==='/offline.html'?offlineShell:null;},
  put:async(...args)=>{operations.push(['cache.put',...args]);throw Error('unexpected cache write');},
};
const caches={
  open:async name=>{operations.push(['caches.open',name]);return cache;},
  keys:async()=>[],
  delete:async name=>{operations.push(['caches.delete',name]);return true;},
};
const self={
  location:{origin},
  skipWaiting:async()=>{},
  clients:{claim:async()=>{}},
  addEventListener:(name,listener)=>{listeners.set(name,listener);},
};
let offline=true;
const networkFetch=async request=>{
  operations.push(['fetch',request.url]);
  if(offline)throw Error('offline simulation');
  return {status:200,body:'LIVE_NETWORK_RESULT'};
};
vm.runInNewContext(worker,{self,caches,fetch:networkFetch,URL,Response,Promise},{timeout:1500});
assert.ok(listeners.has('fetch')&&listeners.has('install'),'worker listeners must register');

function dispatch(path,{mode='navigate',method='GET'}={}){
  let answer;
  const request={url:new URL(path,origin).href,mode,method};
  listeners.get('fetch')({request,respondWith:promise=>{answer=promise;}});
  return answer;
}
for(const path of [
  '/api/guest-requests','/api/guest-requests/11111111-1111-4111-8111-111111111111/status',
  '/api/account/notifications','/api/seller/requests',
  '/kk/account','/ru/account/notifications','/kk/seller/requests',
  '/ru/services/123/edit','/kk/services/account%2Frequests',
  '/kk/services/abc/','/kk//services/abc',
]){
  assert.equal(dispatch(path),undefined,path+' must bypass worker');
}
assert.equal(dispatch('/kk',{method:'POST'}),undefined);
assert.equal(dispatch('/ru',{mode:'cors'}),undefined);
assert.equal(dispatch('https://outside.example.test/kk'),undefined);
assert.deepEqual(operations,[],'private routes must not trigger fetch or Cache Storage via worker');

// The only cached fallback is public, never a private response.
assert.equal(await dispatch('/kk/services/123'),offlineShell);
assert.deepEqual(operations.map(([kind,value])=>[kind,value]),[
  ['fetch',origin+'/kk/services/123'],
  ['caches.open','services-offline-shell-v1'],
  ['cache.match','/offline.html'],
]);
assert.ok(!operations.some(([kind])=>kind==='cache.put'));
operations.length=0;
offline=false;
const live=await dispatch('/ru/professionals/123');
assert.equal(live.body,'LIVE_NETWORK_RESULT');
assert.deepEqual(operations,[['fetch',origin+'/ru/professionals/123']]);
console.log('Live production worker rejects all private/API interception and caches only generic fallback');
