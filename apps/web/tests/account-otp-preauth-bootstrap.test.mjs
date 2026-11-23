import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {
 sealAccountOtpPreauth,openAccountOtpPreauth,
 verifyAccountOtpPreauth,allowAccountOtpBootstrapOrigin,
 ACCOUNT_OTP_PREAUTH_TTL_SECONDS,
} from '../src/lib/account-otp-preauth-core.mjs';

const key=randomBytes(32),other=randomBytes(32);
const now=Date.now();

test('preauth cookie has distinct purpose, secret and fixed five-minute TTL',()=>{
 const sealed=sealAccountOtpPreauth(key,now);
 const session=openAccountOtpPreauth(key,sealed.cookie,now);
 assert.deepEqual(session,{csrf:sealed.csrf,expiresAt:now+300000});
 assert.equal(verifyAccountOtpPreauth(session,sealed.csrf),true);
 assert.equal(verifyAccountOtpPreauth(session,randomBytes(32).toString('base64url')),false);
 assert.equal(verifyAccountOtpPreauth(session,null),false);
 assert.equal(openAccountOtpPreauth(other,sealed.cookie,now),null);
 assert.equal(openAccountOtpPreauth(key,sealed.cookie,now+300000),null);
 assert.equal(openAccountOtpPreauth(key,sealed.cookie,now-1),null);
 assert.equal(ACCOUNT_OTP_PREAUTH_TTL_SECONDS,300);
 assert.equal(sealed.cookie.includes(sealed.csrf),false);
 assert.equal(sealed.cookie.includes('account:otp_preauth'),false);
});

test('invalid or modified preauth cookies are never accepted',()=>{
 const sealed=sealAccountOtpPreauth(key,now);
 const parts=sealed.cookie.split('.');
 for(const cookie of [
  null,undefined,'',sealed.cookie+'X',sealed.cookie.slice(1),
  sealed.cookie.replace(/^v1/,'v2'),
  'x'.repeat(601),
  parts.slice(0,3).join('.'),
  ...parts.map((_,idx)=>{
   const copy=[...parts];copy[idx]='invalid';return copy.join('.');
  }),
 ]){
  assert.equal(openAccountOtpPreauth(key,cookie,now),null);
 }
 assert.throws(()=>sealAccountOtpPreauth(Buffer.alloc(31),now),
  /account_otp_preauth_unavailable/);
 assert.throws(()=>sealAccountOtpPreauth(key,1.5),
  /account_otp_preauth_unavailable/);
});

test('bootstrap requires strict same-origin fetch metadata and canonical origin',()=>{
 const origin='https://services.example.test';
 for(const candidate of [null,origin]){
  assert.equal(allowAccountOtpBootstrapOrigin(candidate,'same-origin',
   origin,true),true);
 }
 for(const [candidate,site,expected,prod] of [
  [origin,'same-site',origin,true],
  [origin,'cross-site',origin,true],
  [origin,'none',origin,true],
  [origin,null,origin,true],
  ['https://attacker.example.test','same-origin',origin,true],
  [origin+'/path','same-origin',origin,true],
  [null,'same-origin',origin+'/path',true],
  [null,'same-origin','http://services.example.test',true],
  [null,'same-origin','https://services.example.test?x=1',true],
  [null,'same-origin','bad origin',true],
 ]){
  assert.equal(allowAccountOtpBootstrapOrigin(
   candidate,site,expected,prod),false);
 }
 assert.equal(allowAccountOtpBootstrapOrigin(null,'same-origin',
  'http://localhost:3001',false),true);
});

test('default-off Next bootstrap cannot call OTP vendor or grant account login',()=>{
 const source=readFileSync(new URL(
  '../src/app/api/account/otp/bootstrap/route.ts',import.meta.url),'utf8');
 const server=readFileSync(new URL(
  '../src/lib/account-otp-preauth.server.ts',import.meta.url),'utf8');
 assert.match(source,/SERVICES_WEB_ENABLE_ACCOUNT_LOGIN_BFF/);
 assert.match(source,/SERVICES_WEB_ENABLE_ACCOUNT_OTP_BOOTSTRAP/);
 assert.match(source,/requireAccountOtpBootstrapOrigin/);
 assert.match(source,/issueAccountOtpPreauth/);
 assert.match(source,/no-store/);
 assert.match(source,/response\.cookies\.set/);
 assert.doesNotMatch(source,/initiateBackendAccountOtp|verifyBackendAccountOtp|session_token/);
 assert.match(server,/import 'server-only'/);
 assert.match(server,/__Host-services_account_otp_preauth/);
 assert.match(server,/SERVICES_WEB_ACCOUNT_OTP_PREAUTH_KEY/);
 assert.match(server,/httpOnly:true/);
 assert.match(server,/secure:true/);
 assert.match(server,/sameSite:'strict'/);
 assert.match(server,/authorizeAccountOtpPreauth/);
 assert.doesNotMatch(server,/guest_otp_init|account_otp_challenge_key/i);
});
