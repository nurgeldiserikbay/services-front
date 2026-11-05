import{test}from'node:test';
import assert from'node:assert/strict';
import{readFileSync}from'node:fs';
import {parseSellerInboxQuery,parseSellerDecisionPayload,parseSellerDecisionBytes,
 readSellerDecisionBytes,sellerBffSameOrigin,MAX_SELLER_DECISION_BYTES}
 from '../src/lib/seller-bff-route-core.mjs';
const token='x'.repeat(43),key='a59e3b8b-72ae-4ed8-91f9-51484d5f8cf0';
const src=path=>readFileSync(new URL('../src/'+path,import.meta.url),'utf8');
test('inbox query allows strict bounded and single-valued backend filters',()=>{
 assert.deepEqual(parseSellerInboxQuery('https://example.test/api/seller/requests'),
   {limit:20,state:null,cursor:null});
 assert.deepEqual(parseSellerInboxQuery('https://example.test/api/seller/requests?limit=50&state=pending&cursor=Ab_12'),
   {limit:50,state:'pending',cursor:'Ab_12'});
 for(const q of ['limit=0','limit=51','limit=01','limit=20&limit=20',
   'state=unknown','cursor=a%2Fb','secret=x']){
   assert.equal(parseSellerInboxQuery('https://example.test/api/seller/requests?'+q),null,q);
 }
});
test('mutation payload requires one exact version, csrf and idempotency key',()=>{
 const payload={version:4,csrf_token:token,idempotency_key:key};
 assert.deepEqual(parseSellerDecisionPayload(payload),
   {version:4,csrfToken:token,idempotencyKey:key});
 for(const invalid of [null,[],{...payload,version:0},{...payload,csrf_token:'bad'},
   {...payload,idempotency_key:'invalid'},{...payload,extra:true}]){
   assert.equal(parseSellerDecisionPayload(invalid),null);
 }
 assert.deepEqual(parseSellerDecisionBytes(new TextEncoder().encode(JSON.stringify(payload))),
   parseSellerDecisionPayload(payload));
});
test('mutation body reader enforces byte limits including streamed bodies',async()=>{
 const bytes=new TextEncoder().encode('{"a":1}');
 const readable=new ReadableStream({start(c){c.enqueue(bytes);c.close()}});
 assert.deepEqual(await readSellerDecisionBytes(readable),bytes);
 const tooLarge=new ReadableStream({start(c){c.enqueue(new Uint8Array(MAX_SELLER_DECISION_BYTES+1));c.close()}});
 await assert.rejects(readSellerDecisionBytes(tooLarge),/too_large/);
});
test('cross-site route access fails closed',()=>{
 assert.equal(sellerBffSameOrigin('same-origin'),true);
 assert.equal(sellerBffSameOrigin('none'),true);
 assert.equal(sellerBffSameOrigin('cross-site'),false);
 assert.equal(sellerBffSameOrigin('same-site'),false);
});
test('server route handlers are default off and exclude raw backend secrets',()=>{
 const read=src('app/api/seller/requests/route.ts');
 const decision=src('app/api/seller/requests/[id]/[decision]/route.ts');
 const boundary=src('lib/seller-bff.server.ts');
 for(const source of [read,decision]){
   assert.match(source,/SERVICES_WEB_ENABLE_SELLER_BFF/);
   assert.match(source,/private, no-store/);
   assert.match(source,/noindex, nofollow/);
 }
 assert.match(read,/parseSellerInboxQuery/);
 assert.match(read,/sellerBffSameOrigin/);
 assert.match(decision,/readSellerDecisionBytes/);
 assert.match(decision,/decideOwnSellerRequest/);
 assert.match(boundary,/import 'server-only'/);
 assert.match(boundary,/readAccountWebSession/);
 assert.match(boundary,/authenticateAccountWebMutation/);
 assert.match(boundary,/parseSellerInboxPage/);
 assert.doesNotMatch(read,/Authorization|localStorage|sessionStorage/);
 assert.doesNotMatch(decision,/Authorization|localStorage|sessionStorage/);
});
