import{test}from'node:test';
import assert from'node:assert/strict';
import{fetchSellerInbox,decideSellerRequest,SellerTransportUnavailable}
  from'../src/lib/seller-server-transport.mjs';

const token='x'.repeat(43);
const id='a59e3b8b-72ae-4ed8-91f9-51484d5f8cf0';
const key='d31bfdea-5c21-45be-82b0-ec3b89cac042';
const base='https://api.example.test/v1';
const ok=(data,status=200)=>new Response(JSON.stringify(data),{
  status,headers:{'Content-Type':'application/json'},
});
test('seller inbox sends bearer server-to-server without browser credentials',async()=>{
 let observed;
 const page={items:[],next_cursor:null};
 const data=await fetchSellerInbox({
   baseUrl:base,accountBearer:token,limit:10,state:'pending',
   transport:async(url,init)=>{observed={url,init};return ok(page);},
 });
 assert.deepEqual(data,page);
 assert.equal(observed.init.method,'GET');
 assert.equal(observed.init.credentials,'omit');
 assert.equal(observed.init.redirect,'manual');
 assert.equal(observed.init.cache,'no-store');
 assert.equal(observed.init.headers.Authorization,'Bearer '+token);
 assert.match(observed.url,/\/v1\/me\/seller-requests\?limit=10&state=pending/);
 assert.doesNotMatch(observed.url,/x{43}/);
});
test('seller inbox rejects unsafe URL, token and cursor before network',async()=>{
 let calls=0;const transport=async()=>{calls++;return ok({})};
 for(const options of [
  {baseUrl:'http://api.example.test/v1',accountBearer:token},
  {baseUrl:'https://user:pass@api.example.test/v1',accountBearer:token},
  {baseUrl:base,accountBearer:'invalid'},
  {baseUrl:base,accountBearer:token,cursor:'x'.repeat(257)},
  {baseUrl:base,accountBearer:token,limit:51},
  {baseUrl:base,accountBearer:token,state:'secret'},
 ]){
  await assert.rejects(fetchSellerInbox({...options,transport}),SellerTransportUnavailable);
 }
 assert.equal(calls,0);
});
test('seller decision requires quoted version and one idempotency key',async()=>{
 let observed;
 const response=await decideSellerRequest({baseUrl:base,accountBearer:token,
   requestId:id,version:3,decision:'accept',idempotencyKey:key,
   transport:async(url,init)=>{observed={url,init};return ok({
     id,state:'accepted',version:4,replayed:false,
   });},
 });
 assert.deepEqual(response,{outcome:'ok',id,state:'accepted',version:4,replayed:false});
 assert.equal(observed.init.headers['If-Match'],'"3"');
 assert.equal(observed.init.headers['Idempotency-Key'],key);
 assert.equal(observed.init.credentials,'omit');
 assert.match(observed.url,/\/requests\/.+\/accept$/);
});
test('seller decisions fail closed for bad replies, redirects or unknown states',async()=>{
 const args={baseUrl:base,accountBearer:token,requestId:id,
   version:3,decision:'decline',idempotencyKey:key};
 await assert.rejects(decideSellerRequest({...args,
   transport:async()=>ok({id,state:'accepted',version:4,replayed:false}),
 }),SellerTransportUnavailable);
 await assert.rejects(decideSellerRequest({...args,
   transport:async()=>ok({status:'redirect'},302),
 }),SellerTransportUnavailable);
 assert.deepEqual(await decideSellerRequest({...args,
   transport:async()=>ok({},409),
 }),{outcome:'conflict'});
 assert.deepEqual(await decideSellerRequest({...args,
   transport:async()=>ok({},403),
 }),{outcome:'forbidden'});
});

test('seller transport rejects oversized streaming responses without content length',async()=>{
  const huge='x'.repeat(65537);
  await assert.rejects(fetchSellerInbox({baseUrl:base,accountBearer:token,
    transport:async()=>new Response(huge,{
      status:200,headers:{'Content-Type':'application/json'},
    }),
  }),SellerTransportUnavailable);
});
test('seller decision rejects incorrect version increments',async()=>{
  const args={baseUrl:base,accountBearer:token,requestId:id,
    version:3,decision:'accept',idempotencyKey:key};
  for(const version of [3,5]){
    await assert.rejects(decideSellerRequest({...args,
      transport:async()=>ok({id,state:'accepted',version,replayed:false}),
    }),SellerTransportUnavailable);
  }
});
