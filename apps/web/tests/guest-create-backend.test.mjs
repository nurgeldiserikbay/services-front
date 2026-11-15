import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {sendVerifiedGuestCreate,GuestCreateUnavailable}
  from '../src/lib/guest-create-backend.mjs';

const now=Date.parse('2026-11-04T11:00:00Z');
const offer=randomUUID(),id=randomUUID();
const createCapability=randomBytes(32).toString('base64url');
const requestCapability=randomBytes(32).toString('base64url');
const body={service_offer_id:offer,consent_to_contact:true,note:'Need an appointment'};
const idempotencyKey='guest_request_2026_11_04_001';
const result={id,state:'pending',request_capability:requestCapability,
  expires_at:new Date(now+86400000).toISOString()};

function json(data,status=201,headers={}){
  return new Response(JSON.stringify(data),{status,
    headers:{'content-type':'application/json',...headers}});
}
const call=override=>sendVerifiedGuestCreate({
  baseUrl:'https://backend.example/v1',production:true,createCapability,
  idempotencyKey,body,now,...override,
});

test('sends only scoped proof and idempotency over BFF TLS without browser credentials',async()=>{
  let calls=0;
  const actual=await call({transport:async(url,options)=>{
    calls++;
    assert.equal(url,'https://backend.example/v1/guest-requests');
    assert.equal(options.method,'POST');
    assert.equal(options.credentials,'omit');
    assert.equal(options.cache,'no-store');
    assert.equal(options.redirect,'manual');
    assert.equal(options.headers['Guest-Capability'],createCapability);
    assert.equal(options.headers['Idempotency-Key'],idempotencyKey);
    assert.deepEqual(JSON.parse(options.body),body);
    assert.ok(options.signal instanceof AbortSignal);
    return json(result);
  }});
  assert.equal(calls,1);
  assert.deepEqual(actual,{id,state:'pending',
    requestCapability,expiresAt:result.expires_at});
});

test('missing proof, invalid body, seller injection and invalid key never call backend',async()=>{
  let calls=0;
  const transport=async()=>{calls++;return json(result);};
  for(const override of [
    {createCapability:'short'}, {idempotencyKey:'bad'},
    {body:{...body,seller_id:randomUUID()}},
    {body:{...body,note:'a'.repeat(1001)}},
    {body:{...body,consent_to_contact:false}},
    {baseUrl:'http://backend.example/v1',production:true},
    {baseUrl:'https://user:password@backend.example/v1'},
  ]){
    await assert.rejects(call({...override,transport}),GuestCreateUnavailable);
  }
  assert.equal(calls,0);
});

test('backend responses reject authorization leaks and non-201 outcomes',async()=>{
  const malformed=[
    {data:{...result,request_capability:'short'}},
    {data:{...result,seller_id:randomUUID()}},
    {data:{...result,id:'wrong'}},
    {data:{...result,expires_at:new Date(now+86400000*2).toISOString()}},
    {data:{...result,expires_at:new Date(now-1000).toISOString()}},
    {data:result,status:200},
    {data:result,status:302},
    {data:result,headers:{'content-type':'text/html'}},
    {data:result,headers:{'content-length':'99999'}},
  ];
  for(const entry of malformed){
    await assert.rejects(call({transport:async()=>json(
      entry.data,entry.status??201,entry.headers??{},
    )}),GuestCreateUnavailable);
  }
});

test('transport error/timeout never exposes provider or capability secrets',async()=>{
  const sensitive='sensitive '+createCapability;
  await assert.rejects(call({transport:async()=>{
    throw new Error(sensitive);
  }}),(e)=>{
    assert.ok(e instanceof GuestCreateUnavailable);
    assert.equal(e.message.includes(createCapability),false);
    return true;
  });
});

test('server wrapper returns only safe receipt and sealed-cookie instructions',()=>{
  const source=readFileSync(new URL('../src/lib/guest-create-bff.server.ts',import.meta.url),'utf8');
  assert.match(source,/import 'server-only'/);
  assert.match(source,/authenticateGuestMutation\(input\)/);
  assert.match(source,/issueGuestRequestAccess/);
  assert.match(source,/clearGuestCreateSession\(\)/);
  assert.match(source,/receipt:\{id:created.id,state:created.state\}/);
  assert.doesNotMatch(source,/requestCapability:created.requestCapability,\s*\n\s*receipt/);
  const page=readFileSync(new URL('../src/app/[locale]/services/[id]/page.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(page,/submitVerifiedGuestRequest|GuestInquiryDraft/);
});

test('backend guest receipt rejects oversized streamed bodies without reading the rest',async()=>{
  let cancelled=false;
  let reads=0;
  const stream=new ReadableStream({
    pull(controller){
      reads++;
      controller.enqueue(new Uint8Array(8193));
    },
    cancel(){cancelled=true;},
  },{highWaterMark:0});
  await assert.rejects(call({transport:async()=>({
    status:201,
    headers:new Headers({'content-type':'application/json'}),
    body:stream,
  })}),GuestCreateUnavailable);
  assert.equal(cancelled,true,'oversized upstream stream must be cancelled');
  assert.equal(reads,1,'oversized upstream stream must not be fully consumed');
});

test('backend guest receipt rejects malformed UTF-8 in a streamed response',async()=>{
  const stream=new ReadableStream({
    start(controller){
      controller.enqueue(Uint8Array.from([0xc3,0x28]));
      controller.close();
    },
  });
  await assert.rejects(call({transport:async()=>({
    status:201,
    headers:new Headers({'content-type':'application/json'}),
    body:stream,
  })}),GuestCreateUnavailable);
});

test('backend guest receipt refuses an unusable stream rather than unbounded text fallback',async()=>{
  let textCalls=0;
  await assert.rejects(call({transport:async()=>({
    status:201,
    headers:new Headers({'content-type':'application/json'}),
    body:{},
    async text(){textCalls++;return JSON.stringify(result);},
  })}),GuestCreateUnavailable);
  assert.equal(textCalls,0);
});

test('backend guest receipt rejects extra JSON media parameters and non-UTF-8 charset',async()=>{
  for(const contentType of [
    'application/json; debug=true',
    'application/json; charset=iso-8859-1',
    'application/json; charset=utf-8; extra=1',
  ]){
    await assert.rejects(call({transport:async()=>json(result,201,{
      'content-type':contentType,
    })}),GuestCreateUnavailable);
  }
  assert.deepEqual(await call({transport:async()=>json(result,201,{
    'content-type':'application/json; charset="utf-8"',
  })}),{id,state:'pending',requestCapability,expiresAt:result.expires_at});
});

test('backend guest receipt refuses a missing body without calling text()',async()=>{
  let textCalls=0;
  await assert.rejects(call({transport:async()=>({
    status:201,
    headers:new Headers({'content-type':'application/json'}),
    body:null,
    async text(){textCalls++;return JSON.stringify(result);},
  })}),GuestCreateUnavailable);
  assert.equal(textCalls,0);
});

test('backend guest receipt accepts a valid JSON response split across byte chunks',async()=>{
  const encoded=new TextEncoder().encode(JSON.stringify(result));
  const midpoint=Math.floor(encoded.length/2);
  const stream=new ReadableStream({
    start(controller){
      controller.enqueue(encoded.subarray(0,midpoint));
      controller.enqueue(encoded.subarray(midpoint));
      controller.close();
    },
  });
  const actual=await call({transport:async()=>({
    status:201,
    headers:new Headers({'content-type':'application/json'}),
    body:stream,
  })});
  assert.deepEqual(actual,{id,state:'pending',
    requestCapability,expiresAt:result.expires_at});
});

test('backend guest receipt rejects forged small Content-Length with oversized stream',async()=>{
  let cancelled=false;
  const stream=new ReadableStream({
    start(controller){controller.enqueue(new Uint8Array(8193));},
    cancel(){cancelled=true;},
  });
  await assert.rejects(call({transport:async()=>({
    status:201,
    headers:new Headers({
      'content-type':'application/json',
      'content-length':'10',
    }),
    body:stream,
  })}),GuestCreateUnavailable);
  assert.equal(cancelled,true);
});

test('guest backend transport receives the same deadline used for the whole operation',async()=>{
  let signal;
  const actual=await call({transport:async(_url,options)=>{
    signal=options.signal;
    assert.equal(signal.aborted,false);
    return json(result);
  }});
  assert.equal(actual.id,id);
  assert.ok(signal instanceof AbortSignal);
});

test('guest backend transport failure stays generic when its abort signal fires',async()=>{
  await assert.rejects(call({transport:async(_url,options)=>{
    const error=new Error('secret upstream failure');
    options.signal.throwIfAborted();
    throw error;
  }}),error=>error instanceof GuestCreateUnavailable&&
    !error.message.includes('secret upstream failure'));
});

test('backend URL normalization does not depend on a request deadline',async()=>{
  for(const baseUrl of [
    'https://backend.example/v1',
    'https://backend.example/v1/',
  ]){
    const actual=await call({baseUrl,transport:async(url)=>{
      assert.equal(url,'https://backend.example/v1/guest-requests');
      return json(result);
    }});
    assert.equal(actual.id,id);
  }
});

test('backend URL rejects credentials, query, fragment and unsupported protocols before transport',async()=>{
  let calls=0;
  const transport=async()=>{calls++;return json(result);};
  for(const baseUrl of [
    'https://user:password@backend.example/v1',
    'https://backend.example/v1?debug=1',
    'https://backend.example/v1#fragment',
    'ftp://backend.example/v1',
    'https://backend.example/v1//',
  ]){
    await assert.rejects(call({baseUrl,transport}),GuestCreateUnavailable);
  }
  assert.equal(calls,0);
});

test('backend guest receipt requires explicit timezone in expiration timestamp',async()=>{
  const malformed=[
    '2026-11-05',
    '2026-11-05T11:00:00',
    '2026-11-05 11:00:00Z',
    'Thu, 05 Nov 2026 11:00:00 GMT',
    '2026-11-05T11:00:00.1234Z',
  ];
  for(const expires_at of malformed){
    await assert.rejects(call({transport:async()=>json({...result,expires_at})}),
      GuestCreateUnavailable);
  }
  const offsetExpiry='2026-11-05T16:00:00+05:00';
  const actual=await call({transport:async()=>json({
    ...result,expires_at:offsetExpiry,
  })});
  assert.equal(actual.expiresAt,offsetExpiry);
});

test('backend guest receipt rejects normalized impossible calendar dates',async()=>{
  for(const expires_at of [
    '2026-11-31T11:00:00Z',
    '2026-11-05T24:00:00Z',
    '2026-11-05T11:00:00+24:00',
    '2026-11-05T11:00:00.999+25:00',
  ]){
    await assert.rejects(call({transport:async()=>json({...result,expires_at})}),
      GuestCreateUnavailable);
  }
  const precise='2026-11-05T11:00:00.123Z';
  assert.equal((await call({transport:async()=>json({
    ...result,expires_at:precise,
  })})).expiresAt,precise);
});

test('backend receipt validates leap-day and timezone rollover exactly',async()=>{
  const leapNow=Date.parse('2028-02-28T12:00:00Z');
  const valid=[
    '2028-02-29T11:00:00Z',
    '2028-02-29T16:00:00+05:00',
    '2028-02-29T06:00:00-05:00',
  ];
  for(const expires_at of valid){
    const actual=await call({now:leapNow,transport:async()=>json({
      ...result,expires_at,
    })});
    assert.equal(actual.expiresAt,expires_at);
  }
  for(const expires_at of [
    '2027-02-29T11:00:00Z',
    '2028-02-30T11:00:00Z',
    '2028-02-29T11:00:00+25:00',
    '2028-02-29T11:00:00.1000Z',
  ]){
    await assert.rejects(call({now:leapNow,transport:async()=>json({
      ...result,expires_at,
    })}),GuestCreateUnavailable);
  }
});

test('backend receipt TTL never exceeds sealed guest access 24-hour limit',async()=>{
  const atLimit=new Date(now+24*60*60*1000).toISOString();
  const accepted=await call({transport:async()=>json({
    ...result,expires_at:atLimit,
  })});
  assert.equal(accepted.expiresAt,atLimit);
  for(const delta of [1,1000,5000]){
    await assert.rejects(call({transport:async()=>json({
      ...result,expires_at:new Date(now+24*60*60*1000+delta).toISOString(),
    })}),GuestCreateUnavailable);
  }
});
