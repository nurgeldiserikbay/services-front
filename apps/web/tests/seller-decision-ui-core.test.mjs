import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildSellerDecisionRequest,parseSellerDecisionReceipt} from '../src/lib/seller-decision-ui-core.mjs';

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
    [id,'accept',1.5,key],[id,'accept',1,'short'],
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
