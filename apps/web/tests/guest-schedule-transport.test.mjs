import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomBytes,randomUUID} from 'node:crypto';
import {requestGuestScheduleOtp,verifyGuestScheduleOtp} from '../src/lib/guest-schedule-backend.mjs';
import {readBackendActiveSchedule,mutateBackendAccountSchedule} from '../src/lib/account-session-transport.mjs';
import {sealGuestScheduleSession,openGuestScheduleSession} from '../src/lib/guest-schedule-session-core.mjs';
import {openGuestCompletionSession} from '../src/lib/guest-completion-session-core.mjs';

const requestId=randomUUID(),challengeId=randomUUID(),guestCapability=randomBytes(32).toString('base64url');
const baseUrl='https://backend.example.test/v1';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store'}});
test('guest OTP uses dedicated scope and no account authorization',async()=>{
 const now=Date.now();
 const networkProof='v1.'+'a'.repeat(64)+'.'+now+'.'+'b'.repeat(64);
 const challenge=await requestGuestScheduleOtp({baseUrl,requestId,readCapability:guestCapability,networkProof,locale:'kk',transport:async(url,init)=>{
  assert.equal(url,baseUrl+'/guest-requests/'+requestId+'/schedule-access/challenges');
  assert.equal(init.headers['Guest-Capability'],guestCapability);
  assert.equal(init.headers.Authorization,undefined);
  assert.equal(init.redirect,'manual');assert.equal(init.credentials,'omit');
  return json({challenge_id:challengeId},202);
 }});
 assert.deepEqual(challenge,{challengeId});
 const expiresAt=now+600000;
 const proof=await verifyGuestScheduleOtp({baseUrl,requestId,challengeId,code:'123456',now,transport:async(url,init)=>{
  assert.equal(url,baseUrl+'/guest-requests/'+requestId+'/schedule-access/challenges/'+challengeId+'/verify');
  assert.deepEqual(JSON.parse(init.body),{code:'123456'});
  return json({guest_capability:guestCapability,expires_at:new Date(expiresAt).toISOString()});
 }});
 assert.deepEqual(proof,{capability:guestCapability,expiresAt});
});
test('guest schedule read denies mixed credentials and seller-shaped guest receipt',async()=>{
 const view={request_id:requestId,request_version:1,actor:'customer',can_propose:true,proposal:null};
 assert.deepEqual(await readBackendActiveSchedule({baseUrl,requestId,guestCapability,transport:async(url,init)=>{
  assert.equal(url,baseUrl+'/requests/'+requestId+'/schedule-proposals/active');
  assert.deepEqual(init.headers,{'Guest-Capability':guestCapability,Accept:'application/json'});
  return json(view);
 }}),view);
 await assert.rejects(readBackendActiveSchedule({baseUrl,requestId,guestCapability,accountBearer:guestCapability,transport:async()=>assert.fail('mixed credentials dispatched')}));
 await assert.rejects(readBackendActiveSchedule({baseUrl,requestId,guestCapability,transport:async()=>json({...view,actor:'seller'})}));
 const proposalId=randomUUID();
 assert.deepEqual(await mutateBackendAccountSchedule({baseUrl,requestId,guestCapability,version:1,key:'guest_schedule_key_123',action:'decline',proposalId,transport:async(url,init)=>{
  assert.equal(url,baseUrl+'/requests/'+requestId+'/schedule-proposals/'+proposalId+'/decline');
  assert.equal(init.headers['Guest-Capability'],guestCapability);
  assert.equal(init.headers.Authorization,undefined);
  assert.equal(init.headers['If-Match'],'"1"');
  return new Response(null,{status:409});
 }}),{kind:'conflict'});
});
test('guest schedule cookie is purpose bound and expires independently of completion',()=>{
 const key=randomBytes(32),now=Date.now(),expiry=now+60000;
 const cookie=sealGuestScheduleSession(key,'schedule',requestId,guestCapability,expiry,now);
 assert.deepEqual(openGuestScheduleSession(key,'schedule',cookie,now),{requestId,value:guestCapability,expiresAt:expiry});
 assert.equal(openGuestCompletionSession(key,'completion',cookie,now),null);
 assert.equal(openGuestScheduleSession(key,'challenge',cookie,now),null);
 assert.equal(openGuestScheduleSession(key,'schedule',cookie,expiry),null);
});
