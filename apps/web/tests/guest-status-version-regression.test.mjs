import assert from 'node:assert/strict';
import {test} from 'node:test';
import {shouldReplaceGuestStatus,parsePrivateGuestStatus} from '../src/lib/guest-status-ui-core.mjs';

const requestId='11111111-1111-4111-8111-111111111111';
const offerId='22222222-2222-4222-8222-222222222222';
const status=(version,state='pending')=>({
  id:requestId,service_offer_id:offerId,state,version,
  created_at:'2026-11-11T10:00:00.000Z',
});

test('guest status never regresses when a delayed response has an older version',()=>{
  let current=null;
  let displayed=null;
  for(const reply of [status(3,'accepted'),status(2),status(3,'declined'),status(4,'completed')]){
    const parsed=parsePrivateGuestStatus(reply,requestId,offerId);
    if(shouldReplaceGuestStatus(current,parsed.version)){
      current=parsed.version;
      displayed=parsed.state;
    }
  }
  assert.equal(current,4);
  assert.equal(displayed,'completed');
});

test('guest status rejects invalid versions and foreign receipts',()=>{
  assert.equal(shouldReplaceGuestStatus(null,0),false);
  assert.equal(shouldReplaceGuestStatus(2,2),false);
  assert.equal(shouldReplaceGuestStatus(2,1),false);
  assert.equal(shouldReplaceGuestStatus(2,Number.MAX_SAFE_INTEGER+1),false);
  assert.throws(()=>parsePrivateGuestStatus(status(1),requestId,'33333333-3333-4333-8333-333333333333'));
  assert.throws(()=>parsePrivateGuestStatus(status(1),'33333333-3333-4333-8333-333333333333',offerId));
});

test('guest status rejects a response containing private or unexpected fields',()=>{
  assert.throws(()=>parsePrivateGuestStatus({...status(2),contact_phone:'+77000000000'},requestId,offerId));
  assert.throws(()=>parsePrivateGuestStatus({...status(2),created_at:'2026-02-30T10:00:00.000Z'},requestId,offerId));
  assert.throws(()=>parsePrivateGuestStatus({...status(2),version:1.5},requestId,offerId));
});

test('guest status transport rejects oversized streams even when content-length is absent',async()=>{
  const {readPrivateGuestStatusResponse,MAX_STATUS_BYTES}=
    await import('../src/lib/guest-status-ui-core.mjs');
  let canceled=false;
  const response=new Response(new ReadableStream({
    start(controller){controller.enqueue(new Uint8Array(MAX_STATUS_BYTES+1));},
    cancel(){canceled=true;},
  }),{headers:{'content-type':'application/json'}});
  await assert.rejects(readPrivateGuestStatusResponse(response,requestId,offerId),
    /guest_status_unavailable/);
  assert.equal(canceled,true);
});

test('guest status transport denies non-JSON, bad HTTP status and oversized declared length',async()=>{
  const {readPrivateGuestStatusResponse,MAX_STATUS_BYTES}=
    await import('../src/lib/guest-status-ui-core.mjs');
  const body=JSON.stringify(status(2));
  for(const response of [
    new Response(body,{status:403,headers:{'content-type':'application/json'}}),
    new Response(body,{headers:{'content-type':'text/html'}}),
    new Response(body,{headers:{'content-type':'application/json',
      'content-length':String(MAX_STATUS_BYTES+1)}}),
    new Response(body,{headers:{'content-type':'application/json','content-length':'NaN'}}),
  ]){
    await assert.rejects(readPrivateGuestStatusResponse(response,requestId,offerId),
      /guest_status_unavailable/);
  }
});

test('guest status transport accepts a valid bounded streamed JSON response',async()=>{
  const {readPrivateGuestStatusResponse}=
    await import('../src/lib/guest-status-ui-core.mjs');
  const response=new Response(JSON.stringify(status(7,'accepted')),{
    status:200,headers:{'content-type':'application/json; charset=utf-8'},
  });
  assert.deepEqual(await readPrivateGuestStatusResponse(response,requestId,offerId),{
    id:requestId,state:'accepted',version:7,createdAt:'2026-11-11T10:00:00.000Z',
  });
});

test('guest status transport rejects malformed UTF-8 and invalid JSON',async()=>{
  const {readPrivateGuestStatusResponse}=
    await import('../src/lib/guest-status-ui-core.mjs');
  for(const bytes of [new Uint8Array([0xc3,0x28]),
    new TextEncoder().encode('{"state":')]){
    const response=new Response(bytes,{headers:{'content-type':'application/json'}});
    await assert.rejects(readPrivateGuestStatusResponse(response,requestId,offerId),
      /guest_status_unavailable/);
  }
});
