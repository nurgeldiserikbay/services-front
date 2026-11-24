import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSellerDecisionSingleFlight} from '../src/lib/seller-decision-single-flight.mjs';

test('account seller single-flight rejects a concurrent accept/decline until the first network call settles',async()=>{
 const gate=createSellerDecisionSingleFlight();
 let release;
 const pending=new Promise(resolve=>{release=resolve;});
 let writes=0;
 const first=gate.run(async()=>{writes++;await pending;});
 assert.equal(gate.active,true,'the lock must acquire before the first await');
 const second=await gate.run(async()=>{writes++;});
 assert.equal(second,false,'a same-tick competing action must not run');
 assert.equal(writes,1,'only the first decision reached its transport');
 release();
 assert.equal(await first,true);
 assert.equal(gate.active,false);
 assert.equal(await gate.run(async()=>{writes++;}),true);
 assert.equal(writes,2,'a later independent decision may proceed');
});

test('account seller single-flight unlocks on transport errors and reentrancy',async()=>{
 const gate=createSellerDecisionSingleFlight();
 let calls=0;
 await assert.rejects(gate.run(async()=>{
  calls++;
  assert.equal(await gate.run(async()=>{calls++;}),false);
  throw Error('transport unavailable');
 }),/transport unavailable/);
 assert.equal(calls,1,'reentrant call was rejected before running');
 assert.equal(gate.active,false,'exception must never leave the decision locked');
 assert.equal(await gate.run(async()=>{calls++;}),true);
 assert.equal(calls,2);
});
