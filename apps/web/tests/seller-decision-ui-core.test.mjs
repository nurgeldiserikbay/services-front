import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildSellerDecisionRequest,parseSellerDecisionReceipt,nextSellerDecisionAttempt,isCurrentSellerDecisionResponse} from '../src/lib/seller-decision-ui-core.mjs';

const id='11111111-1111-4111-8111-111111111111';
const key='22222222-2222-4222-8222-222222222222';
test('seller decision request matches backend version and idempotency contract',()=>{
  assert.deepEqual(buildSellerDecisionRequest(id,'accept',3,key),{
    path:'/v1/requests/'+id+'/accept',
    headers:{'If-Match':'"3"','Idempotency-Key':key},
  });
  assert.equal(buildSellerDecisionRequest(id,'decline',1,key).path,
    '/v1/requests/'+id+'/decline');
});
test('seller decision request rejects unsafe input',()=>{
  for(const args of [
    ['not-id','accept',1,key],[id,'cancel',1,key],[id,'accept',0,key],
    [id,'accept',1.5,key],[id,'accept',Number.MAX_SAFE_INTEGER,key],
    [id,'accept',1,'short'],
  ])assert.throws(()=>buildSellerDecisionRequest(...args));
});

test('seller decision receipt accepts committed and replayed backend results',()=>{
  for(const replayed of [false,true]){
    assert.deepEqual(parseSellerDecisionReceipt({
      id,state:'accepted',version:4,replayed,
    },id,'accept',3),{id,state:'accepted',version:4,replayed});
  }
});
test('seller decision receipt rejects stale, cross-request and extra fields',()=>{
  const valid={id,state:'declined',version:2,replayed:false};
  for(const bad of [
    {...valid,version:1},{...valid,version:3},
    {...valid,id:key},{...valid,state:'accepted'},
    {...valid,replayed:'false'},{...valid,contact:'private'},
  ])assert.throws(()=>parseSellerDecisionReceipt(bad,id,'decline',1));
});

test('seller receipt rejects malformed expected request context before UI update',()=>{
 const valid={id,state:'declined',version:2,replayed:false};
 for(const args of [
  [valid,'not-a-uuid','decline',1],
  [valid,id,'cancel',1],
  [valid,id,'decline',0],
  [valid,id,'decline',1.5],
  [valid,id,'decline',Number.MAX_SAFE_INTEGER],
  [valid,id,'decline',NaN],
 ])assert.throws(()=>parseSellerDecisionReceipt(...args),/invalid_seller_decision_receipt/);
});

const otherId='33333333-3333-4333-8333-333333333333';
const otherKey='44444444-4444-4444-8444-444444444444';
test('decision retries reuse keys only for identical request version and action',()=>{
 const first=nextSellerDecisionAttempt(null,id,1,'accept',key);
 assert.equal(nextSellerDecisionAttempt(first,id,1,'accept',otherKey),first);
 for(const [requestId,version,action] of [
   [otherId,1,'accept'],[id,2,'accept'],[id,1,'decline'],
 ]){
   const next=nextSellerDecisionAttempt(first,requestId,version,action,otherKey);
   assert.equal(next.key,otherKey);
   assert.notEqual(next,first);
 }
 for(const invalidVersion of [0,-1,1.5,NaN,Number.MAX_SAFE_INTEGER]){
   assert.throws(()=>nextSellerDecisionAttempt(first,id,invalidVersion,'accept',otherKey),/invalid_seller_decision/);
 }
 assert.throws(()=>nextSellerDecisionAttempt(first,'bad',1,'accept',otherKey));
});

test('stale seller responses never match a changed request or version',()=>{
 assert.equal(isCurrentSellerDecisionResponse(2,2,id,id,3,3),true);
 assert.equal(isCurrentSellerDecisionResponse(2,3,id,id,3,3),false);
 assert.equal(isCurrentSellerDecisionResponse(2,2,id,otherId,3,3),false);
 assert.equal(isCurrentSellerDecisionResponse(2,2,id,id,3,4),false);
 assert.equal(isCurrentSellerDecisionResponse(-1,-1,id,id,3,3),false);
 assert.equal(isCurrentSellerDecisionResponse(2,NaN,id,id,3,3),false);
 assert.equal(isCurrentSellerDecisionResponse(2,2,'invalid','invalid',3,3),false);
 assert.equal(isCurrentSellerDecisionResponse(2,2,id,id,0,0),false);
 assert.equal(isCurrentSellerDecisionResponse(2,2,id,id,Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER),false);
});
