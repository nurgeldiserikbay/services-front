import test from 'node:test';
import assert from 'node:assert/strict';
import {mutateBackendAccountSchedule,AccountSessionTransportUnavailable}
 from '../src/lib/account-session-transport.mjs';
const id='123e4567-e89b-42d3-a456-426614174000';
const pid='123e4567-e89b-42d3-a456-426614174001';
const base={baseUrl:'https://backend.test/v1',accountBearer:'a'.repeat(43),requestId:id,version:1,key:'schedule_test_123456'};
const body={start_at:'2027-01-01T05:00:00.000Z',end_at:'2027-01-01T06:00:00.000Z',timezone:'Asia/Almaty',local_start_at:'2027-01-01T10:00:00',utc_offset_seconds:18000};
const receipt={id:pid,request_id:id,revision:1,status:'proposed',initiator:'seller',start_at:body.start_at,end_at:body.end_at,timezone:body.timezone,request_version:2,replayed:false};
const json=(row,status=201,headers={})=>new Response(JSON.stringify(row),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...headers}});
test('schedule proposal forwards exact private command and verifies receipt',async()=>{
 const result=await mutateBackendAccountSchedule({...base,action:'propose',body,transport:async(url,opts)=>{
  assert.equal(url,'https://backend.test/v1/requests/'+id+'/schedule-proposals');
  assert.equal(opts.headers.Authorization,'Bearer '+base.accountBearer);
  assert.equal(opts.headers['If-Match'],'"1"');
  assert.equal(opts.headers['Idempotency-Key'],base.key);
  assert.equal(opts.credentials,'omit');assert.equal(opts.redirect,'manual');assert.equal(opts.cache,'no-store');
  assert.deepEqual(JSON.parse(opts.body),body);
  return json(receipt);
 }});
 assert.deepEqual(result,{kind:'ok',receipt});
});
test('schedule confirmation and decline use exact proposal path and bounded receipt',async()=>{
 for(const action of ['confirm','decline']){
  const row={...receipt,status:action==='confirm'?'confirmed':'declined',request_version:3,
   ...(action==='confirm'?{confirmed_at:'2026-12-31T05:00:00.000Z',cancellation_deadline_at:'2027-01-01T03:00:00.000Z'}:{})};
  const result=await mutateBackendAccountSchedule({...base,version:2,action,proposalId:pid,transport:async(url,opts)=>{
   assert.equal(url,'https://backend.test/v1/requests/'+id+'/schedule-proposals/'+pid+'/'+action);
   assert.equal(opts.body,'{}');return json(row,200);
  }});
  assert.deepEqual(result,{kind:'ok',receipt:row});
 }
});
test('schedule rejects mismatched receipts and unsafe cache before reporting success',async()=>{
 for(const response of [json({...receipt,request_id:pid}),json({...receipt,request_version:9}),json({...receipt,timezone:'UTC'}),json({...receipt,token:'secret'}),json(receipt,200),json(receipt,201,{'Cache-Control':'public, no-store'}),json(receipt,201,{'Content-Length':'99999'})]){
  await assert.rejects(mutateBackendAccountSchedule({...base,action:'propose',body,transport:async()=>response}),AccountSessionTransportUnavailable);
 }
 for(const status of [403,404,409]){
  assert.deepEqual(await mutateBackendAccountSchedule({...base,action:'propose',body,transport:async()=>json({secret:'not forwarded'},status)}),{kind:status===409?'conflict':'not_found'});
 }
});
test('invalid schedule input never reaches backend',async()=>{
 let calls=0;
 for(const input of [{key:'short'},{version:0},{requestId:'../x'},{body:{...body,customer_person_id:pid}},{body:{...body,utc_offset_seconds:99999}},{proposalId:pid}]){
  await assert.rejects(mutateBackendAccountSchedule({...base,action:'propose',body,...input,transport:async()=>{calls++;return json(receipt);}}),AccountSessionTransportUnavailable);
 }
 assert.equal(calls,0);
});
