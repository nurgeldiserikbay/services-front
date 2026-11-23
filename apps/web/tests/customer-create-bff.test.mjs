import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 createBackendCustomerRequest,CustomerCreateTransportUnavailable,
 parseCustomerCreateBytes,readCustomerCreateBody,MAX_REQUEST_BYTES,
} from '../src/lib/customer-create-transport.mjs';

const id='123e4567-e89b-42d3-a456-426614174000';
const token='a'.repeat(43);
const key='customer_create_20261123_001';
const body={service_offer_id:id,note:'Request note',consent_to_contact:true};
const opts={baseUrl:'https://api.example.test/v1',production:true,
 accountBearer:token,idempotencyKey:key,body};
const json=(value,status=201,headers={})=>new Response(JSON.stringify(value),
 {status,headers:{'Content-Type':'application/json',
  'Cache-Control':'private, no-store, max-age=0',...headers}});

test('registered request transport sends only server bearer and stable scoped idempotency',async()=>{
 let count=0;
 const result=await createBackendCustomerRequest({...opts,transport:async(url,init)=>{
  count++;
  assert.equal(url,'https://api.example.test/v1/account/requests');
  assert.equal(init.method,'POST');
  assert.equal(init.headers.Authorization,'Bearer '+token);
  assert.equal(init.headers['Idempotency-Key'],key);
  assert.equal(init.credentials,'omit');
  assert.equal(init.cache,'no-store');
  assert.equal(init.redirect,'manual');
  assert.deepEqual(JSON.parse(init.body),body);
  assert.ok(init.signal instanceof AbortSignal);
  return json({id,state:'pending',version:1});
 }});
 assert.equal(count,1);
 assert.deepEqual(result,{kind:'created',id,version:1});
});

test('creation rejects tampered body and invalid transport config before network',async()=>{
 let calls=0;
 const transport=async()=>{calls++;return json({id,state:'pending',version:1});};
 for(const change of [
  {accountBearer:'short'},{idempotencyKey:'bad'},
  {baseUrl:'http://api.example.test/v1'},
  {baseUrl:'https://user:pass@api.example.test/v1'},
  {baseUrl:'https://api.example.test/v1?debug=true'},
  {body:{...body,customer_person_id:id}},
  {body:{...body,consent_to_contact:false}},
  {body:{...body,note:'x'.repeat(1001)}},
  {body:{...body,service_offer_id:'../admin'}},
 ]){
  await assert.rejects(
   createBackendCustomerRequest({...opts,...change,transport}),
   CustomerCreateTransportUnavailable);
 }
 assert.equal(calls,0);
});

test('strict upstream success allowlist and sanitized conflict mapping',async()=>{
 assert.deepEqual(await createBackendCustomerRequest({...opts,
  transport:async()=>json({secret:'unsafe'},409)}),{kind:'conflict'});
 assert.deepEqual(await createBackendCustomerRequest({...opts,
  transport:async()=>json({secret:'unsafe'},404)}),{kind:'not_found'});
 for(const response of [
  json({id,state:'pending',version:1,token:'secret'}),
  json({id,state:'accepted',version:1}),
  json({id,state:'pending',version:2}),
  json({id:'../other',state:'pending',version:1}),
  json({id,state:'pending',version:1},200),
  json({id,state:'pending',version:1},302),
  json({id,state:'pending',version:1},201,{'cache-control':'public, max-age=100'}),
  json({id,state:'pending',version:1},201,{'content-type':'text/html'}),
  json({id,state:'pending',version:1},201,{'content-length':'99999'}),
 ]){
  await assert.rejects(createBackendCustomerRequest({...opts,
   transport:async()=>response}),CustomerCreateTransportUnavailable);
 }
});

test('request body enforces strict bytes and UTF-8, with stream overflow cancellation',async()=>{
 const valid=new TextEncoder().encode(JSON.stringify(body));
 assert.deepEqual(parseCustomerCreateBytes(valid),body);
 for(const bad of [
  new Uint8Array(),new Uint8Array([0xff]),
  new TextEncoder().encode(JSON.stringify({...body,customer_person_id:id})),
  new TextEncoder().encode(JSON.stringify({...body,note:'x'.repeat(1001)})),
 ]){
  assert.throws(()=>parseCustomerCreateBytes(bad),CustomerCreateTransportUnavailable);
 }
 let cancelled=false;
 const overflow=new ReadableStream({
  start(controller){controller.enqueue(new Uint8Array(MAX_REQUEST_BYTES+1));},
  cancel(){cancelled=true;},
 });
 await assert.rejects(readCustomerCreateBody(overflow),CustomerCreateTransportUnavailable);
 assert.equal(cancelled,true);
});

test('browser POST requires two feature gates, sealed cookie CSRF and bounded JSON',()=>{
 const route=readFileSync(new URL('../src/app/api/account/requests/route.ts',
  import.meta.url),'utf8');
 const wrapper=readFileSync(new URL('../src/lib/customer-create-bff.server.ts',
  import.meta.url),'utf8');
 assert.match(route,/SERVICES_WEB_ENABLE_CUSTOMER_REQUEST_CREATE/);
 assert.match(route,/SERVICES_WEB_ENABLE_ACCOUNT_SESSION_BFF/);
 assert.match(route,/authenticateAccountWebMutation\(auth\)/);
 assert.match(route,/request\.cookies\.get\(ACCOUNT_WEB_COOKIE\)/);
 assert.match(route,/x-services-csrf/);
 assert.match(route,/idempotency-key/);
 assert.match(route,/readCustomerCreateBody/);
 assert.match(route,/parseCustomerCreateBytes/);
 assert.match(wrapper,/authenticateAccountWebMutation\(input\)/);
 assert.match(wrapper,/accountBearer:auth\.accountBearer/);
 assert.doesNotMatch(route,/request\.headers\.get\(['"]authorization/);
 assert.doesNotMatch(route,/customer_person_id/);
});
