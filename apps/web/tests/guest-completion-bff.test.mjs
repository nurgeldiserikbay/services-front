import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {
 requestGuestCompletionOtp,verifyGuestCompletionOtp,
 confirmGuestCompletionBackend,GuestCompletionTransportUnavailable,
} from '../src/lib/guest-completion-backend.mjs';
import {
 sealGuestCompletionSession,openGuestCompletionSession,
} from '../src/lib/guest-completion-session-core.mjs';
import {readGuestCompletionBody,InvalidGuestCompletionBody}
 from '../src/lib/guest-completion-body.mjs';

const requestId=randomUUID(),challengeId=randomUUID();
const read=randomBytes(32).toString('base64url');
const completion=randomBytes(32).toString('base64url');
const net='v1.'+'b'.repeat(64)+'.1720000000000.'+'a'.repeat(64);
const base={baseUrl:'https://api.services.test/v1',
 production:true,requestId};
const response=(body,status)=>new Response(JSON.stringify(body),{
 status,headers:{'content-type':'application/json',
 'cache-control':'private, no-store, max-age=0'},
});
test('OTP dispatch sends only server capability and signed network attestation',async()=>{
 const ret=await requestGuestCompletionOtp({...base,readCapability:read,
  networkProof:net,locale:'kk',transport:async(url,opts)=>{
   assert.equal(url,'https://api.services.test/v1/guest-requests/'+requestId+'/completion/challenges');
   assert.equal(opts.headers['Guest-Capability'],read);
   assert.equal(opts.headers['X-Services-Network-Proof'],net);
   assert.equal(opts.body,'{"locale":"kk"}');
   assert.equal(opts.redirect,'manual');
   assert.equal(opts.credentials,'omit');
   return response({challenge_id:challengeId},202);
  }});
 assert.deepEqual(ret,{challengeId});
});
test('verified OTP and completed request strictly validate upstream response',async()=>{
 const now=Date.now();
 const verified=await verifyGuestCompletionOtp({...base,challengeId,code:'123456',now,
  transport:async(url,opts)=>{
   assert.ok(url.endsWith('/challenges/'+challengeId+'/verify'));
   assert.equal(opts.body,'{"code":"123456"}');
   return response({guest_capability:completion,
    expires_at:new Date(now+600000).toISOString()},200);
  }});
 assert.equal(verified.capability,completion);
 assert.equal(verified.expiresAt,now+600000);
 const confirmed=await confirmGuestCompletionBackend({...base,completionCapability:completion,
  version:2,transport:async(url,opts)=>{
   assert.ok(url.endsWith('/completion/confirm'));
   assert.equal(opts.headers['Guest-Completion-Capability'],completion);
   assert.equal(opts.headers['If-Match'],'"2"');
   assert.equal(opts.body,'{}');
   return response({id:requestId,state:'completed',version:3},200);
  }});
 assert.deepEqual(confirmed,{id:requestId,state:'completed',version:3});
});
test('invalid inputs cannot initiate an upstream request',async()=>{
 let calls=0;const transport=async()=>{calls++;return response({challenge_id:challengeId},202);};
 for(const patch of [
  {readCapability:'wrong'},{networkProof:'unsigned'},{locale:'en'},
  {baseUrl:'http://api.services.test/v1'},
  {baseUrl:'https://user:pass@api.services.test/v1'},
  {baseUrl:'https://api.services.test/v1?debug=true'},
  {requestId:'../admin'},
 ]){
  await assert.rejects(requestGuestCompletionOtp({...base,
   readCapability:read,networkProof:net,locale:'kk',...patch,transport}),
   GuestCompletionTransportUnavailable);
 }
 assert.equal(calls,0);
});
test('upstream secrets and forged status are never trusted',async()=>{
 for(const fake of [
  response({challenge_id:challengeId,private_contact:'secret'},202),
  response({challenge_id:challengeId},200),
  new Response(JSON.stringify({challenge_id:challengeId}),{status:202,
   headers:{'content-type':'application/json','cache-control':'public, max-age=60'}}),
 ]){
  await assert.rejects(requestGuestCompletionOtp({...base,readCapability:read,
   networkProof:net,locale:'kk',transport:async()=>fake}),
   GuestCompletionTransportUnavailable);
 }
 for(const fake of [
  response({id:requestId,state:'completed',version:2},200),
  response({id:randomUUID(),state:'completed',version:3},200),
  response({id:requestId,state:'completed',version:3,token:completion},200),
 ]){
  await assert.rejects(confirmGuestCompletionBackend({...base,
   completionCapability:completion,version:2,transport:async()=>fake}),
   GuestCompletionTransportUnavailable);
 }
});
test('completion sessions bind purpose, request and expiry with distinct AES-GCM AAD',()=>{
 const key=randomBytes(32),now=Date.now();
 const sealed=sealGuestCompletionSession(key,'completion',requestId,completion,now+600000,now);
 assert.deepEqual(openGuestCompletionSession(key,'completion',sealed,now),{
  requestId,value:completion,expiresAt:now+600000});
 assert.equal(openGuestCompletionSession(key,'challenge',sealed,now),null);
 assert.equal(openGuestCompletionSession(randomBytes(32),'completion',sealed,now),null);
 assert.equal(openGuestCompletionSession(key,'completion',sealed,now+600001),null);
 const forged=sealed.slice(0,-1)+(sealed.at(-1)==='a'?'b':'a');
 assert.equal(openGuestCompletionSession(key,'completion',forged,now),null);
 const challenge=sealGuestCompletionSession(key,'challenge',requestId,
  challengeId,now+500000,now);
 assert.equal(openGuestCompletionSession(key,'completion',challenge,now),null);
 assert.equal(openGuestCompletionSession(key,'challenge',challenge,now).value,challengeId);
});
test('BFF request parser limits bytes and requires an object',async()=>{
 const make=(body,headers={'content-type':'application/json'})=>({
  headers:new Headers(headers),
  body:new ReadableStream({start(controller){
   controller.enqueue(new TextEncoder().encode(body));controller.close();
  }}),
 });
 assert.deepEqual(await readGuestCompletionBody(make('{}')),{});
 for(const data of ['[]','null','"string"','x'.repeat(513)]){
  await assert.rejects(readGuestCompletionBody(make(data)),InvalidGuestCompletionBody);
 }
 await assert.rejects(readGuestCompletionBody(make('{}',{
  'content-type':'application/json','content-encoding':'gzip'})),InvalidGuestCompletionBody);
});
test('browser routes retain independent flag, CSRF, cookies and no bearer exposure',()=>{
 const root=new URL('../src/app/api/guest-requests/[id]/completion/',import.meta.url);
 const p=rel=>readFileSync(new URL(rel,root),'utf8');
 const start=p('challenges/route.ts');
 const verify=p('challenges/[challengeId]/verify/route.ts');
 const finish=p('confirm/route.ts');
 const wrapper=readFileSync(new URL('../src/lib/guest-completion-bff.server.ts',import.meta.url),'utf8');
 for(const route of [start,verify,finish]){
  assert.match(route,/SERVICES_WEB_ENABLE_GUEST_COMPLETION_BFF/);
  assert.match(route,/GUEST_REQUEST_COOKIE/);
  assert.match(route,/x-services-csrf/);
  assert.match(route,/no-store/);
  assert.doesNotMatch(route,/guest_capability|completionCapability|accountBearer/);
 }
 assert.match(wrapper,/authorizeGuestRequestMutation/);
 assert.match(wrapper,/requireNetworkProof/);
 assert.match(wrapper,/sealGuestCompletionSession/);
 assert.match(wrapper,/COMPLETION_PROOF_COOKIE/);
 assert.match(finish,/If-Match|if-match/);
});
