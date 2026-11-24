import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSellerDecisionSingleFlight,isCurrentSellerDecision,sellerRefreshBlocked} from '../src/lib/seller-decision-single-flight.mjs';

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

test('new locale lifecycle can fetch while old decision still owns its retired gate',async()=>{
 let currentGate=createSellerDecisionSingleFlight();
 let mounted=true,lifetime=0,oldMutations=0,loads=0;
 let release;
 const pendingTransport=new Promise(resolve=>{release=resolve;});
 const oldGate=currentGate;
 const captured=lifetime;
 const oldDecision=oldGate.run(async()=>{
   await pendingTransport;
   if(isCurrentSellerDecision(mounted,captured,lifetime))oldMutations++;
 });
 assert.equal(oldGate.active,true);
 // Simulate effect cleanup and the guarded setup microtask for the next locale.
 mounted=false;lifetime++;
 mounted=true;
 currentGate=createSellerDecisionSingleFlight();
 assert.equal(currentGate.active,false,'new lifecycle must not inherit pending write lock');
 assert.equal(await currentGate.run(async()=>{loads++;}),true);
 release();
 await oldDecision;
 assert.equal(loads,1,'new inbox may fetch without waiting on the old write');
 assert.equal(oldMutations,0,'late previous-locale decision may not mutate new view');
 assert.equal(oldGate.active,false);
});

test('seller refresh gate excludes manual reads during writes across scopes',async()=>{
 const gate=createSellerDecisionSingleFlight();
 let finish;
 const transport=new Promise(resolve=>{finish=resolve;});
 const current=gate.run(async()=>{await transport;});
 assert.equal(sellerRefreshBlocked(gate.active),true,
   'external refresh from any seller context must be rejected during a write');
 assert.equal(sellerRefreshBlocked(gate.active,true),false,
   'only the decision handler can schedule its authorized refresh');
 finish();await current;
 assert.equal(sellerRefreshBlocked(gate.active),false);
 assert.equal(sellerRefreshBlocked(false,true),false);
});
