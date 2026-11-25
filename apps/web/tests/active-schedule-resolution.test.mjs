import test from 'node:test';
import assert from 'node:assert/strict';
import {readBackendActiveSchedule,AccountSessionTransportUnavailable} from '../src/lib/account-session-transport.mjs';
import {readScheduleResolutionReceipt} from '../src/lib/customer-schedule-ui-core.mjs';
const id='123e4567-e89b-42d3-a456-426614174000',pid='123e4567-e89b-42d3-a456-426614174001';
const p={id:pid,revision:1,initiator:'seller',start_at:'2027-01-01T05:00:00.000Z',end_at:'2027-01-01T06:00:00.000Z',timezone:'Asia/Almaty',can_resolve:true};
const view={request_id:id,request_version:2,actor:'customer',can_propose:true,proposal:p};
const base={baseUrl:'https://backend.test/v1',accountBearer:'a'.repeat(43),requestId:id};
const json=(row,status=200,cache='no-store')=>new Response(JSON.stringify(row),{status,headers:{'Content-Type':'application/json','Cache-Control':cache}});
test('active schedule view is scoped and private',async()=>{
 assert.deepEqual(await readBackendActiveSchedule({...base,transport:async(url,opts)=>{
  assert.equal(url,'https://backend.test/v1/requests/'+id+'/schedule-proposals/active');
  assert.equal(opts.method,'GET');assert.equal(opts.headers.Authorization,'Bearer '+base.accountBearer);
  assert.equal(opts.cache,'no-store');assert.equal(opts.credentials,'omit');
  return json(view);
 }}),view);
 for(const row of [{...view,request_id:pid},{...view,proposal:{...p,initiator:'customer'}},{...view,proposal:{...p,can_resolve:false}},{...view,secret:'x'},{...view,request_version:0}]){
  await assert.rejects(readBackendActiveSchedule({...base,transport:async()=>json(row)}),AccountSessionTransportUnavailable);
 }
 await assert.rejects(readBackendActiveSchedule({...base,transport:async()=>json(view,200,'public, no-store')}),AccountSessionTransportUnavailable);
});
test('resolution receipt binds exact proposal, version, actor, interval and action',async()=>{
 const {can_resolve:ignored,...fields}=p;
 const row={...fields,request_id:id,request_version:3,status:'confirmed',replayed:false,confirmed_at:'2026-12-31T05:00:00.000Z',cancellation_deadline_at:'2027-01-01T03:00:00.000Z'};
 assert.equal(await readScheduleResolutionReceipt(json(row),view,'confirm'),true);
 const {confirmed_at:confirmed,cancellation_deadline_at:deadline,...decline}=row;
 assert.equal(await readScheduleResolutionReceipt(json({...decline,status:'declined'}),view,'decline'),true);
 for(const bad of [{...row,id},{...row,request_version:4},{...row,revision:2},{...row,timezone:'UTC'},{...row,token:'x'},{...row,cancellation_deadline_at:p.end_at}]){
  assert.equal(await readScheduleResolutionReceipt(json(bad),view,'confirm'),false);
 }
 assert.equal(await readScheduleResolutionReceipt(json(row),{...view,proposal:{...p,can_resolve:false}},'confirm'),false);
});
