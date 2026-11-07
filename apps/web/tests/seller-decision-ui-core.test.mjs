import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildSellerDecisionRequest} from '../src/lib/seller-decision-ui-core.mjs';

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
