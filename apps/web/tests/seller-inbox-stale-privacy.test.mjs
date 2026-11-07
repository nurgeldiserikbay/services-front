import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 loadSellerInbox,SellerClientUnavailable,SellerClientAuthenticationRequired,
 sendSellerDecision,
} from '../src/lib/seller-bff-client.mjs';

const src=readFileSync(
 new URL('../src/components/SellerAccountInbox.tsx',import.meta.url),'utf8');
const id='a59e3b8b-72ae-4ed8-91f9-51484d5f8cf0';
const key='d31bfdea-5c21-45be-82b0-ec3b89cac042';
const csrf='x'.repeat(43);

test('revoked account is a different read failure from an uncertain outage',async()=>{
 await assert.rejects(loadSellerInbox({
  transport:async()=>new Response(null,{status:401}),
 }),SellerClientAuthenticationRequired);
 for(const status of [403,404,429,503]){
  await assert.rejects(loadSellerInbox({
   transport:async()=>new Response(null,{status}),
  }),SellerClientUnavailable);
 }
});
test('unconfirmed mutation does not report success or synthesize new key',async()=>{
 const params={requestId:id,version:2,decision:'accept',csrf,idempotencyKey:key};
 let posted;
 const result=await sendSellerDecision({...params,transport:async(_url,init)=>{
  posted=JSON.parse(init.body);
  return new Response(null,{status:503});
 }});
 assert.equal(result,'unavailable');
 assert.deepEqual(posted,{version:2,csrf_token:csrf,idempotency_key:key});
 const second=await sendSellerDecision({...params,transport:async(_url,init)=>{
  assert.deepEqual(JSON.parse(init.body),posted);
  return new Response(null,{status:401});
 }});
 assert.equal(second,'unauthorized');
});
test('seller inbox clears stale rows and cursor when authenticated refresh fails',()=>{
 assert.match(src,/A failed live authorization refresh/);
 assert.match(src,/current\.current=null;setPage\(null\);seenCursors\.current\.clear\(\)/);
 assert.match(src,/if\(error instanceof SellerClientAuthenticationRequired\)/);
 assert.match(src,/retry\.current\.clear\(\)/);
 assert.match(src,/setMessage\(t\.unauthorized\)/);
 assert.match(src,/setMessage\(t\.failed\)/);
});
test('ambiguous mutation hides stale private results but preserves retry key',()=>{
 assert.match(src,/Stable idempotency key remains available/);
 assert.match(src,/const key=item\.id\+':'\+item\.version\+':'\+decision/);
 assert.match(src,/retry\.current\.get\(key\)/);
 assert.match(src,/retry\.current\.set\(key,nonce\)/);
 assert.match(src,/outcome==='unauthorized'/);
 assert.match(src,/outcome==='ok'\|\|outcome==='conflict'\|\|outcome==='forbidden'/);
 assert.doesNotMatch(src,/localStorage|sessionStorage|document\.cookie|Authorization/);
});
