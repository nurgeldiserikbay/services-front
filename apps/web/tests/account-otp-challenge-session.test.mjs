import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {
 sealAccountOtpChallenge,openAccountOtpChallenge,
 verifyAccountOtpChallenge,ACCOUNT_OTP_CHALLENGE_MAX_TTL_SECONDS,
} from '../src/lib/account-otp-challenge-session-core.mjs';

const key=randomBytes(32);
const otherKey=randomBytes(32);
const uuid=randomUUID();
const now=Date.now();
test('account challenge is sealed for exact ID/channel and short TTL',()=>{
 const sealed=sealAccountOtpChallenge(key,uuid,'EMAIL',300,now);
 const session=openAccountOtpChallenge(key,sealed.cookie,now);
 assert.deepEqual(session,{
  challengeId:uuid,channel:'EMAIL',csrf:sealed.csrf,
  expiresAt:now+300000,
 });
 assert.equal(verifyAccountOtpChallenge(session,uuid,'EMAIL',sealed.csrf),true);
 assert.equal(verifyAccountOtpChallenge(session,randomUUID(),'EMAIL',sealed.csrf),false);
 assert.equal(verifyAccountOtpChallenge(session,uuid,'SMS',sealed.csrf),false);
 assert.equal(verifyAccountOtpChallenge(session,uuid,'EMAIL',
  randomBytes(32).toString('base64url')),false);
 assert.equal(openAccountOtpChallenge(otherKey,sealed.cookie,now),null);
 assert.equal(openAccountOtpChallenge(key,sealed.cookie,now+300000),null);
 assert.equal(openAccountOtpChallenge(key,sealed.cookie,now+300001),null);
 assert.equal(openAccountOtpChallenge(key,sealed.cookie,now-1),null);
 assert.equal(ACCOUNT_OTP_CHALLENGE_MAX_TTL_SECONDS,300);
 for(const value of [uuid,'EMAIL',sealed.csrf,'account:otp_challenge']){
  assert.ok(!sealed.cookie.includes(value),
   'sealed cookie cannot reveal its challenge fields');
 }
});
test('account challenge cannot be reused across guest or main account keys',()=>{
 const sealed=sealAccountOtpChallenge(key,uuid,'SMS',120,now);
 assert.equal(openAccountOtpChallenge(otherKey,sealed.cookie,now),null);
 const session=openAccountOtpChallenge(key,sealed.cookie,now);
 assert.equal(verifyAccountOtpChallenge(session,uuid,'SMS',sealed.csrf),true);
 assert.equal(verifyAccountOtpChallenge(session,uuid,'EMAIL',sealed.csrf),false);
});
test('tampered cookies and unbounded inputs fail closed',()=>{
 const sealed=sealAccountOtpChallenge(key,uuid,'EMAIL',300,now);
 for(const cookie of [
  undefined,null,'',sealed.cookie+'x',sealed.cookie.slice(1),
  sealed.cookie.replace(/^v1/,'v2'),
  'a'.repeat(1025),
  sealed.cookie.split('.').slice(0,3).join('.'),
  ...sealed.cookie.split('.').map((segment,index)=>{
   const parts=sealed.cookie.split('.');
   parts[index]='bad';return parts.join('.');
  }),
 ]){
  assert.equal(openAccountOtpChallenge(key,cookie,now),null);
 }
 for(const [id,channel,ttl] of [
  ['bad','EMAIL',300],[uuid,'bad',300],[uuid,'EMAIL',0],
  [uuid,'EMAIL',301],[uuid,'EMAIL',1.5],
 ]){
  assert.throws(()=>sealAccountOtpChallenge(key,id,channel,ttl,now),
   /account_otp_challenge_unavailable/);
 }
 assert.throws(()=>sealAccountOtpChallenge(otherKey.subarray(0,31),uuid,
  'EMAIL',300,now),/account_otp_challenge_unavailable/);
});
test('account OTP server cookie is secure, independent and no public route added',()=>{
 const source=readFileSync(new URL(
  '../src/lib/account-otp-challenge-session.server.ts',import.meta.url),'utf8');
 assert.match(source,/import 'server-only'/);
 assert.match(source,/SERVICES_WEB_ACCOUNT_OTP_CHALLENGE_KEY/);
 assert.match(source,/__Host-services_account_otp_challenge/);
 assert.match(source,/httpOnly:true/);
 assert.match(source,/secure:true/);
 assert.match(source,/sameSite:'strict'/);
 assert.match(source,/authorizeAccountOtpChallenge/);
 assert.match(source,/verifyAccountOtpChallenge/);
 assert.doesNotMatch(source,/NextRequest|NextResponse|localStorage|sessionStorage/);
});
