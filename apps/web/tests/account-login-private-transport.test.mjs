import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {sealAccountWebSession,openAccountWebSession} from '../src/lib/account-web-session-core.mjs';
import {verifyBackendAccountOtp,AccountLoginTransportUnavailable,AccountLoginTransportDenied}
 from '../src/lib/account-login-private-transport.mjs';
const serviceKey=randomBytes(32).toString('base64');
const challengeId=randomUUID();
const token=randomBytes(32).toString('base64url');
const req={baseUrl:'https://api.example.test/v1',serviceKey,challengeId,channel:'EMAIL',code:'012345'};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
test('private account transport applies server-only URL, key and response contract',async()=>{
 let observed;
 const out=await verifyBackendAccountOtp({...req,transport:async(url,options)=>{
  observed={url,options};
  return reply({session_token:token,expires_in_seconds:43200});
 }});
 assert.deepEqual(out,{sessionToken:token,expiresInSeconds:43200});
 assert.equal(observed.url,'https://api.example.test/v1/auth/private/account/verify');
 assert.equal(observed.options.headers['X-Services-Account-Login-Key'],serviceKey);
 assert.equal(observed.options.credentials,'omit');
 assert.equal(observed.options.redirect,'manual');
});
test('private account transport rejects malformed, oversized and denied responses',async()=>{
 await assert.rejects(verifyBackendAccountOtp({...req,transport:async()=>reply({},401)}),AccountLoginTransportDenied);
 for(const bad of [
  {session_token:'invalid',expires_in_seconds:43200},
  {session_token:token,expires_in_seconds:43201},
  {session_token:token,expires_in_seconds:43200,extra:'unexpected'},
 ]){
  await assert.rejects(verifyBackendAccountOtp({...req,transport:async()=>reply(bad)}),AccountLoginTransportUnavailable);
 }
 await assert.rejects(verifyBackendAccountOtp({...req,transport:async()=>new Response(null,{status:302})}),AccountLoginTransportUnavailable);
});
test('invalid inputs rejected before transport',async()=>{
 let count=0;
 await assert.rejects(verifyBackendAccountOtp({...req,code:'12345',transport:async()=>{count++;return reply({});}}),AccountLoginTransportUnavailable);
 assert.equal(count,0);
});

test('verified server-issued session is sealed in a non-readable browser cookie',()=>{
 const key=randomBytes(32);
 const result=sealAccountWebSession(key,token,43200);
 assert.equal(result.cookie.includes(token),false);
 assert.equal(openAccountWebSession(key,result.cookie)?.token,token);
 assert.equal(openAccountWebSession(randomBytes(32),result.cookie),null);
});
test('BFF remains server-only, feature-gated and exposes cookie instructions, not bearer',()=>{
 const source=readFileSync(new URL('../src/lib/account-login-bff.server.ts',import.meta.url),'utf8');
 assert.match(source,/import 'server-only'/);
 assert.match(source,/SERVICES_WEB_ENABLE_ACCOUNT_LOGIN_BFF/);
 assert.match(source,/verifyBackendAccountOtp/);
 assert.match(source,/issueAccountWebSession/);
 assert.match(source,/setCookie/);
 assert.doesNotMatch(source,/return\s*\{[^}]*sessionToken/);
});

test('private account transport refuses unsafe base URL and noncanonical service key before network',async()=>{
 let count=0;
 const transport=async()=>{count++;return reply({session_token:token,expires_in_seconds:300});};
 for(const baseUrl of [
  'http://api.example.test/v1',
  'https://user:password@api.example.test/v1',
  'https://api.example.test/v1?token=abc',
  'https://api.example.test/v1#fragment',
  'https://api.example.test/v1/%2e%2e/v2',
  'https://api.example.test/v1/%61',
  'https://api.example.test/v1//foo',
  'file:///etc/passwd',
 ]){
  await assert.rejects(verifyBackendAccountOtp({...req,baseUrl,transport}),AccountLoginTransportUnavailable);
 }
 await assert.rejects(verifyBackendAccountOtp({...req,serviceKey:'A'.repeat(43)+'=',transport}),AccountLoginTransportUnavailable);
 assert.equal(count,0);
});

test('private account transport bounds streamed response even when content length is absent',async()=>{
 let cancelled=false;
 const transport=async()=>new Response(new ReadableStream({
  pull(controller){
   controller.enqueue(new Uint8Array(2049));
  },
  cancel(){cancelled=true;}
 }),{status:200,headers:{'content-type':'application/json'}});
 await assert.rejects(verifyBackendAccountOtp({...req,transport}),AccountLoginTransportUnavailable);
 assert.equal(cancelled,true);
});

test('private account transport rejects spoofed length, malformed JSON and forbidden statuses',async()=>{
 for(const response of [
  new Response('not-json',{status:200,headers:{'content-type':'application/json'}}),
  new Response('{}',{status:200,headers:{'content-type':'text/html'}}),
  new Response('{}',{status:200,headers:{'content-type':'application/json','content-length':'9000'}}),
  new Response('{}',{status:200,headers:{'content-type':'application/json','content-length':'NaN'}}),
  new Response(null,{status:403}),
  new Response(null,{status:500}),
 ]){
  await assert.rejects(verifyBackendAccountOtp({...req,transport:async()=>response}),AccountLoginTransportUnavailable);
 }
});
