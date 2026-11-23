import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {requireAccountOtpCompletionKeys}
 from '../src/lib/account-otp-completion-preflight.mjs';

const secrets=()=>({
 preauth:randomBytes(32).toString('base64'),
 challenge:randomBytes(32).toString('base64'),
 session:randomBytes(32).toString('base64'),
 privateBff:randomBytes(32).toString('base64'),
});
test('account OTP completion secrets are canonical and distinct',()=>{
 const valid=secrets();
 assert.equal(requireAccountOtpCompletionKeys(valid),true);
 for(const name of Object.keys(valid)){
  for(const bad of [undefined,null,'',Buffer.alloc(31).toString('base64'),
   'password',Buffer.alloc(32).toString('base64url')]){
   const candidate={...valid,[name]:bad};
   assert.throws(()=>requireAccountOtpCompletionKeys(candidate),
    /account_otp_config_unavailable/);
  }
 }
 for(const from of Object.keys(valid)){
  for(const to of Object.keys(valid)){
   if(from===to)continue;
   const candidate={...valid,[to]:valid[from]};
   assert.throws(()=>requireAccountOtpCompletionKeys(candidate),
    /account_otp_config_unavailable/,
    'reusing a '+from+' secret for '+to+' cannot be accepted');
  }
 }
});
test('account OTP completion rejects hidden/additional environment secrets',()=>{
 const valid=secrets();
 for(const item of [null,{},[],{...valid,other:'secret'},
  {...valid,preauth:valid.preauth+' '}]){
  assert.throws(()=>requireAccountOtpCompletionKeys(item),
   /account_otp_config_unavailable/);
 }
});
test('preflight is a server-only required step before provider dispatch',()=>{
 const source=readFileSync(new URL(
  '../src/lib/account-otp-start-trusted.server.ts',import.meta.url),'utf8');
 assert.match(source,/import 'server-only'/);
 assert.match(source,/requireAccountOtpCompletionKeys/);
 const preflight=source.indexOf('requireAccountOtpCompletionKeys({');
 const start=source.indexOf('return startApprovedAccountOtp({');
 assert.ok(preflight>0&&start>preflight,
  'secret-domain validation must precede the dispatch path');
 for(const env of [
  'SERVICES_WEB_ACCOUNT_OTP_PREAUTH_KEY',
  'SERVICES_WEB_ACCOUNT_OTP_CHALLENGE_KEY',
  'SERVICES_WEB_ACCOUNT_SESSION_KEY',
  'SERVICES_WEB_ACCOUNT_LOGIN_BFF_KEY',
 ]){
  assert.ok(source.includes(env),'missing key validation: '+env);
 }
 assert.doesNotMatch(source,/NextRequest|NextResponse|request\.headers\.get/);
});
