import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SellerTransportUnauthorized,fetchSellerInbox,decideSellerRequest}
 from '../src/lib/seller-server-transport.mjs';
import {mapSellerDecisionOutcome} from '../src/lib/seller-decision-result.mjs';
import {loadSellerInbox,sendSellerDecision,SellerClientUnavailable}
 from '../src/lib/seller-bff-client.mjs';

const token='A'.repeat(43);
const uuid='b59e3b8b-72ae-4ed8-91f9-51484d5f8cf0';
const key='a59e3b8b-72ae-4ed8-91f9-51484d5f8cf0';
const csrf='x'.repeat(43);
const source=path=>readFileSync(new URL('../src/'+path,import.meta.url),'utf8');

test('backend 401 on seller inbox is distinctly unauthorized, never generic outage',async()=>{
 const params={baseUrl:'https://api.example.test/v1',accountBearer:token,
  transport:async()=>new Response('no',{status:401})};
 await assert.rejects(fetchSellerInbox(params),SellerTransportUnauthorized);
 await assert.rejects(fetchSellerInbox({
   ...params,transport:async()=>new Response('down',{status:503}),
 }));
 await assert.rejects(fetchSellerInbox({
   ...params,transport:async()=>new Response(null,{status:302}),
 }));
});
test('backend decision 401 maps to reauthentication without leaking credentials',async()=>{
 const params={baseUrl:'https://api.example.test/v1',
   accountBearer:token,requestId:uuid,version:1,
   decision:'accept',idempotencyKey:key,
   transport:async()=>new Response('invalid token',{status:401})};
 assert.deepEqual(await decideSellerRequest(params),{outcome:'unauthorized'});
 assert.equal(mapSellerDecisionOutcome({outcome:'unauthorized'}),'unauthorized');
});
test('browser sees only a 401 distinction without raw bearer',async()=>{
 const params={requestId:uuid,version:1,decision:'accept',
   csrf,idempotencyKey:key,transport:async()=>new Response('',{status:401})};
 assert.equal(await sendSellerDecision(params),'unauthorized');
 await assert.rejects(loadSellerInbox({
   transport:async()=>new Response('',{status:401}),
 }),SellerClientUnavailable);
});
test('BFF routes return narrow AUTH_REQUIRED and use cookie-only credentials',()=>{
 const read=source('app/api/seller/requests/route.ts');
 const mutation=source('app/api/seller/requests/[id]/[decision]/route.ts');
 const boundary=source('lib/seller-bff.server.ts');
 const ui=source('components/SellerRequestList.tsx');
 assert.match(read,/SellerTransportUnauthorized/);
 assert.match(read,/AUTH_REQUIRED/);
 assert.match(mutation,/result==='unauthorized'/);
 assert.match(mutation,/AUTH_REQUIRED/);
 assert.match(boundary,/SellerTransportUnauthorized/);
 assert.match(ui,/Сессия аяқталды/);
 assert.match(ui,/Сессия завершилась/);
 for(const value of [read,mutation]){
   assert.doesNotMatch(value,/headers\.get\('authorization'\)|localStorage|sessionStorage/i);
   assert.match(value,/private, no-store/);
 }
});
