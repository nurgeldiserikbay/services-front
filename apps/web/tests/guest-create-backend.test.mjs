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
