import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {
 sealAccountOtpPreauth,openAccountOtpPreauth,verifyAccountOtpPreauth,
} from '../src/lib/account-otp-preauth-core.mjs';
import {
 sealAccountOtpChallenge,openAccountOtpChallenge,verifyAccountOtpChallenge,
} from '../src/lib/account-otp-challenge-session-core.mjs';
import {
 sealAccountWebSession,openAccountWebSession,verifyAccountCsrf,
} from '../src/lib/account-web-session-core.mjs';
import {
 startApprovedAccountOtp,
} from '../src/lib/account-otp-start-core.mjs';
import {
 verifyBackendAccountOtp,AccountLoginTransportDenied,
 AccountLoginTransportUnavailable,
} from '../src/lib/account-login-private-transport.mjs';
import {
 validateAccountOtpVerifyPayload,verifyAccountOtpMutationOrigin,
} from '../src/lib/account-otp-verify-route-core.mjs';
import {
 requireAccountOtpCompletionKeys,
} from '../src/lib/account-otp-completion-preflight.mjs';

function secret(){return randomBytes(32);}
const keys={preauth:secret(),challenge:secret(),session:secret(),privateBff:secret()};
const b64=Object.fromEntries(Object.entries(keys)
 .map(([name,key])=>[name,key.toString('base64')]));
const base='https://api.example.test/v1';
const origin='https://services.example.test';
const proof='v1.'+randomBytes(32).toString('hex')+'.'+Date.now()+
 '.'+randomBytes(32).toString('hex');
const uuid=randomUUID();
const verifiedToken=randomBytes(32).toString('base64url');
const otp='123456';
const fixtureContact='fixture+'+randomUUID()+'@example.test';
const now=Date.now();

function fixture(){
 let deliver=0,verify=0,used=false;
 const preauth=sealAccountOtpPreauth(keys.preauth,now);
 const issue=async(body,preauthCookie=preauth.cookie,challengeCookie,accountCookie)=>{
  requireAccountOtpCompletionKeys(b64);
  return startApprovedAccountOtp({
   body,preauthCookie,
   existingChallengeCookie:challengeCookie,existingAccountCookie:accountCookie,
   trustedNetworkProof:proof,
   authorizePreauth:(cookie,csrf)=>{
    const state=openAccountOtpPreauth(keys.preauth,cookie,now);
    if(!verifyAccountOtpPreauth(state,csrf))throw Error('preauth_denied');
   },
   requireChallengeKey:()=>{
    assert.equal(keys.challenge.length,32);
   },
   dispatch:async input=>{
    deliver++;
    assert.deepEqual(input,{
     channel:'EMAIL',contact:fixtureContact,locale:'kk',
     purpose:'SIGN_IN',trustedNetworkProof:proof,
    });
    return {challengeId:uuid,expiresInSeconds:300};
   },
   issueChallenge:receipt=>{
    const c=sealAccountOtpChallenge(keys.challenge,
     receipt.challengeId,receipt.channel,receipt.expiresInSeconds,now);
    return {csrf:c.csrf,cookie:{
     name:'__Host-services_account_otp_challenge',value:c.cookie,
     options:{httpOnly:true,secure:true,sameSite:'strict',path:'/',maxAge:300},
    }};
   },
  });
 };
 const verifyPayload=async(challengeCookie,payload,backendStatus='success')=>{
  assert.equal(verifyAccountOtpMutationOrigin(origin,origin,'same-origin'),true);
  const parsed=validateAccountOtpVerifyPayload(payload);
  if(!parsed)throw Error('invalid_verify_payload');
  const state=openAccountOtpChallenge(keys.challenge,challengeCookie,now);
  if(!verifyAccountOtpChallenge(state,parsed.challengeId,
     parsed.channel,parsed.csrfToken))throw Error('challenge_denied');
  const result=await verifyBackendAccountOtp({
   baseUrl:base,serviceKey:b64.privateBff,production:true,
   challengeId:parsed.challengeId,channel:parsed.channel,code:parsed.code,
   transport:async(url,init)=>{
    verify++;
    assert.equal(url,base+'/auth/private/account/verify');
    assert.deepEqual(JSON.parse(init.body),{
     challenge_id:uuid,channel:'EMAIL',code:parsed.code,
    });
    if(backendStatus==='unavailable')throw Error('network_unavailable');
    if(backendStatus==='denied'||parsed.code!==otp||used)
     return new Response(JSON.stringify({secret:'do not leak'}),{status:401});
    used=true;
    return new Response(JSON.stringify({
     session_token:verifiedToken,expires_in_seconds:600,
    }),{status:200,headers:{'Content-Type':'application/json'}});
   },
  });
  const session=sealAccountWebSession(keys.session,
   result.sessionToken,result.expiresInSeconds,now);
  return {sealed:session,backendBearer:result.sessionToken};
 };
 return {preauth,issue,verifyPayload,get counts(){
  return {deliver,verify,used};
 }};
}
const request=(csrf)=>({
 channel:'EMAIL',contact:fixtureContact,locale:'kk',
 purpose:'SIGN_IN',csrf_token:csrf,
});
const verifyRequest=(csrf,code=otp,id=uuid,channel='EMAIL')=>({
 challenge_id:id,channel,code,csrf_token:csrf,
});

test('full fixture journey: preauth, provider receipt, challenge, one-use verify and protected session',async()=>{
 const f=fixture();
 const start=await f.issue(request(f.preauth.csrf));
 assert.equal(f.counts.deliver,1);
 assert.deepEqual(Object.keys(start).sort(),
  ['challengeId','csrf','expiresInSeconds','setCookie']);
 assert.equal(start.challengeId,uuid);
 assert.equal(start.expiresInSeconds,300);
 assert.equal(start.setCookie.name,'__Host-services_account_otp_challenge');
 assert.equal(start.setCookie.options.httpOnly,true);
 assert.equal(start.setCookie.options.secure,true);
 assert.equal(start.setCookie.options.sameSite,'strict');
 for(const hidden of [fixtureContact,otp,verifiedToken,proof]){
  assert.equal(JSON.stringify(start).includes(hidden),false);
 }
 const oldChallenge=start.setCookie.value;
 assert.equal(openAccountOtpChallenge(keys.preauth,oldChallenge,now),null);
 const result=await f.verifyPayload(oldChallenge,verifyRequest(start.csrf));
 const web=openAccountWebSession(keys.session,result.sealed.cookie,now);
 assert.deepEqual(web,{
  token:verifiedToken,csrf:result.sealed.csrf,
  expiresAt:now+600000,scope:'account:web',
 });
 assert.equal(verifyAccountCsrf(web,result.sealed.csrf),true);
 assert.equal(verifyAccountCsrf(web,start.csrf),false);
 assert.equal(openAccountWebSession(keys.challenge,result.sealed.cookie,now),null);
 assert.equal(f.counts.verify,1);
 assert.equal(f.counts.used,true);
 await assert.rejects(f.verifyPayload(oldChallenge,verifyRequest(start.csrf)),
  AccountLoginTransportDenied);
 assert.equal(f.counts.verify,2,'replayed OTP must fail closed at backend');
});

test('swapped challenge, wrong CSRF, wrong channel or cookie cannot invoke backend verifier',async()=>{
 const f=fixture();
 const start=await f.issue(request(f.preauth.csrf));
 for(const [cookie,payload] of [
  [start.setCookie.value,verifyRequest(f.preauth.csrf)],
  [start.setCookie.value,verifyRequest(start.csrf,otp,randomUUID())],
  [start.setCookie.value,verifyRequest(start.csrf,otp,uuid,'SMS')],
  [start.setCookie.value+'!',verifyRequest(start.csrf)],
  [f.preauth.cookie,verifyRequest(start.csrf)],
 ]){
  await assert.rejects(f.verifyPayload(cookie,payload),/challenge_denied/);
 }
 assert.equal(f.counts.verify,0);
});

test('forged preauth, malformed body, existing session or challenge prevents any dispatch',async()=>{
 const f=fixture();
 for(const [payload,cookie,ch,acc] of [
  [request(randomBytes(32).toString('base64url')),f.preauth.cookie],
  [request(f.preauth.csrf),'bad-cookie'],
  [{...request(f.preauth.csrf),customer_person_id:randomUUID()},f.preauth.cookie],
  [request(f.preauth.csrf),f.preauth.cookie,'existing-challenge'],
  [request(f.preauth.csrf),f.preauth.cookie,undefined,'existing-account'],
 ]){
  await assert.rejects(f.issue(payload,cookie,ch,acc));
 }
 assert.equal(f.counts.deliver,0);
});

test('rejected and unknown backend verification never create a session',async()=>{
 const f=fixture();
 const start=await f.issue(request(f.preauth.csrf));
 await assert.rejects(f.verifyPayload(start.setCookie.value,
  verifyRequest(start.csrf,'000000')),AccountLoginTransportDenied);
 await assert.rejects(f.verifyPayload(start.setCookie.value,
  verifyRequest(start.csrf), 'unavailable'),AccountLoginTransportUnavailable);
 assert.equal(f.counts.verify,2);
 assert.equal(f.counts.used,false);
});

test('expired preauth and challenge prevent processing past 300s',async()=>{
 const f=fixture();
 assert.equal(openAccountOtpPreauth(keys.preauth,f.preauth.cookie,now+300000),null);
 const start=await f.issue(request(f.preauth.csrf));
 assert.equal(openAccountOtpChallenge(keys.challenge,start.setCookie.value,
  now+300000),null);
 assert.equal(f.counts.deliver,1);
});
