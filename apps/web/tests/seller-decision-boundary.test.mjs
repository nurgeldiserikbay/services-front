import{test}from'node:test';
import assert from'node:assert/strict';
import{readFileSync}from'node:fs';
import{mapSellerDecisionOutcome}from'../src/lib/seller-decision-result.mjs';
const source=readFileSync(new URL('../src/lib/seller-decision-boundary.server.ts',import.meta.url),'utf8');

test('mapping preserves backend conflict and forbidden without inventing success',()=>{
 assert.equal(mapSellerDecisionOutcome({outcome:'ok',id:'id',state:'accepted',version:2,replayed:false}),'ok');
 assert.equal(mapSellerDecisionOutcome({outcome:'conflict'}),'conflict');
 assert.equal(mapSellerDecisionOutcome({outcome:'forbidden'}),'forbidden');
 assert.equal(mapSellerDecisionOutcome({outcome:'not_found'}),'unavailable');
 for(const value of [{outcome:'ok'}, {outcome:'ok',id:'x',state:'pending',version:2,replayed:false},
   {outcome:'new_state'}, null]){
   assert.throws(()=>mapSellerDecisionOutcome(value));
 }
});
test('authorized server decision adapter remains server-only',()=>{
 assert.match(source,/import 'server-only'/);
 assert.match(source,/decideSellerRequest\(/);
 assert.match(source,/mapSellerDecisionOutcome\(reply\)/);
 assert.match(source,/return 'unavailable'/);
 assert.doesNotMatch(source,/localStorage|sessionStorage|document\.cookie|fetch\(/);
});
test('caller-supplied stable key and concurrency version are retained',()=>{
 assert.match(source,/idempotencyKey:input\.idempotencyKey/);
 assert.match(source,/version:input\.expectedVersion/);
 assert.match(source,/decision:input\.action/);
 assert.match(source,/accountBearer:input\.accountBearer/);
});
