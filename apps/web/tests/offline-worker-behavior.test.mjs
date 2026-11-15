import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';

const source=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
const origin='https://services.example.test';
function harness({offline=false,networkStatus=200,cacheNames=[],cacheAddFails=false,missingFallback=false,cacheOpenFails=false}={}){
  const listeners=new Map();
  const calls=[];
  const fallback={status:200,body:'generic offline shell'};
  const cache={
    add:async path=>{calls.push(['cache.add',path]);if(cacheAddFails)throw new Error('cache unavailable');},
    match:async path=>{calls.push(['cache.match',path]);return path==='/offline.html'&&!missingFallback?fallback:undefined;},
  };
  const caches={
    open:async name=>{calls.push(['caches.open',name]);if(cacheOpenFails)throw new Error('storage unavailable');return cache;},
    keys:async()=>cacheNames,
    delete:async name=>{calls.push(['caches.delete',name]);return true;},
  };
  const self={location:{origin},clients:{claim:async()=>{calls.push(['clients.claim']);}},skipWaiting:()=>{calls.push(['skipWaiting']);},addEventListener:(type,fn)=>listeners.set(type,fn)};
  const fetch=async request=>{
    calls.push(['fetch',request.url]);
    if(offline)throw new Error('offline');
    return {status:networkStatus,body:'network'};
  };
  vm.runInNewContext(source,{self,caches,fetch,URL,Response,Promise},{timeout:1000});
  return {listeners,calls,fallback};
}
function dispatch(h,url,{mode='navigate',method='GET'}={}){
  let response;
  const request={url:new URL(url,origin).href,mode,method};
  h.listeners.get('fetch')({request,respondWith:promise=>{response=promise;}});
  return response;
}

test('only public navigations receive the generic offline shell',async()=>{
  const h=harness({offline:true});
  for(const path of ['/kk','/ru','/kk/professionals/abc','/ru/organizations/123','/kk/services/456']){
    assert.equal(await dispatch(h,path),h.fallback,path);
  }
  assert.equal(h.calls.filter(([name])=>name==='cache.match').length,5);
  assert.ok(h.calls.filter(([name])=>name==='cache.match').every(([,path])=>path==='/offline.html'));
});

test('account, seller, API, mutations and cross-origin traffic bypass worker',()=>{
  const h=harness({offline:true});
  for(const path of ['/kk/account/requests','/ru/seller/requests','/api/account/sessions','/api/guest-requests','/kk/professionals/abc/extra','/en','https://elsewhere.test/kk']){
    assert.equal(dispatch(h,path),undefined,path);
  }
  assert.equal(dispatch(h,'/kk',{method:'POST'}),undefined);
  assert.equal(dispatch(h,'/kk',{mode:'cors'}),undefined);
  assert.deepEqual(h.calls,[]);
});

test('successful public navigations always use fresh network responses',async()=>{
  const h=harness();
  const result=await dispatch(h,'/kk/professionals/abc');
  assert.equal(result.status,200);
  assert.equal(result.body,'network');
  assert.equal(h.calls.filter(([name])=>name==='cache.match').length,0);
});

test('install pre-caches only the static offline shell',async()=>{
  const h=harness();
  let install;
  h.listeners.get('install')({waitUntil:promise=>{install=promise;}});
  await install;
  assert.deepEqual(h.calls.map(([action,value])=>[action,value]),[
    ['caches.open','services-offline-shell-v1'],
    ['cache.add','/offline.html'],
    ['skipWaiting',undefined],
  ]);
});


test('activation deletes only obsolete Services offline shell caches',async()=>{
  const h=harness({cacheNames:[
    'services-offline-shell-v0',
    'services-offline-shell-v1',
    'another-app-cache',
  ]});
  let activation;
  h.listeners.get('activate')({waitUntil:promise=>{activation=promise;}});
  await activation;
  const deleted=h.calls.filter(([name])=>name==='caches.delete').map(([,name])=>name);
  assert.deepEqual(deleted,['services-offline-shell-v0']);
});


test('worker does not skip waiting if offline shell precache fails',async()=>{
  const h=harness({cacheAddFails:true});
  let install;
  h.listeners.get('install')({waitUntil:promise=>{install=promise;}});
  await assert.rejects(install,/cache unavailable/);
  assert.equal(h.calls.some(([name])=>name==='skipWaiting'),false);
});

test('worker claims clients only after obsolete caches are deleted',async()=>{
  const h=harness({cacheNames:['services-offline-shell-v0']});
  let activation;
  h.listeners.get('activate')({waitUntil:promise=>{activation=promise;}});
  await activation;
  const actions=h.calls.map(([name])=>name);
  assert.ok(actions.indexOf('caches.delete')>=0);
  assert.ok(actions.indexOf('clients.claim')>actions.indexOf('caches.delete'));
});


test('transient gateway 502/503/504 responses show only generic offline shell',async()=>{
  for(const networkStatus of [502,503,504]){
    const h=harness({networkStatus});
    assert.equal(await dispatch(h,'/ru/services/123'),h.fallback);
    assert.equal(h.calls.filter(([name])=>name==='cache.match').length,1);
  }
});

test('application 401/403/404/429/500 responses remain unmodified and uncached',async()=>{
  for(const networkStatus of [401,403,404,429,500]){
    const h=harness({networkStatus});
    const response=await dispatch(h,'/kk/professionals/abc');
    assert.equal(response.status,networkStatus);
    assert.equal(h.calls.filter(([name])=>name==='cache.match').length,0);
  }
});


test('missing cached offline shell fails closed instead of returning private data',async()=>{
  const h=harness({offline:true,missingFallback:true});
  const response=await dispatch(h,'/kk');
  assert.equal(response.type,'error');
  assert.equal(h.calls.filter(([name])=>name==='cache.match').length,1);
  assert.equal(dispatch(h,'/kk/account/requests'),undefined);
});


test('private workspace routes and API calls never invoke network or cache via worker',()=>{
  const h=harness({offline:true});
  for(const path of [
    '/kk/account','/kk/account/requests','/ru/account/devices',
    '/kk/seller','/ru/seller/requests','/api','/api/guest-requests',
    '/kk/services/123/edit','/ru/organizations/123/members',
    '/kk/professionals/123/requests','/kk/accounting',
  ]){
    assert.equal(dispatch(h,path),undefined,path);
  }
  assert.deepEqual(h.calls,[]);
});

test('public catalog navigation ignores query parameters and never caches responses',async()=>{
  const h=harness({offline:true});
  for(const path of ['/kk?q=service','/ru?sort=recent',
    '/kk/professionals/abc?source=search','/ru/services/42?ref=profile']){
    assert.equal(await dispatch(h,path),h.fallback,path);
  }
  assert.equal(h.calls.filter(([name])=>name==='cache.match').length,4);
  assert.equal(h.calls.filter(([name])=>name==='cache.put').length,0);
});


test('unavailable browser Cache Storage returns a network error for public offline navigation',async()=>{
  for(const networkStatus of [200,503]){
    const h=harness({offline:networkStatus===200,networkStatus,cacheOpenFails:true});
    const response=await dispatch(h,'/ru/professionals/123');
    assert.equal(response.type,'error');
    assert.equal(h.calls.filter(([name])=>name==='caches.open').length,1);
    assert.equal(dispatch(h,'/ru/account/requests'),undefined);
  }
});


test('encoded path separators cannot disguise private nested routes as public profiles',()=>{
  const h=harness({offline:true});
  for(const path of [
    '/kk/services/account%2Frequests',
    '/ru/professionals/seller%2frequests',
    '/kk/organizations/api%5Cprivate',
    '/ru/services/account%5cdevices',
  ]){
    assert.equal(dispatch(h,path),undefined,path);
  }
  assert.deepEqual(h.calls,[]);
});


test('encoded profile identifiers and encoded route components bypass offline interception',()=>{
  const h=harness({offline:true});
  for(const path of [
    '/kk/services/%61ccount',
    '/ru/professionals/%2e%2e%2faccount',
    '/kk/organizations/company%252Fprivate',
    '/ru/services/%5cprivate',
    '/kk/%73ervices/123',
  ]){
    assert.equal(dispatch(h,path),undefined,path);
  }
  assert.deepEqual(h.calls,[]);
});


test('noncanonical repeated and trailing slash URLs bypass the offline worker',()=>{
  const h=harness({offline:true});
  for(const path of [
    '/kk/','/ru//','/kk//services/123','/ru/services//123',
    '/kk/professionals/123/','/ru/organizations/123//',
  ]){
    assert.equal(dispatch(h,path),undefined,path);
  }
  assert.deepEqual(h.calls,[]);
});
