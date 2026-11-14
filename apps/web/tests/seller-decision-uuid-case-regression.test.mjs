import test from 'node:test';
import assert from 'node:assert/strict';
import {isCurrentSellerDecisionResponse,nextSellerDecisionAttempt} from '../src/lib/seller-decision-ui-core.mjs';

const lower='123e4567-e89b-42d3-a456-426614174000';
const upper=lower.toUpperCase();
const key='123e4567-e89b-42d3-a456-426614174001';

test('in-flight seller response survives UUID casing-only change',()=>{
  assert.equal(isCurrentSellerDecisionResponse(2,2,lower,upper,4,4),true);
  assert.equal(isCurrentSellerDecisionResponse(2,2,upper,lower,4,4),true);
});

test('seller response rejects different request, version or generation',()=>{
  const other='123e4567-e89b-42d3-a456-426614174002';
  assert.equal(isCurrentSellerDecisionResponse(2,2,lower,other,4,4),false);
  assert.equal(isCurrentSellerDecisionResponse(2,3,lower,upper,4,4),false);
  assert.equal(isCurrentSellerDecisionResponse(2,2,lower,upper,4,5),false);
  assert.equal(isCurrentSellerDecisionResponse(2,2,lower,'invalid',4,4),false);
});

test('idempotency key is retained across UUID casing-only change',()=>{
  const previous=nextSellerDecisionAttempt(null,lower,4,'accept',key);
  const retry=nextSellerDecisionAttempt(previous,upper,4,'accept','123e4567-e89b-42d3-a456-426614174003');
  assert.equal(retry.key,key);
});

test('response identity rejects malformed or non-string UUIDs',()=>{
  for(const invalid of [null,undefined,42,'','123e4567-e89b-42d3-a456-42661417400z']){
    assert.equal(isCurrentSellerDecisionResponse(2,2,lower,invalid,4,4),false);
    assert.equal(isCurrentSellerDecisionResponse(2,2,invalid,lower,4,4),false);
  }
});

test('a retry key is not reused for a changed action or version',()=>{
  const previous=nextSellerDecisionAttempt(null,lower,4,'accept',key);
  const replacement='123e4567-e89b-42d3-a456-426614174003';
  assert.equal(nextSellerDecisionAttempt(previous,upper,4,'decline',replacement).key,replacement);
  assert.equal(nextSellerDecisionAttempt(previous,upper,5,'accept',replacement).key,replacement);
});
