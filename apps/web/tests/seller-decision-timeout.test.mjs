import test from 'node:test';
import assert from 'node:assert/strict';
import {withSellerDecisionDeadline} from '../src/lib/seller-decision-timeout.mjs';

test('seller decision deadline returns a completed decision',async()=>{
  assert.equal(await withSellerDecisionDeadline(()=>Promise.resolve('accepted'),100),'accepted');
});

test('seller decision deadline rejects a stalled operation',async()=>{
  await assert.rejects(
    withSellerDecisionDeadline(()=>new Promise(()=>{}),5),
    /seller_decision_timeout/,
  );
});

test('seller decision deadline propagates original operation failures',async()=>{
  await assert.rejects(
    withSellerDecisionDeadline(()=>Promise.reject(new Error('network_failed')),100),
    /network_failed/,
  );
});

test('seller decision deadline validates timing and callback',async()=>{
  await assert.rejects(withSellerDecisionDeadline(()=>true,0),/invalid_seller_decision_deadline/);
  await assert.rejects(withSellerDecisionDeadline(null,100),/invalid_seller_decision_deadline/);
});

test('late completion after timeout cannot turn timeout into success',async()=>{
  let complete;
  const operation=new Promise(resolve=>{complete=resolve;});
  await assert.rejects(withSellerDecisionDeadline(()=>operation,5),/seller_decision_timeout/);
  complete('accepted');
  await operation;
});

test('seller action retains captured idempotency key after context reset',async()=>{
  const key='123e4567-e89b-42d3-a456-426614174001';
  const pending={current:{key}};
  const capturedKey=pending.current.key;
  const decision=withSellerDecisionDeadline(()=>capturedKey,100);
  pending.current=null;
  assert.equal(await decision,key);
});
