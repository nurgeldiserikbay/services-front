import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSellerDecisionSingleFlight,isCurrentSellerDecision} from '../src/lib/seller-decision-single-flight.mjs';

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

test('two seller scopes sharing one gate cannot dispatch decisions during refresh',async()=>{
 const gate=createSellerDecisionSingleFlight();
 let completeTransport;
 const transport=new Promise(resolve=>{completeTransport=resolve;});
 let completeRefresh;
 const refresh=new Promise(resolve=>{completeRefresh=resolve;});
 const writes=[];
 const specialist=gate.run(async()=>{
  writes.push('professional:accept');
  await transport;
  await refresh;
 });
 assert.equal(gate.active,true);
 assert.equal(await gate.run(async()=>{writes.push('organization:decline');}),false);
 completeTransport();
 await Promise.resolve();
 assert.equal(gate.active,true,'server refresh must remain inside shared decision gate');
 assert.equal(await gate.run(async()=>{writes.push('organization:accept');}),false);
 assert.deepEqual(writes,['professional:accept']);
 completeRefresh();
 assert.equal(await specialist,true);
 assert.equal(gate.active,false);
 assert.equal(await gate.run(async()=>{writes.push('organization:accept');}),true);
 assert.deepEqual(writes,['professional:accept','organization:accept']);
});

test('seller decision still settles after its own post-write inbox refresh',async()=>{
 const gate=createSellerDecisionSingleFlight();
 let lifetime=7, mounted=true, fetchEpoch=10, pending=true, reloads=0;
 const started=lifetime;
 const done=gate.run(async()=>{
   await Promise.resolve();
   if(!isCurrentSellerDecision(mounted,started,lifetime))return;
   fetchEpoch++;reloads++;
   await Promise.resolve();
   if(isCurrentSellerDecision(mounted,started,lifetime))pending=false;
 });
 assert.equal(await done,true);
 assert.equal(fetchEpoch,11);
 assert.equal(reloads,1);
 assert.equal(pending,false,'fetch epoch must not strand a completed decision');
 assert.equal(gate.active,false);
});

test('seller decision result after logout never triggers a private refresh',async()=>{
 const gate=createSellerDecisionSingleFlight();
 let mounted=true,lifetime=0,refreshes=0,visibleChanges=0;
 let release;
 const transport=new Promise(resolve=>{release=resolve;});
 const started=lifetime;
 const run=gate.run(async()=>{
   await transport;
   if(!isCurrentSellerDecision(mounted,started,lifetime))return;
   refreshes++;
   visibleChanges++;
 });
 mounted=false;lifetime++;
 release();
 await run;
 assert.equal(refreshes,0);
 assert.equal(visibleChanges,0);
 assert.equal(gate.active,false);
});

test('seller lifetime guard rejects stale, unmounted and malformed tokens',()=>{
 assert.equal(isCurrentSellerDecision(true,3,3),true);
 for(const args of [[false,3,3],[true,3,4],[true,-1,-1],
   [true,NaN,NaN],[true,1.5,1.5],[true,Infinity,Infinity]]){
   assert.equal(isCurrentSellerDecision(...args),false,JSON.stringify(args));
 }
});
