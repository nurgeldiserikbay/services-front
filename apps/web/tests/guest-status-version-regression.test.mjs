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

test('guest status fallback normalizes failed and oversized text responses',async()=>{
  const {readPrivateGuestStatusResponse,MAX_STATUS_BYTES}=
    await import('../src/lib/guest-status-ui-core.mjs');
  const headers=new Headers({'content-type':'application/json'});
  const base={status:200,headers,body:null};
  for(const text of [
    async()=>{throw new Error('internal upstream detail');},
    async()=>('x'.repeat(MAX_STATUS_BYTES+1)),
    async()=>null,
  ]){
    await assert.rejects(readPrivateGuestStatusResponse({...base,text},requestId,offerId),
      error=>error instanceof Error&&error.message==='guest_status_unavailable');
  }
});

test('guest status transport normalizes missing or throwing response headers',async()=>{
  const {readPrivateGuestStatusResponse}=
    await import('../src/lib/guest-status-ui-core.mjs');
  for(const headers of [
    undefined,
    {get(){throw new Error('private transport detail');}},
    {get(){return 42;}},
  ]){
    const response={status:200,headers,body:null,text:async()=>JSON.stringify(status(1))};
    await assert.rejects(readPrivateGuestStatusResponse(response,requestId,offerId),
      error=>error instanceof Error&&error.message==='guest_status_unavailable');
  }
});

test('guest status transport normalizes stream acquisition failures',async()=>{
  const {readPrivateGuestStatusResponse}=
    await import('../src/lib/guest-status-ui-core.mjs');
  const response={
    status:200,
    headers:new Headers({'content-type':'application/json'}),
    body:{getReader(){throw new Error('private stream failure');}},
  };
  await assert.rejects(readPrivateGuestStatusResponse(response,requestId,offerId),
    error=>error instanceof Error&&error.message==='guest_status_unavailable');
});

test('guest status transport normalizes stream lock release failures',async()=>{
 const {readPrivateGuestStatusResponse}=
   await import('../src/lib/guest-status-ui-core.mjs');
 const response={
  status:200,
  headers:new Headers({'content-type':'application/json'}),
  body:{getReader(){return {
   async read(){return {done:true};},
   releaseLock(){throw new Error('private lock detail');},
  };}},
 };
 await assert.rejects(readPrivateGuestStatusResponse(response,requestId,offerId),
  error=>error instanceof Error&&error.message==='guest_status_unavailable');
});

test('guest status transport rejects a stream returning a non-byte chunk',async()=>{
  const {readPrivateGuestStatusResponse}=
    await import('../src/lib/guest-status-ui-core.mjs');
  let canceled=false;
  const response={
    status:200,
    headers:new Headers({'content-type':'application/json'}),
    body:{getReader(){return {
      async read(){return {done:false,value:'private upstream payload'};},
      cancel(){canceled=true;return Promise.resolve();},
      releaseLock(){},
    };}},
  };
  await assert.rejects(readPrivateGuestStatusResponse(response,requestId,offerId),
    error=>error instanceof Error&&error.message==='guest_status_unavailable');
  assert.equal(canceled,true);
});

test('guest status transport normalizes throwing body accessors',async()=>{
  const {readPrivateGuestStatusResponse}=
    await import('../src/lib/guest-status-ui-core.mjs');
  const response={
    status:200,
    headers:new Headers({'content-type':'application/json'}),
    get body(){throw new Error('sensitive response transport detail');},
    text:async()=>JSON.stringify(status(1)),
  };
  await assert.rejects(readPrivateGuestStatusResponse(response,requestId,offerId),
    error=>error instanceof Error&&error.message==='guest_status_unavailable');
});

test('guest status transport normalizes throwing stream reader accessors',async()=>{
  const {readPrivateGuestStatusResponse}=
    await import('../src/lib/guest-status-ui-core.mjs');
  const response={
    status:200,
    headers:new Headers({'content-type':'application/json'}),
    body:{get getReader(){throw new Error('private reader accessor detail');}},
  };
  await assert.rejects(readPrivateGuestStatusResponse(response,requestId,offerId),
    error=>error instanceof Error&&error.message==='guest_status_unavailable');
});

test('guest status transport rejects a body larger than its claimed content-length',async()=>{
  const {readPrivateGuestStatusResponse,MAX_STATUS_BYTES}=
    await import('../src/lib/guest-status-ui-core.mjs');
  const response=new Response('x'.repeat(MAX_STATUS_BYTES+1),{
    headers:{'content-type':'application/json','content-length':'1'},
  });
  await assert.rejects(readPrivateGuestStatusResponse(response,requestId,offerId),
    /guest_status_unavailable/);
});

test('guest status rejects invalid UTF-8 even when the byte count is within limit',async()=>{
  const {readPrivateGuestStatusResponse}=
    await import('../src/lib/guest-status-ui-core.mjs');
  const response=new Response(new Uint8Array([0xff]),{
    headers:{'content-type':'application/json','content-length':'1'},
  });
  await assert.rejects(readPrivateGuestStatusResponse(response,requestId,offerId),
    /guest_status_unavailable/);
});

test('guest status rejects unsafe and misleading declared byte lengths',async()=>{
  const {readPrivateGuestStatusResponse,MAX_STATUS_BYTES}=
    await import('../src/lib/guest-status-ui-core.mjs');
  const body=JSON.stringify(status(2));
  for(const declared of [
    '9007199254740993','999999999999999999999999999999999',
    '-1','1.5','Infinity','0x10',String(MAX_STATUS_BYTES+1),
  ]){
    const response=new Response(body,{
      headers:{'content-type':'application/json','content-length':declared},
    });
    await assert.rejects(readPrivateGuestStatusResponse(response,requestId,offerId),
      error=>error instanceof Error&&error.message==='guest_status_unavailable',
      'invalid content-length '+declared);
  }
});


test('guest status never buffers a non-streaming private response body',async()=>{
  const {readPrivateGuestStatusResponse}=
    await import('../src/lib/guest-status-ui-core.mjs');
  let textCalled=false;
  const response={
    status:200,
    headers:new Headers({'content-type':'application/json'}),
    body:{},
    async text(){textCalled=true;return JSON.stringify(status(1));},
  };
  await assert.rejects(readPrivateGuestStatusResponse(response,requestId,offerId),
    error=>error instanceof Error&&error.message==='guest_status_unavailable');
  assert.equal(textCalled,false,'unbounded response.text must never be invoked');
});


test('guest status abort deadline releases stalled body and permits a retry',async()=>{
  const {withGuestStatusAbort}=await import('../src/lib/guest-status-ui-core.mjs');
  const controller=new AbortController();
  const pending=withGuestStatusAbort(()=>new Promise(()=>{}),controller.signal);
  controller.abort();
  await assert.rejects(pending,/guest_status_timeout/);
  const retry=new AbortController();
  assert.equal(await withGuestStatusAbort(()=>Promise.resolve('fresh'),retry.signal),'fresh');
});

test('guest status abort deadline does not execute work after cancellation',async()=>{
  const {withGuestStatusAbort}=await import('../src/lib/guest-status-ui-core.mjs');
  const controller=new AbortController();
  controller.abort();
  let called=false;
  await assert.rejects(withGuestStatusAbort(()=>{called=true;},controller.signal),
    /guest_status_timeout/);
  assert.equal(called,false);
});


test('guest status deadline settles once when body completes after abort',async()=>{
  const {withGuestStatusAbort}=await import('../src/lib/guest-status-ui-core.mjs');
  const controller=new AbortController();
  let finish;
  const body=new Promise(resolve=>{finish=resolve;});
  const result=withGuestStatusAbort(()=>body,controller.signal);
  controller.abort();
  await assert.rejects(result,/guest_status_timeout/);
  finish('late private status');
  await body;
  await assert.rejects(result,/guest_status_timeout/);
});

test('guest status deadline removes abort listener after success and failure',async()=>{
  const {withGuestStatusAbort}=await import('../src/lib/guest-status-ui-core.mjs');
  const controller=new AbortController();
  let listeners=0;
  const signal={
    get aborted(){return controller.signal.aborted;},
    addEventListener(type,listener,options){
      listeners++;
      controller.signal.addEventListener(type,listener,options);
    },
    removeEventListener(type,listener){
      listeners--;
      controller.signal.removeEventListener(type,listener);
    },
  };
  assert.equal(await withGuestStatusAbort(()=>42,signal),42);
  assert.equal(listeners,0);
  await assert.rejects(withGuestStatusAbort(()=>Promise.reject(new Error('failed')),signal),/failed/);
  assert.equal(listeners,0);
});


test('guest status abort before the queued operation prevents body parsing',async()=>{
  const {withGuestStatusAbort}=await import('../src/lib/guest-status-ui-core.mjs');
  const controller=new AbortController();
  let called=false;
  const pending=withGuestStatusAbort(()=>{called=true;return 'private data';},controller.signal);
  controller.abort();
  await assert.rejects(pending,/guest_status_timeout/);
  assert.equal(called,false,'aborted refresh must not begin parsing response data');
});


test('guest status abort deadline removes its listener after cancellation',async()=>{
  const {withGuestStatusAbort}=await import('../src/lib/guest-status-ui-core.mjs');
  const controller=new AbortController();
  let attached=0;
  const signal={
    get aborted(){return controller.signal.aborted;},
    addEventListener(type,listener,options){
      attached++;
      controller.signal.addEventListener(type,listener,options);
    },
    removeEventListener(type,listener){
      attached--;
      controller.signal.removeEventListener(type,listener);
    },
  };
  const pending=withGuestStatusAbort(()=>new Promise(()=>{}),signal);
  controller.abort();
  await assert.rejects(pending,/guest_status_timeout/);
  assert.equal(attached,0,'aborted refresh must release its abort listener');
});
