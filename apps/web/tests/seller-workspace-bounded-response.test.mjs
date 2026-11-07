import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
 readBoundedSellerUiJson,parseSellerDecisionUiAck,MAX_SELLER_UI_RESPONSE_BYTES,
} from '../src/lib/seller-workspace-response.mjs';
import {readFileSync} from 'node:fs';

const json=(value,status=200,headers={})=>new Response(JSON.stringify(value),{
 status,headers:{'content-type':'application/json',...headers},
});
test('small valid JSON and exact seller decision ack are accepted',async()=>{
 assert.deepEqual(await readBoundedSellerUiJson(json({items:[],next_cursor:null})),
   {items:[],next_cursor:null});
 assert.equal(parseSellerDecisionUiAck(await readBoundedSellerUiJson(
   json({outcome:'ok'}),{maxBytes:1024})),'ok');
 for(const bad of [null,[],{}, {outcome:'failure'},
   {outcome:'ok',token:'never_forward'}, {outcome:true}]){
  assert.throws(()=>parseSellerDecisionUiAck(bad),/seller_response_unavailable/);
 }
});
test('declared size and actual streamed body both enforce byte bounds',async()=>{
 assert.equal(MAX_SELLER_UI_RESPONSE_BYTES,65536);
 await assert.rejects(readBoundedSellerUiJson(json({outcome:'ok'},200,{
   'content-length':'70000',
 })));
 await assert.rejects(readBoundedSellerUiJson(json({outcome:'ok'},200,{
   'content-length':'invalid',
 })));
 const body='x'.repeat(70000);
 await assert.rejects(readBoundedSellerUiJson(new Response(body,{
   status:200,headers:{'content-type':'application/json'},
 })),/seller_response_unavailable/);
 await assert.rejects(readBoundedSellerUiJson(json({long:'x'.repeat(1100)}),{
   maxBytes:1024,
 }),/seller_response_unavailable/);
});
test('redirect, wrong media type, invalid JSON and 5xx fail closed',async()=>{
 for(const res of [
  new Response(null,{status:302,headers:{location:'https://other.test'}}),
  json({outcome:'ok'},503),
  new Response('<html>login</html>',{status:200,headers:{'content-type':'text/html'}}),
  new Response('{not json}',{status:200,headers:{'content-type':'application/json'}}),
  new Response(new Uint8Array([0xff]),{status:200,headers:{'content-type':'application/json'}}),
 ]){
  await assert.rejects(readBoundedSellerUiJson(res),/seller_response_unavailable/);
 }
});
test('legacy seller workspace uses strict bounded reader for all reads and decisions',()=>{
 const source=readFileSync(
  new URL('../src/components/SellerWorkspace.tsx',import.meta.url),'utf8');
 const matches=source.match(/readBoundedSellerUiJson\(response/g)??[];
 assert.equal(matches.length,3);
 assert.match(source,/parseSellerDecisionUiAck\(result\)/);
 assert.match(source,/redirect:'error'/);
 assert.match(source,/AbortSignal\.timeout\(8000\)/);
 assert.doesNotMatch(source,/response\.json\(\)/);
 assert.match(source,/pendingKeys\.current\.get\(key\)/);
 assert.match(source,/pendingKeys\.current\.set\(key,idempotencyKey\)/);
});
