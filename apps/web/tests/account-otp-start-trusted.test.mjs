import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {
 parseAccountOtpStart,readAccountOtpStart,
 validateTrustedAccountOtpProof,startApprovedAccountOtp,
 MAX_ACCOUNT_OTP_START_BYTES,
} from '../src/lib/account-otp-start-core.mjs';

const uuid=randomUUID(),csrf=randomBytes(32).toString('base64url');
const trustedProof='v1.'+randomBytes(32).toString('hex')+'.'+Date.now()+
 '.'+randomBytes(32).toString('hex');
const body={channel:'EMAIL',contact:'test@example.test',locale:'kk',
 purpose:'SIGN_IN',csrf_token:csrf};

test('strict account OTP issuance body validates contact/locale and exact fields',()=>{
 assert.deepEqual(parseAccountOtpStart(body),{
  channel:'EMAIL',contact:'test@example.test',locale:'kk',
  purpose:'SIGN_IN',csrfToken:csrf,
 });
 assert.deepEqual(parseAccountOtpStart({...body,channel:'SMS',
  contact:'+77011234567'}),{
  channel:'SMS',contact:'+77011234567',locale:'kk',
  purpose:'SIGN_IN',csrfToken:csrf,
 });
 for(const mutation of [
  null,[],{}, {...body,extra:'secret'},
  {...body,contact:'a'.repeat(255)},
  {...body,contact:'abc\r\nInjected: true@example.test'},
  {...body,contact:'not-an-email'},
  {...body,contact:'other@example.test',channel:'SMS'},
  {...body,contact:'0700123456',channel:'SMS'},
  {...body,csrf_token:'bad'},
  {...body,channel:'PUSH'},
  {...body,locale:'en'},
  {...body,purpose:'PASSWORD_RESET'},
  {...body,person_id:uuid},
  {...body,network_proof:trustedProof},
 ]){
  assert.equal(parseAccountOtpStart(mutation),null);
 }
});
test('bounded UTF-8 JSON reader prevents overlong and malformed inputs',async()=>{
 assert.equal(MAX_ACCOUNT_OTP_START_BYTES,512);
 const valid=new Response(JSON.stringify(body));
 assert.deepEqual(await readAccountOtpStart(valid.body),
  parseAccountOtpStart(body));
 assert.equal(await readAccountOtpStart(new Response('{oops').body),null);
 assert.equal(await readAccountOtpStart(new Response(
  new Uint8Array([0xff])).body),null);
 let cancelled=false;
 const stream=new ReadableStream({
  start(controller){controller.enqueue(new Uint8Array(513));},
  cancel(){cancelled=true;},
 });
 await assert.rejects(readAccountOtpStart(stream),
  /invalid_account_otp_start/);
 assert.equal(cancelled,true);
});
test('trusted proof is never optional or a browser IP/forwarded header',()=>{
 assert.equal(validateTrustedAccountOtpProof(trustedProof),true);
 for(const v of [null,undefined,'','127.0.0.1',
  'x-forwarded-for: 127.0.0.1','v1.invalid',
  trustedProof.toUpperCase(),'x'.repeat(161)]){
  assert.equal(validateTrustedAccountOtpProof(v),false);
 }
});
test('successful private orchestration returns only opaque challenge proof',async()=>{
 const actions=[];
 const issuedCookie={name:'__Host-services_account_otp_challenge',
  value:'ciphertext',options:{httpOnly:true}};
 const result=await startApprovedAccountOtp({
  body,preauthCookie:'sealed-preauth',
  existingChallengeCookie:undefined,existingAccountCookie:undefined,
  trustedNetworkProof:trustedProof,
  authorizePreauth:(cookie,token)=>{
   actions.push('preauth');assert.equal(cookie,'sealed-preauth');
   assert.equal(token,csrf);
  },
  requireChallengeKey:()=>{actions.push('key');},
  dispatch:async(input)=>{
   actions.push('dispatch');
   assert.deepEqual(input,{
    channel:'EMAIL',contact:'test@example.test',locale:'kk',
    purpose:'SIGN_IN',trustedNetworkProof:trustedProof,
   });
   return {challengeId:uuid,expiresInSeconds:300};
  },
  issueChallenge:receipt=>{
   actions.push('issue');
   assert.deepEqual(receipt,{challengeId:uuid,channel:'EMAIL',
    expiresInSeconds:300});
   return {csrf,setCookie:issuedCookie,cookie:issuedCookie};
  },
 });
 assert.deepEqual(actions,['preauth','key','dispatch','issue']);
 assert.deepEqual(result,{
  challengeId:uuid,csrf,expiresInSeconds:300,setCookie:issuedCookie,
 });
 assert.equal(JSON.stringify(result).includes('test@example.test'),false);
 assert.equal(JSON.stringify(result).includes(trustedProof),false);
});
test('all auth and config denials happen before the private backend dispatch',async()=>{
 let calls=0;
 const base={
  body,preauthCookie:'sealed-preauth',trustedNetworkProof:trustedProof,
  authorizePreauth:()=>{},requireChallengeKey:()=>{},
  dispatch:async()=>{calls++;return {challengeId:uuid,expiresInSeconds:300};},
  issueChallenge:()=>({csrf,cookie:{name:'a',value:'sealed',options:{}}}),
 };
 for(const patch of [
  {body:{...body,contact:'not-email'}},
  {preauthCookie:undefined},
  {existingAccountCookie:'already-logged-in'},
  {existingChallengeCookie:'existing'},
  {trustedNetworkProof:'127.0.0.1'},
  {authorizePreauth:()=>{throw new Error('invalid_preauth');}},
  {requireChallengeKey:()=>{throw new Error('key_unavailable');}},
 ]){
  await assert.rejects(startApprovedAccountOtp({...base,...patch}));
 }
 assert.equal(calls,0,'no denied input may send an OTP');
});
test('a provider or receipt failure cannot mint challenge cookie',async()=>{
 let issues=0;
 const base={
  body,preauthCookie:'sealed-preauth',trustedNetworkProof:trustedProof,
  authorizePreauth:()=>{},requireChallengeKey:()=>{},
  issueChallenge:()=>{issues++;return {csrf,cookie:{value:'sealed'}};},
 };
 for(const receipt of [undefined,null,{challengeId:uuid,expiresInSeconds:0},
  {challengeId:uuid,expiresInSeconds:600}]){
  await assert.rejects(startApprovedAccountOtp({...base,
   dispatch:async()=>receipt}));
 }
 assert.equal(issues,0);
});
test('trusted adapter remains server-only and unmounted until edge acceptance',()=>{
 const source=readFileSync(new URL(
  '../src/lib/account-otp-start-trusted.server.ts',import.meta.url),'utf8');
 assert.match(source,/import 'server-only'/);
 assert.match(source,/authorizeAccountOtpPreauth/);
 assert.match(source,/requireAccountOtpChallengeKey/);
 assert.match(source,/initiateApprovedAccountOtp/);
 assert.match(source,/issueAccountOtpChallenge/);
 assert.match(source,/SERVICES_WEB_ENABLE_ACCOUNT_OTP_BOOTSTRAP/);
 assert.match(source,/SERVICES_WEB_ENABLE_ACCOUNT_OTP_INIT_BFF/);
 assert.doesNotMatch(source,/NextRequest|NextResponse|request\.headers\.get/);
 assert.doesNotMatch(source,/x-forwarded-for.*headers|x-real-ip.*headers/i);
});
