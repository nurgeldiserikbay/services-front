import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 listBackendCustomerRequests,AccountSessionTransportUnavailable,
} from '../src/lib/account-session-transport.mjs';

const id='123e4567-e89b-42d3-a456-426614174000';
const bearer='a'.repeat(43);
const item={id,state:'accepted',version:2,created_at:'2026-11-20T03:01:02.000Z'};
const base={baseUrl:'https://backend.test/v1',production:true,accountBearer:bearer};
const json=(data,options={})=>new Response(JSON.stringify(data),{
 status:options.status??200,
 headers:{'Content-Type':'application/json','Cache-Control':'private, no-store, max-age=0',
  ...options.headers},
});
test('customer requests transport sends only server bearer and bounded cursor',async()=>{
 let calls=0;
 const page=await listBackendCustomerRequests({...base,cursor:'YQ',
  transport:async(url,opts)=>{
   calls++;
   assert.equal(url,'https://backend.test/v1/account/requests?cursor=YQ');
   assert.equal(opts.method,'GET');
   assert.equal(opts.headers.Authorization,'Bearer '+bearer);
   assert.equal(opts.credentials,'omit');
   assert.equal(opts.cache,'no-store');
   assert.equal(opts.redirect,'manual');
   return json({items:[item],next_cursor:null});
  }});
 assert.equal(calls,1);
 assert.deepEqual(page,{items:[item],next_cursor:null});
});

test('reject user-specific or private fields, forged statuses and duplicate IDs',async()=>{
 for(const data of [
  {items:[{...item,note:'private'}],next_cursor:null},
  {items:[{...item,state:'unknown'}],next_cursor:null},
  {items:[{...item,version:0}],next_cursor:null},
  {items:[item,item],next_cursor:null},
  {items:[item],next_cursor:'invalid!'},
  {items:[],next_cursor:null,debug:'extra'},
  {items:[{...item,id:id.toUpperCase()}],next_cursor:null},
  {items:[{...item,created_at:'2026-11-20'}],next_cursor:null},
 ]){
  await assert.rejects(listBackendCustomerRequests({...base,
   transport:async()=>json(data)}),AccountSessionTransportUnavailable);
 }
});

test('fail closed on oversized stream, public caching or invalid cursor',async()=>{
 let calls=0;
 for(const cursor of ['../../secret','!', 'a'.repeat(181)]){
  await assert.rejects(listBackendCustomerRequests({...base,cursor,
   transport:async()=>{calls++;return json({items:[],next_cursor:null});}}),
   AccountSessionTransportUnavailable);
 }
 assert.equal(calls,0);
 for(const response of [
  json({items:[item],next_cursor:null},{headers:{'Cache-Control':'public, max-age=60'}}),
  json({items:[item],next_cursor:null},{headers:{'content-type':'text/html'}}),
  json({items:[item],next_cursor:null},{headers:{'content-length':'99999'}}),
  json({items:[item],next_cursor:null},{status:404}),
 ]){
  await assert.rejects(listBackendCustomerRequests({...base,
   transport:async()=>response}),AccountSessionTransportUnavailable);
 }
});

test('client completion UI only sends CSRF and exact If-Match, not bearer',()=>{
 const page=readFileSync(new URL('../src/app/[locale]/account/my-requests/page.tsx',
  import.meta.url),'utf8');
 const action=readFileSync(new URL('../src/components/CustomerCompletionAction.tsx',
  import.meta.url),'utf8');
 const wrapper=readFileSync(new URL('../src/lib/account-session-bff.server.ts',
  import.meta.url),'utf8');
 assert.match(page,/SERVICES_WEB_ENABLE_CUSTOMER_REQUESTS/);
 assert.match(page,/getOwnCustomerRequestPage/);
 assert.match(page,/item.state==='accepted'/);
 assert.match(action,/X-Services-CSRF/);
 assert.match(action,/If-Match/);
 assert.match(action,/credentials:'same-origin'/);
 assert.match(action,/router.refresh\(\)/);
 assert.match(wrapper,/readAccountWebSession\(cookieValue\)/);
 assert.match(wrapper,/listBackendCustomerRequests/);
 assert.doesNotMatch(action,/Authorization|Bearer|accountBearer/);
});
