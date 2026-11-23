import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {
 initiateBackendAccountOtp,AccountOtpInitiationUnavailable,
} from '../src/lib/account-otp-init-private-transport.mjs';

const serviceKey=randomBytes(32).toString('base64');
const digest=randomBytes(32).toString('hex');
const proof='v1.'+digest+'.'+String(Date.now())+'.'+randomBytes(32).toString('hex');
const body={channel:'EMAIL',contact:'test@example.test',purpose:'SIGN_IN',locale:'kk'};
const opts={baseUrl:'https://api.example.test/v1',production:true,
 serviceKey,networkProof:proof,...body};
const receipt={challenge_id:'123e4567-e89b-42d3-a456-426614174000',expires_in_seconds:300};
const json=(value,status=201,headers={})=>new Response(JSON.stringify(value),{
 status,headers:{'Content-Type':'application/json',
  'Cache-Control':'private, no-store, max-age=0',...headers},
});

test('private OTP initiation forwards only approved private key and signed proof',async()=>{
 let called=0;
 const result=await initiateBackendAccountOtp({...opts,
  transport:async(url,init)=>{
   called++;
   assert.equal(url,'https://api.example.test/v1/auth/private/account/challenges');
   assert.equal(init.method,'POST');
   assert.equal(init.headers['X-Services-Account-Login-Key'],serviceKey);
   assert.equal(init.headers['X-Services-Network-Proof'],proof);
   assert.deepEqual(JSON.parse(init.body),body);
   assert.equal(init.credentials,'omit');
   assert.equal(init.cache,'no-store');
   assert.equal(init.redirect,'manual');
   assert.ok(init.signal instanceof AbortSignal);
   return json(receipt);
  },
 });
 assert.equal(called,1);
 assert.deepEqual(result,{challengeId:receipt.challenge_id,expiresInSeconds:300});
});

test('invalid config, untrusted proof and malformed contact fail before request',async()=>{
 let calls=0;
 const transport=async()=>{calls++;return json(receipt);};
 for(const patch of [
  {serviceKey:'bad'},
  {serviceKey:randomBytes(31).toString('base64')},
  {networkProof:'x-forwarded-for: 127.0.0.1'},
  {networkProof:'v1.'+digest+'.'+Date.now()+'.broken'},
  {baseUrl:'http://api.example.test/v1'},
  {baseUrl:'https://user:pass@api.example.test/v1'},
  {baseUrl:'https://api.example.test/v1?danger=true'},
  {baseUrl:'https://api.example.test/v1%2fadmin'},
  {channel:'PUSH'},
  {purpose:'RESET_PASSWORD'},
  {locale:'en'},
  {contact:''},
  {contact:'a'.repeat(255)},
  {contact:'test@example.test\nInjected: yes'},
 ]){
  await assert.rejects(
   initiateBackendAccountOtp({...opts,...patch,transport}),
   AccountOtpInitiationUnavailable);
 }
 assert.equal(calls,0);
});

test('strict no-store receipt rejects backend leakage, redirects, oversized bodies and unknown TTL',async()=>{
 for(const response of [
  json({...receipt,code:'secret'}),
  json({...receipt,contact:'test@example.test'}),
  json({...receipt,expires_in_seconds:600}),
  json({...receipt,challenge_id:'not-a-uuid'}),
  json(receipt,200),
  json(receipt,302),
  json(receipt,503),
  json(receipt,201,{'Content-Type':'text/html'}),
  json(receipt,201,{'Cache-Control':'public, max-age=60'}),
  json(receipt,201,{'Content-Length':'9000'}),
  json(receipt,201,{'Content-Range':'bytes 0-1/2'}),
 ]){
  await assert.rejects(initiateBackendAccountOtp({...opts,
   transport:async()=>response}),AccountOtpInitiationUnavailable);
 }
});

test('streaming response cap and fatal UTF-8 decoding reject malicious receipts',async()=>{
 let cancelled=false;
 const bodyStream=new ReadableStream({
  start(controller){controller.enqueue(new Uint8Array(513));},
  cancel(){cancelled=true;},
 });
 const bad={status:201,headers:new Headers({
  'Content-Type':'application/json','Cache-Control':'private, no-store',
 }),body:bodyStream};
 await assert.rejects(initiateBackendAccountOtp({...opts,
  transport:async()=>bad}),AccountOtpInitiationUnavailable);
 assert.equal(cancelled,true);
 const utf8=new Response(new Uint8Array([0xff]),{status:201,headers:{
  'Content-Type':'application/json','Cache-Control':'no-store',
 }});
 await assert.rejects(initiateBackendAccountOtp({...opts,
  transport:async()=>utf8}),AccountOtpInitiationUnavailable);
});

test('OTP initiation is server-only, independently gated and not mounted as browser route',()=>{
 const source=readFileSync(new URL('../src/lib/account-otp-init-bff.server.ts',
  import.meta.url),'utf8');
 assert.match(source,/import 'server-only'/);
 assert.match(source,/SERVICES_WEB_ENABLE_ACCOUNT_LOGIN_BFF/);
 assert.match(source,/SERVICES_WEB_ENABLE_ACCOUNT_OTP_INIT_BFF/);
 assert.match(source,/trustedNetworkProof/);
 assert.doesNotMatch(source,/NextRequest|NextResponse|request\.headers\.get/);
 const keys=Object.keys(body).sort();
 assert.deepEqual(keys,['channel','contact','locale','purpose']);
});
