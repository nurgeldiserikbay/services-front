import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
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
