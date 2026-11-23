import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomBytes,randomUUID} from 'node:crypto';
import {
 verifyAccountOtpMutationOrigin,validateAccountOtpVerifyPayload,
 readAccountOtpVerifyPayload,MAX_ACCOUNT_OTP_VERIFY_BODY_BYTES,
} from '../src/lib/account-otp-verify-route-core.mjs';

const challenge=randomUUID();
const csrf=randomBytes(32).toString('base64url');
const body={challenge_id:challenge,channel:'EMAIL',code:'123456',csrf_token:csrf};

test('account OTP verification has strict same-origin POST policy',()=>{
 const origin='https://services.example.test';
 assert.equal(verifyAccountOtpMutationOrigin(origin,origin,'same-origin'),true);
 for(const [supplied,expected,site] of [
  [null,origin,'same-origin'],
  [origin,origin,null],
  [origin,origin,'none'],
  [origin,origin,'same-site'],
  [origin,origin,'cross-site'],
  ['https://attacker.example.test',origin,'same-origin'],
  [origin+'/login',origin,'same-origin'],
  [origin,origin+'/login','same-origin'],
  [origin,'http://services.example.test','same-origin'],
 ]){
  assert.equal(verifyAccountOtpMutationOrigin(supplied,expected,site),false);
 }
});

test('account OTP verification accepts only exact bounded challenge/CSRF/code fields',()=>{
 assert.deepEqual(validateAccountOtpVerifyPayload(body),{
  challengeId:challenge,channel:'EMAIL',code:'123456',csrfToken:csrf,
 });
 for(const mutation of [
  {...body,channel:'PUSH'},
  {...body,channel:'sms'},
  {...body,code:'00000'},
  {...body,code:'1234567'},
  {...body,code:123456},
  {...body,challenge_id:'bad'},
  {...body,csrf_token:'wrong'},
  {...body,person_id:randomUUID()},
  {...body,session_token:'secret'},
  {...body,contact:'test@example.test'},
  {code:'123456',csrf_token:csrf},
  {},[],null,
 ]){
  assert.equal(validateAccountOtpVerifyPayload(mutation),null);
 }
});

test('account OTP verify stream reader bounds bytes and rejects malformed UTF-8/JSON',async()=>{
 const valid=new Response(JSON.stringify(body));
 assert.deepEqual(await readAccountOtpVerifyPayload(valid.body),{
  challengeId:challenge,channel:'EMAIL',code:'123456',csrfToken:csrf,
 });
 assert.equal(MAX_ACCOUNT_OTP_VERIFY_BODY_BYTES,512);
 let cancelled=false;
 const large=new ReadableStream({
  start(controller){controller.enqueue(new Uint8Array(513));},
  cancel(){cancelled=true;},
 });
 await assert.rejects(readAccountOtpVerifyPayload(large),
  /invalid_account_otp_verify_payload/);
 assert.equal(cancelled,true);
 assert.equal(await readAccountOtpVerifyPayload(
  new Response(new Uint8Array([0xff])).body),null);
 assert.equal(await readAccountOtpVerifyPayload(
  new Response('{oops').body),null);
 assert.equal(await readAccountOtpVerifyPayload(
  new Response(JSON.stringify({...body,extra:true})).body),null);
});

test('verify BFF is independently default-off and never returns bearer in JSON',()=>{
 const code=readFileSync(new URL(
  '../src/app/api/account/otp/verify/route.ts',import.meta.url),'utf8');
 assert.match(code,/SERVICES_WEB_ENABLE_ACCOUNT_LOGIN_BFF/);
 assert.match(code,/SERVICES_WEB_ENABLE_ACCOUNT_OTP_VERIFY_BFF/);
 assert.match(code,/verifyAccountOtpMutationOrigin/);
 assert.match(code,/authorizeAccountOtpChallenge/);
 assert.match(code,/requireAccountWebSessionKey/);
 assert.match(code,/exchangeVerifiedAccountOtpForCookie/);
 assert.match(code,/response\.cookies\.set/);
 assert.match(code,/clearAccountOtpChallenge/);
 assert.match(code,/clearAccountOtpPreauth/);
 assert.match(code,/code:'AUTHENTICATED'/);
 assert.match(code,/reply\(401,'VERIFICATION_FAILED'\)/);
 assert.match(code,/no-store/);
 assert.doesNotMatch(code,/session_token:|accountBearer:|return\s+.*sessionToken/);
 assert.doesNotMatch(code,/initiateBackendAccountOtp|X-Services-Network-Proof/);
});
