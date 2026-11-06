import{test}from'node:test';
import assert from'node:assert/strict';
import{readFileSync}from'node:fs';
import{parseSellerBffInbox,loadSellerInbox,sendSellerDecision,SellerClientUnavailable}
  from'../src/lib/seller-bff-client.mjs';

const uuid='a59e3b8b-72ae-4ed8-91f9-51484d5f8cf0';
const idempotency='d31bfdea-5c21-45be-82b0-ec3b89cac042';
const csrf='x'.repeat(43);
const item={id:uuid,serviceOfferId:idempotency,title:'Service',state:'pending',
 version:1,createdAt:'2026-11-06T00:00:00.000Z',desiredStartAt:null,sellerKind:'professional'};
const page={items:[item],next_cursor:null,csrf_token:csrf};
const json=(body,status=200)=>({
 status,headers:new Headers({'Content-Type':'application/json'}),
 text:async()=>JSON.stringify(body),
});
test('strict inbox projection rejects extra fields and malformed row',()=>{
 assert.deepEqual(parseSellerBffInbox(page),{items:[item],nextCursor:null,csrf});
 for(const invalid of [
  {...page,accountBearer:csrf},{...page,csrf_token:'bad'},
  {...page,items:[{...item,version:0}]},{...page,items:[{...item,state:'admin'}]},
  {...page,next_cursor:'a/b'},
 ]){
  assert.throws(()=>parseSellerBffInbox(invalid),SellerClientUnavailable);
 }
});
test('read uses only same-origin BFF, not bearer credentials',async()=>{
 let captured;
 const result=await loadSellerInbox({
  limit:10,state:'pending',transport:async(url,init)=>{
   captured={url,init};return json(page);
  },
 });
 assert.equal(result.csrf,csrf);
 assert.equal(captured.url,'/api/seller/requests?limit=10&state=pending');
 assert.equal(captured.init.credentials,'same-origin');
 assert.equal(captured.init.cache,'no-store');
 assert.equal(captured.init.headers.Accept,'application/json');
 assert.equal('Authorization' in captured.init.headers,false);
});
test('malformed query, wrong status and bad content type fail closed',async()=>{
 await assert.rejects(loadSellerInbox({limit:51}),SellerClientUnavailable);
 await assert.rejects(loadSellerInbox({cursor:'a/b'}),SellerClientUnavailable);
 await assert.rejects(loadSellerInbox({
  transport:async()=>json({code:'UNAVAILABLE'},503),
 }),SellerClientUnavailable);
 await assert.rejects(loadSellerInbox({
  transport:async()=>({status:200,headers:new Headers({'Content-Type':'text/plain'}),
   text:async()=>JSON.stringify(page)}),
 }),SellerClientUnavailable);
});
test('mutation sends stable supplied idempotency key and CSRF only',async()=>{
 let captured;
 const result=await sendSellerDecision({
  requestId:uuid,version:2,decision:'decline',csrf,idempotencyKey:idempotency,
  transport:async(url,init)=>{captured={url,init};return json({outcome:'ok'});},
 });
 assert.equal(result,'ok');
 assert.equal(captured.url,'/api/seller/requests/'+uuid+'/decline');
 assert.equal(captured.init.credentials,'same-origin');
 assert.deepEqual(JSON.parse(captured.init.body),{
  version:2,csrf_token:csrf,idempotency_key:idempotency,
 });
 assert.equal('Authorization' in captured.init.headers,false);
});
test('mutation reports conflict/forbidden and fails closed on fake success',async()=>{
 const base={requestId:uuid,version:1,decision:'accept',csrf,idempotencyKey:idempotency};
 for(const [status,expected] of [[409,'conflict'],[403,'forbidden'],[503,'unavailable']]){
  assert.equal(await sendSellerDecision({...base,transport:async()=>json({},status)}),expected);
 }
 assert.equal(await sendSellerDecision({...base,transport:async()=>json({outcome:'ok',private:'leak'})}),'unavailable');
 await assert.rejects(sendSellerDecision({...base,csrf:'bad'}),SellerClientUnavailable);
});
test('seller action buttons disable during any concurrent mutation/refresh',()=>{
 const src=readFileSync(new URL('../src/components/SellerRequestList.tsx',import.meta.url),'utf8');
 const matches=src.match(/disabled=\{refreshing\|\|busy!==null\|\|settled\[req\.id\]===req\.version\}/g)??[];
 assert.equal(matches.length,2);
});
