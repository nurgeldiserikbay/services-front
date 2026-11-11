import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {readGuestRequestStatus,GuestStatusUnavailable}
  from '../src/lib/guest-status-backend.mjs';

const requestId=randomUUID(),otherRequestId=randomUUID(),
  offerId=randomUUID(),proof=randomBytes(32).toString('base64url');
const valid={id:requestId,service_offer_id:offerId,
  state:'accepted',version:2,created_at:'2026-11-04T08:00:00.000Z'};
const call=overrides=>readGuestRequestStatus({
  baseUrl:'https://api.example/v1',production:true,
  requestId,requestCapability:proof,...overrides,
});
function response(obj,status=200,headers={}){
  return new Response(JSON.stringify(obj),{status,headers:{
    'Content-Type':'application/json',...headers,
  }});
}

test('status read sends secret only to configured HTTPS backend header',async()=>{
  const result=await call({transport:async(url,options)=>{
    assert.equal(url,'https://api.example/v1/requests/'+requestId);
    assert.equal(options.method,'GET');
    assert.equal(options.cache,'no-store');
    assert.equal(options.redirect,'manual');
    assert.equal(options.credentials,'omit');
    assert.equal(options.headers['Guest-Capability'],proof);
    assert.equal(options.headers.Accept,'application/json');
    assert.ok(options.signal instanceof AbortSignal);
    return response({...valid,note:'private'});
  }}).catch(e=>e);
  assert.ok(result instanceof GuestStatusUnavailable,
    'unexpected fields must fail closed, even if they contain private data');
  const ok=await call({transport:async()=>response(valid)});
  assert.deepEqual(ok,{id:requestId,serviceOfferId:offerId,
    state:'accepted',version:2,createdAt:valid.created_at});
  assert.equal(JSON.stringify(ok).includes(proof),false);
});

test('reject invalid request identity, capability and insecure backend without I/O',async()=>{
  let calls=0;
  const transport=async()=>{calls++;return response(valid);};
  for(const o of [
    {requestId:'bad'},{requestCapability:'bad'},
    {baseUrl:'http://api.example/v1',production:true},
    {baseUrl:'http://api.example/v1',production:false},
    {baseUrl:'http://127.0.0.1:3000/v1',production:true},
    {baseUrl:'https://user:secret@api.example/v1'},
    {baseUrl:'https://api.example/v1?token=secret'},
    {baseUrl:'https://api.example/v1#fragment'},
    {baseUrl:'https://api.example/v1%2fprivate'},
    {baseUrl:'https://api.example/v1%5cprivate'},
    {baseUrl:'https://api.example/v1//private'},
  ]){
    await assert.rejects(call({...o,transport}),GuestStatusUnavailable);
  }
  assert.equal(calls,0);
});

test('reject other request, extra columns, invalid states and oversized replies',async()=>{
  for(const data of [
    {...valid,id:otherRequestId},{...valid,contact:'private'},
    {...valid,state:'created'},{...valid,version:0},
    {...valid,created_at:'invalid'},[valid],null,
  ])await assert.rejects(call({transport:async()=>response(data)}),
    GuestStatusUnavailable);
  await assert.rejects(call({transport:async()=>response(valid,200,{
    'Content-Length':'5000',
  })}),GuestStatusUnavailable);
  await assert.rejects(call({transport:async()=>response(valid,200,{
    'Content-Type':'text/html',
  })}),GuestStatusUnavailable);
});

test('reject redirects, non-200, network errors without exposing proof',async()=>{
  for(const status of [301,302,401,403,404,429,500]){
    await assert.rejects(call({transport:async()=>response(valid,status)}),
      GuestStatusUnavailable);
  }
  await assert.rejects(call({transport:async()=>{
    throw new Error('secret '+proof);
  }}),(err)=>{
    assert.ok(err instanceof GuestStatusUnavailable);
    assert.equal(err.message.includes(proof),false);
    return true;
  });
});

test('BFF code remains server-only, request-cookie-bound and not publicly mounted',()=>{
  const read=p=>readFileSync(new URL('../src/'+p,import.meta.url),'utf8');
  const wrapper=read('lib/guest-status-bff.server.ts');
  for(const token of ["import 'server-only'",'openGuestRequestAccess',
    'requestId:input.requestId','session.capability',
    "input.fetchSite!=='same-origin'"]){
    assert.ok(wrapper.includes(token),token);
  }
  const offer=read('app/[locale]/services/[id]/page.tsx');
  assert.doesNotMatch(offer,/getPrivateGuestStatus|guest-status-bff/);
});

test('streaming BFF rejects oversized chunks before EOF without awaiting cancellation',async()=>{
  let cancelled=false;
  let released=false;
  const transport=async()=>({
    status:200,
    headers:new Headers({'content-type':'application/json'}),
    body:{getReader:()=>({
      read:async()=>({done:false,value:new Uint8Array(4097)}),
      cancel:()=>{cancelled=true;return new Promise(()=>{});},
      releaseLock:()=>{released=true;},
    })},
  });
  await assert.rejects(call({transport}),GuestStatusUnavailable);
  assert.equal(cancelled,true);
  assert.equal(released,true);
});

test('streaming BFF rejects malformed UTF-8 without returning partial private data',async()=>{
  const transport=async()=>new Response(new Uint8Array([0xff,0xfe]),{
    headers:{'content-type':'application/json'},
  });
  await assert.rejects(call({transport}),GuestStatusUnavailable);
});

test('BFF and browser agree on canonical UTC timestamp requirements',async()=>{
  for(const timestamp of [
    '2026-02-30T08:00:00.000Z',
    '2026-11-04T08:00:00Z',
    '2026-11-04T08:00:00.000+00:00',
    '2026-11-04 08:00:00',
    '2026-11-04T08:00:00.000',
    '2026-13-04T08:00:00.000Z',
  ]){
    await assert.rejects(
      call({transport:async()=>response({...valid,created_at:timestamp})}),
      GuestStatusUnavailable,
      timestamp,
    );
  }
  assert.deepEqual(await call({transport:async()=>response(valid)}),{
    id:requestId,serviceOfferId:offerId,state:'accepted',
    version:2,createdAt:valid.created_at,
  });
});

test('BFF cancels rejected upstream bodies without awaiting a stalled cancellation',async()=>{
  for(const responseOptions of [
    {status:403,contentType:'application/json',length:null},
    {status:200,contentType:'text/html',length:null},
    {status:200,contentType:'application/json',length:'5000'},
  ]){
    let canceled=false;
    const headers=new Headers({'content-type':responseOptions.contentType});
    if(responseOptions.length!==null)headers.set('content-length',responseOptions.length);
    const transport=async()=>({
      status:responseOptions.status,headers,
      body:{cancel:()=>{canceled=true;return new Promise(()=>{});}},
    });
    await assert.rejects(call({transport}),GuestStatusUnavailable);
    assert.equal(canceled,true);
  }
});

test('development permits local HTTP but never forwards capabilities over remote plaintext',async()=>{
 const local=await call({
  baseUrl:'http://127.0.0.1:3000/v1',production:false,
  transport:async(url,options)=>{
   assert.equal(url,'http://127.0.0.1:3000/v1/requests/'+requestId);
   assert.equal(options.headers['Guest-Capability'],proof);
   return response(valid);
  },
 });
 assert.equal(local.id,requestId);
});
