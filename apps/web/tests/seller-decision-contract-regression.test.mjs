import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSellerDecisionRequest,parseSellerDecisionReceipt} from '../src/lib/seller-decision-ui-core.mjs';

const id='123e4567-e89b-42d3-a456-426614174000';
const key='123e4567-e89b-42d3-a456-426614174001';

test('seller decision request uses canonical UUIDs and optimistic concurrency',()=>{
  const request=buildSellerDecisionRequest(id.toUpperCase(),'accept',3,key.toUpperCase());
  assert.deepEqual(request,{
    path:'/v1/requests/'+id+'/accept',
    headers:{'If-Match':'"3"','Idempotency-Key':key},
  });
});

test('seller decision request rejects unsafe metadata',()=>{
  for(const [requestId,action,version,retryKey] of [
    ['../admin','accept',3,key],
    [id,'delete',3,key],
    [id,'accept',0,key],
    [id,'accept',Number.MAX_SAFE_INTEGER,key],
    [id,'accept',3,'not-a-uuid'],
  ])assert.throws(()=>buildSellerDecisionRequest(requestId,action,version,retryKey),/invalid_seller_decision/);
});

test('receipt must match action, identity and next version',()=>{
  const valid={id:id.toUpperCase(),state:'accepted',version:4,replayed:false};
  assert.deepEqual(parseSellerDecisionReceipt(valid,id,'accept',3),{...valid,id});
  for(const invalid of [
    {...valid,state:'declined'},
    {...valid,version:3},
    {...valid,id:'123e4567-e89b-42d3-a456-426614174002'},
    {...valid,extra:'untrusted'},
    {...valid,replayed:'false'},
    [valid],
    null,
  ])assert.throws(()=>parseSellerDecisionReceipt(invalid,id,'accept',3),/invalid_seller_decision_receipt/);
});

test('decline receipt accepts replay only with exact committed transition',()=>{
  const valid={id,state:'declined',version:8,replayed:true};
  assert.deepEqual(parseSellerDecisionReceipt(valid,id,'decline',7),valid);
  assert.throws(()=>parseSellerDecisionReceipt({...valid,state:'accepted'},id,'decline',7),/invalid_seller_decision_receipt/);
  assert.throws(()=>parseSellerDecisionReceipt({...valid,version:9},id,'decline',7),/invalid_seller_decision_receipt/);
});

test('request rejects non-finite, fractional and negative concurrency versions',()=>{
  for(const version of [NaN,Infinity,-Infinity,-1,1.5,'2',null]){
    assert.throws(()=>buildSellerDecisionRequest(id,'accept',version,key),/invalid_seller_decision/);
  }
});
