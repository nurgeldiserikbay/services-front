import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {readPrivateGuestStatusResponse,MAX_STATUS_BYTES} from '../src/lib/guest-status-ui-core.mjs';

test('oversized private status response rejects without awaiting stalled stream cancellation',async()=>{
  let cancelled=false;
  let released=false;
  const response={
    status:200,
    headers:new Headers({'content-type':'application/json'}),
    body:{getReader:()=>({
      read:async()=>({done:false,value:new Uint8Array(MAX_STATUS_BYTES+1)}),
      cancel:()=>{cancelled=true;return new Promise(()=>{});},
      releaseLock:()=>{released=true;},
    })},
  };
  await assert.rejects(
    readPrivateGuestStatusResponse(response,randomUUID(),randomUUID()),
    /guest_status_unavailable/,
  );
  assert.equal(cancelled,true);
  assert.equal(released,true);
});
