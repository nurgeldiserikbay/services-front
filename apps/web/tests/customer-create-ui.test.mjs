import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readCommittedCustomerCreateReceipt}
 from '../src/lib/customer-create-ui-core.mjs';

const id='123e4567-e89b-42d3-a456-426614174000';
const json=(data,status=201,headers={})=>new Response(JSON.stringify(data),{
 status,headers:{'Content-Type':'application/json',
  'Cache-Control':'private, no-store, max-age=0',...headers},
});
test('client only acknowledges exact, no-store committed receipt',async()=>{
 const result=await readCommittedCustomerCreateReceipt(json({
  code:'CREATED',id,version:1,
 }));
 assert.deepEqual(result,{id,version:1});
});
test('client never accepts unexpected fields, state or cache as success',async()=>{
 for(const response of [
  json({code:'CREATED',id,version:1,token:'secret'}),
  json({code:'CREATED',id,version:2}),
  json({code:'PENDING',id,version:1}),
  json({code:'CREATED',id:id.toUpperCase(),version:1}),
  json({code:'CREATED',id:'../admin',version:1}),
  json({code:'CREATED',id,version:1},200),
  json({code:'CREATED',id,version:1},201,
   {'Content-Type':'text/html'}),
  json({code:'CREATED',id,version:1},201,
   {'Cache-Control':'public, max-age=600'}),
  json({code:'CREATED',id,version:1},201,
   {'Content-Length':'99999'}),
 ]){
  assert.equal(await readCommittedCustomerCreateReceipt(response),null);
 }
});
test('oversized response is cancelled, even without content-length',async()=>{
 let cancelled=false;
 const body=new ReadableStream({
  start(controller){controller.enqueue(new Uint8Array(513));},
  cancel(){cancelled=true;},
 });
 const response={status:201,headers:new Headers({
  'content-type':'application/json','cache-control':'no-store',
 }),body};
 assert.equal(await readCommittedCustomerCreateReceipt(response),null);
 assert.equal(cancelled,true);
});
test('form is gated by backend-revalidated session and preserves uncertain operation',()=>{
 const page=readFileSync(new URL('../src/app/[locale]/services/[id]/page.tsx',
  import.meta.url),'utf8');
 const form=readFileSync(new URL('../src/components/CustomerRequestCreateForm.tsx',
  import.meta.url),'utf8');
 assert.match(page,/SERVICES_WEB_ENABLE_CUSTOMER_REQUEST_CREATE/);
 assert.match(page,/SERVICES_WEB_ENABLE_ACCOUNT_SESSION_BFF/);
 assert.match(page,/getAccountWebSessions/);
 assert.match(page,/get\(ACCOUNT_WEB_COOKIE\)/);
 assert.match(page,/customerCsrf&&<CustomerRequestCreateForm/);
 assert.match(form,/key\.current\?\?=/);
 assert.match(form,/registered_/);
 assert.match(form,/phase!=='idle'/);
 assert.match(form,/note\.trim\(\)\|\|null/);
 assert.match(form,/readCommittedCustomerCreateReceipt/);
 assert.match(form,/credentials:'same-origin'/);
 assert.match(form,/X-Services-CSRF/);
 assert.match(form,/Idempotency-Key/);
 assert.doesNotMatch(form,/Authorization|accountBearer|localStorage/);
});
