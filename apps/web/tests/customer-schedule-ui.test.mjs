import test from 'node:test';
import assert from 'node:assert/strict';
import {buildScheduleProposal,readScheduleProposalReceipt} from '../src/lib/customer-schedule-ui-core.mjs';
const id='123e4567-e89b-42d3-a456-426614174000';
const body=buildScheduleProposal('2027-01-01T10:00','2027-01-01T11:00','Asia/Almaty',300);
test('schedule form converts explicit Kazakhstan local time and rejects invalid evidence',()=>{
 assert.deepEqual(body,{start_at:'2027-01-01T05:00:00.000Z',end_at:'2027-01-01T06:00:00.000Z',timezone:'Asia/Almaty',local_start_at:'2027-01-01T10:00:00',utc_offset_seconds:18000});
 assert.equal(buildScheduleProposal('2027-01-01T10:00','2027-01-01T11:00','Asia/Almaty',360),null);
 assert.equal(buildScheduleProposal('2027-02-30T10:00','2027-03-01T11:00','Asia/Almaty',300),null);
 assert.equal(buildScheduleProposal('2027-03-14T02:30','2027-03-14T04:00','America/New_York',-300),null);
 assert.equal(buildScheduleProposal('2027-01-01T11:00','2027-01-01T10:00','Asia/Almaty',300),null);
});
test('schedule UI accepts only matching private customer proposal receipt',async()=>{
 const row={id:'123e4567-e89b-42d3-a456-426614174001',request_id:id,revision:1,status:'proposed',initiator:'customer',start_at:body.start_at,end_at:body.end_at,timezone:body.timezone,request_version:2,replayed:false};
 const json=(value,status=201,cache='no-store')=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':cache}});
 assert.equal(await readScheduleProposalReceipt(json(row),id,1,body),true);
 for(const response of [json({...row,initiator:'seller'}),json({...row,request_version:3}),json({...row,request_id:row.id}),json({...row,token:'secret'}),json(row,200),json(row,201,'public, no-store')]){
  assert.equal(await readScheduleProposalReceipt(response,id,1,body),false);
 }
});
