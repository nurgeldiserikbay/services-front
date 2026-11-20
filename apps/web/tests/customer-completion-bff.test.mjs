import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 completeBackendCustomerRequest,AccountSessionTransportUnavailable,
} from '../src/lib/account-session-transport.mjs';

const id='123e4567-e89b-42d3-a456-426614174000';
const bearer='a'.repeat(43);
const success={id,state:'completed',version:3};
const opts={baseUrl:'https://api.example.test/v1',production:true,
 accountBearer:bearer,requestId:id,version:2};
const json=(payload,status=200,extra={})=>new Response(JSON.stringify(payload),
 {status,headers:{'Content-Type':'application/json',
  'Cache-Control':'private, no-store, max-age=0',...extra}});

test('server transport sends only active bearer, strict If-Match and empty JSON',async()=>{
 let called=0;
 const outcome=await completeBackendCustomerRequest({...opts,transport:async(url,init)=>{
  called++;
  assert.equal(url,'https://api.example.test/v1/account/requests/'+id+'/complete');
  assert.equal(init.method,'POST');
  assert.equal(init.credentials,'omit');
  assert.equal(init.cache,'no-store');
  assert.equal(init.redirect,'manual');
  assert.equal(init.headers.Authorization,'Bearer '+bearer);
  assert.equal(init.headers['If-Match'],'"2"');
  assert.equal(init.headers['Content-Type'],'application/json');
  assert.equal(init.body,'{}');
  assert.ok(init.signal instanceof AbortSignal);
  return json(success);
 }});
 assert.equal(called,1);
 assert.deepEqual(outcome,{kind:'completed',id,version:3});
});

test('reject invalid identity, version, bearer or URL before transport',async()=>{
 let called=0;const transport=async()=>{called++;return json(success);};
 for(const input of [
  {requestId:'../admin'},
  {version:0},{version:1.5},{version:2147483647},
  {accountBearer:'short'},
  {baseUrl:'https://user:pass@api.example.test/v1'},
  {baseUrl:'http://api.example.test/v1',production:true},
  {baseUrl:'https://api.example.test/v1?debug=true'},
 ]){
  await assert.rejects(completeBackendCustomerRequest({...opts,...input,transport}),
   AccountSessionTransportUnavailable);
 }
 assert.equal(called,0);
});

test('map only known conflict/not-found and deny invalid upstream success',async()=>{
 assert.deepEqual(await completeBackendCustomerRequest({...opts,transport:async()=>json(
  {message:'secret details'},409)}),{kind:'conflict'});
 assert.deepEqual(await completeBackendCustomerRequest({...opts,transport:async()=>json(
  {message:'secret details'},404)}),{kind:'not_found'});
 for(const response of [
  json({...success,version:2}),
  json({...success,extra:'leak'}),
  json({...success,id:'123e4567-e89b-42d3-a456-426614174001'}),
  json({...success,state:'accepted'}),
  json(success,201),
  json(success,302),
  json(success,200,{'cache-control':'public, max-age=3600'}),
  json(success,200,{'content-type':'text/html'}),
  json(success,200,{'content-length':'999999'}),
 ]){
  await assert.rejects(completeBackendCustomerRequest({...opts,
   transport:async()=>response}),AccountSessionTransportUnavailable);
 }
});

test('oversized streamed response fails closed and cancels stream',async()=>{
 let cancelled=false;
 const stream=new ReadableStream({
  start(ctrl){ctrl.enqueue(new Uint8Array(16385));},
  cancel(){cancelled=true;},
 });
 await assert.rejects(completeBackendCustomerRequest({...opts,transport:async()=>({
  status:200,
  headers:new Headers({'content-type':'application/json',
   'cache-control':'no-store'}),
  body:stream,
 })}),AccountSessionTransportUnavailable);
 assert.equal(cancelled,true);
});

test('route keeps CSRF, secure cookie and production flag gates server-only',()=>{
 const route=readFileSync(new URL('../src/app/api/account/requests/[id]/complete/route.ts',
  import.meta.url),'utf8');
 const wrapper=readFileSync(new URL('../src/lib/account-session-bff.server.ts',
  import.meta.url),'utf8');
 assert.match(route,/SERVICES_WEB_ENABLE_CUSTOMER_COMPLETION/);
 assert.match(route,/SERVICES_WEB_ENABLE_ACCOUNT_SESSION_BFF/);
 assert.match(route,/authenticateAccountWebMutation\(auth\)/);
 assert.match(route,/request\.cookies\.get\(ACCOUNT_WEB_COOKIE\)/);
 assert.match(route,/x-services-csrf/);
 assert.match(route,/if-match/);
 assert.match(route,/no-store/);
 assert.match(route,/body!=='\{\}'/);
 assert.match(wrapper,/authenticateAccountWebMutation\(input\)/);
 assert.match(wrapper,/accountBearer:auth\.accountBearer/);
 assert.doesNotMatch(route,/request\.headers\.get\(['"]authorization/);
});
