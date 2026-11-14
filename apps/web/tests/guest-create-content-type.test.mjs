import assert from 'node:assert/strict';
import {test} from 'node:test';
import {isGuestCreateJsonContentType,isGuestCreateContentLengthAllowed,GUEST_CREATE_MAX_BODY_BYTES} from '../src/lib/guest-create-route-core.mjs';

test('guest creation accepts only JSON with an optional UTF-8 charset',()=>{
  for(const value of [
    'application/json', 'APPLICATION/JSON',
    'application/json; charset=utf-8',
    'application/json; charset="utf-8"',
  ])assert.equal(isGuestCreateJsonContentType(value),true,value);
  for(const value of [
    null,undefined,'', 'text/plain', 'application/json;evil',
    'application/json; charset=iso-8859-1',
    'application/json; charset=utf-8; debug=true',
    'application/json; charset=',
    'application/json; charset=utf-8 garbage',
  ])assert.equal(isGuestCreateJsonContentType(value),false,String(value));
});

test('guest creation rejects invalid and oversized declared body lengths',()=>{
  for(const value of [null,'0','1',String(GUEST_CREATE_MAX_BODY_BYTES)])
    assert.equal(isGuestCreateContentLengthAllowed(value),true,String(value));
  for(const value of [
    '', '-1', '+1', '1.0', ' 1', '1 ', 'NaN',
    String(GUEST_CREATE_MAX_BODY_BYTES+1),
    '9007199254740993', '999999999999999999999999999999',
    undefined, 42,
  ])assert.equal(isGuestCreateContentLengthAllowed(value),false,String(value));
});

test('invalid guest request stream fails without waiting for stalled cancellation',async()=>{
  const {readBoundedGuestCreateBody,GUEST_CREATE_MAX_BODY_BYTES}=
    await import('../src/lib/guest-create-route-core.mjs');
  let cancelled=false;
  let released=false;
  const stream={getReader(){return {
    async read(){return {done:false,value:new Uint8Array(GUEST_CREATE_MAX_BODY_BYTES+1)};},
    cancel(){cancelled=true;return new Promise(()=>{});},
    releaseLock(){released=true;},
  };}};
  await assert.rejects(
    Promise.race([
      readBoundedGuestCreateBody(stream),
      new Promise((_,reject)=>setTimeout(()=>reject(new Error('cancellation stalled')),200)),
    ]),
    error=>error instanceof Error&&error.message==='invalid_create_payload',
  );
  assert.equal(cancelled,true);
  assert.equal(released,true);
});

test('guest creation stops a stalled body read when the request is aborted',async()=>{
  const {readBoundedGuestCreateBody}=await import('../src/lib/guest-create-route-core.mjs');
  const controller=new AbortController();
  let cancelled=false;
  const stream={getReader(){return {
    read(){return new Promise(()=>{});},
    cancel(){cancelled=true;return Promise.resolve();},
    releaseLock(){},
  };}};
  const pending=readBoundedGuestCreateBody(stream,controller.signal);
  controller.abort();
  await assert.rejects(pending,/invalid_create_payload/);
  assert.equal(cancelled,true,'aborted body read should request stream cancellation');
});
