import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readPrivateGuestStatusResponse,MAX_STATUS_BYTES} from '../src/lib/guest-status-ui-core.mjs';

const id='123e4567-e89b-42d3-a456-426614174000';
const offer='123e4567-e89b-42d3-a456-426614174001';
const payload=JSON.stringify({id,service_offer_id:offer,state:'pending',version:1,created_at:'2026-11-08T00:00:00.000Z'});
const response=body=>new Response(body,{headers:{'content-type':'application/json'}});

test('private guest status reads a valid streamed response',async()=>{
 const result=await readPrivateGuestStatusResponse(response(payload),id,offer);
 assert.equal(result.id,id);
 assert.equal(result.state,'pending');
});

test('private guest status rejects a streamed body over byte budget without content-length',async()=>{
 const body=new ReadableStream({start(controller){
  controller.enqueue(new Uint8Array(MAX_STATUS_BYTES));
  controller.enqueue(new Uint8Array(1));
  controller.close();
 }});
 await assert.rejects(readPrivateGuestStatusResponse(response(body),id,offer),/guest_status_unavailable/);
});

test('private guest status rejects invalid UTF-8 and malformed JSON',async()=>{
 await assert.rejects(readPrivateGuestStatusResponse(response(new Uint8Array([0xff])),id,offer),/guest_status_unavailable/);
 await assert.rejects(readPrivateGuestStatusResponse(response('{'),id,offer),/guest_status_unavailable/);
});

test('private guest status rejects a misleading declared length',async()=>{
 const oversized=new Response(payload,{headers:{'content-type':'application/json','content-length':String(MAX_STATUS_BYTES+1)}});
 await assert.rejects(readPrivateGuestStatusResponse(oversized,id,offer),/guest_status_unavailable/);
});
