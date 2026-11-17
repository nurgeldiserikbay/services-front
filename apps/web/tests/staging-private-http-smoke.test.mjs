import assert from 'node:assert/strict';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {checkPrivateStaging} from '../../../scripts/check-staging-private.mjs';

const origin='https://staging.example.kz';
const account=['/kk/account/requests','/ru/account/requests',
  '/kk/account/notifications','/ru/account/notifications',
  '/kk/account/devices','/ru/account/devices'];
const seller=['/kk/seller/requests','/ru/seller/requests'];
const api=['/api/account/notifications','/api/seller/requests?limit=1',
  '/api/guest-requests/00000000-0000-4000-8000-000000000000/status'];
function fakeFetch(overrides={}){
  const visited=[];
  return {
    visited,
    fetchImpl:async(url,opts)=>{
      visited.push({url,opts});
      const path=url.pathname;
      const isApi=path.startsWith('/api/');
      const isSeller=seller.includes(path);
      const spec=overrides[url.pathname+url.search]??overrides[path]??{};
      const body=spec.body??(isApi?JSON.stringify({code:'UNAVAILABLE'}):isSeller?
        '<html><h1>'+(path.startsWith('/kk')?'Менің өтінімдерім':'Мои заявки')+'</h1></html>':
        '<html><p>404: This page could not be found</p></html>');
      return new Response(body,{
        status:spec.status??(isApi?404:isSeller?200:404),
        headers:{
          'cache-control':'private, no-store, max-age=0',
          'x-robots-tag':'noindex, nofollow',
          'content-type':isApi?'application/json':'text/html; charset=utf-8',
          ...(isApi?{'referrer-policy':'no-referrer'}:{}),
          ...spec.headers,
        },
      });
    },
  };
}

test('staging anonymous private HTTP smoke covers all kk/ru workspaces without cookies',async()=>{
  const {fetchImpl,visited}=fakeFetch();
  const result=await checkPrivateStaging(origin,{fetchImpl});
  assert.equal(result.kind,'anonymous-private-staging-http-only');
  assert.deepEqual(visited.map(x=>x.url.pathname+x.url.search),[...account,...seller,...api]);
  assert.equal(result.checked.length,11);
  for(const {opts} of visited){
    assert.equal(opts.method,'GET');
    assert.equal(opts.credentials,'omit');
    assert.equal(opts.redirect,'manual');
    assert.deepEqual(opts.headers,opts.headers.Accept==='application/json'?
      {Accept:'application/json','Sec-Fetch-Site':'same-origin'}:{Accept:'text/html'});
  }
  assert.match(result.disclaimer,/No authenticated login/);
});

test('streamed anonymous account denial 200 requires explicit not-found signal',async()=>{
  const {fetchImpl}=fakeFetch({'/kk/account/requests':{
    status:200,body:'<html>NEXT_HTTP_ERROR_FALLBACK;404</html>',
  }});
  const result=await checkPrivateStaging(origin,{fetchImpl});
  assert.equal(result.checked[0].status,200);
});

test('staging smoke rejects public caching, indexing, leaks and false authorization',async()=>{
  const cases=[
    {'/kk/account/requests':{status:200,body:'<html>private account data</html>'}},
    {'/ru/account/notifications':{headers:{'cache-control':'public, max-age=3600'}}},
    {'/kk/seller/requests':{headers:{'x-robots-tag':'index, follow'}}},
    {'/ru/seller/requests':{headers:{'set-cookie':'__Host-services_account_web=token'}}},
    {'/kk/account/devices':{headers:{'content-type':'application/json'}}},
    {'/ru/account/devices':{body:'<html>serviceOfferId</html>'}},
    {'/kk/account/requests':{body:'x'.repeat(257*1024)}},
    {'/kk/seller/requests':{status:302}},
    {'/api/account/notifications':{status:200,body:JSON.stringify({items:[]})}},
    {'/api/seller/requests?limit=1':{headers:{'cache-control':'public, max-age=3600'}}},
    {'/api/account/notifications':{headers:{'referrer-policy':'unsafe-url'}}},
    {'/api/account/notifications':{headers:{'set-cookie':'session=forged'}}},
    {'/api/account/notifications':{body:JSON.stringify({code:'UNAVAILABLE',token:'secret'})}},
    {'/api/account/notifications':{body:JSON.stringify({code:'UNAVAILABLE',message:'x'.repeat(300)})}},
    {'/api/account/notifications':{headers:{'content-type':'text/html'}}},

  ];
  for(const overrides of cases){
    await assert.rejects(checkPrivateStaging(origin,{fetchImpl:fakeFetch(overrides).fetchImpl}));
  }
});

test('staging private CLI fails without explicit approved HTTPS target',()=>{
  const script=fileURLToPath(new URL('../../../scripts/check-staging-private.mjs',import.meta.url));
  const run=spawnSync(process.execPath,[script],{
    encoding:'utf8',env:{...process.env,STAGING_ALLOWED_HOST:''},
  });
  assert.equal(run.status,1);
  assert.match(run.stderr,/STAGING PRIVATE HTTP SMOKE FAILED/);
  assert.doesNotMatch(run.stderr,/https:\/\/|token|stack/i);
});
