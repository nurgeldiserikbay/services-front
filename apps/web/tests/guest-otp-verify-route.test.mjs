import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {parseGuestOtpVerifyBody,readGuestOtpVerifyBody,MAX_OTP_VERIFY_BODY}
  from '../src/lib/guest-otp-verify-route-core.mjs';
import {sealGuestChallenge,openGuestChallenge,verifyGuestChallengeSession}
  from '../src/lib/guest-challenge-session-core.mjs';
import {sealGuestSession,openGuestSession}
  from '../src/lib/guest-session-core.mjs';

const id=randomUUID();
const token=randomBytes(32).toString('base64url');
const valid={challenge_id:id,csrf_token:token,code:'012345'};
function bytes(value){return new TextEncoder().encode(JSON.stringify(value));}
function stream(chunks){
  return new ReadableStream({
    start(controller){
      for(const value of chunks)controller.enqueue(value);
      controller.close();
    },
  });
}

test('strict OTP verify body accepts six digits and only three expected fields',()=>{
  assert.deepEqual(parseGuestOtpVerifyBody(valid),
    {challengeId:id,csrfToken:token,code:'012345'});
  for(const payload of [
    {...valid,code:123456},{...valid,code:'12345'},
    {...valid,code:'1234567'},{...valid,code:'１２３４５６'},
    {...valid,csrf_token:'bad'},{...valid,challenge_id:'wrong'},
    {...valid,request_capability:randomBytes(32).toString('base64url')},
    {...valid,contact:'+77001234567'},
    {...valid,code:'000000',csrf_token:null},
    null,[],{},
  ])assert.throws(()=>parseGuestOtpVerifyBody(payload));
});

test('bounded chunked body reads small requests, rejects huge chunks and invalid UTF-8',async()=>{
  const encoded=bytes(valid);
  const result=await readGuestOtpVerifyBody(stream([
    encoded.subarray(0,5),encoded.subarray(5),
  ]));
  assert.equal(result.code,'012345');
  let cancelled=false;
  const overflow=new ReadableStream({
    pull(controller){controller.enqueue(new Uint8Array(MAX_OTP_VERIFY_BODY+1));},
    cancel(){cancelled=true;},
  });
  await assert.rejects(readGuestOtpVerifyBody(overflow));
  assert.equal(cancelled,true);
  await assert.rejects(readGuestOtpVerifyBody(stream([new Uint8Array([0xff])])));
  await assert.rejects(readGuestOtpVerifyBody(null));
});

test('a cookie only validates its exact challenge ID and matching CSRF',()=>{
  const key=randomBytes(32),challenge=sealGuestChallenge(key,id,600);
  const decoded=openGuestChallenge(key,challenge.cookie);
  assert.equal(verifyGuestChallengeSession(decoded,id,challenge.csrf),true);
  assert.equal(verifyGuestChallengeSession(decoded,randomUUID(),challenge.csrf),false);
  assert.equal(verifyGuestChallengeSession(decoded,id,token),false);
  assert.equal(openGuestChallenge(randomBytes(32),challenge.cookie),null);
  const create=sealGuestSession(
    key,randomBytes(32).toString('base64url'),600,
  );
  assert.equal(openGuestChallenge(key,create.cookie),null);
  assert.equal(openGuestSession(key,challenge.cookie),null);
});

test('verify route is disabled by default and never serializes bearer tokens',()=>{
  const source=readFileSync(new URL(
    '../src/app/api/guest-requests/challenges/verify/route.ts',import.meta.url,
  ),'utf8');
  for(const statement of [
    'SERVICES_WEB_ENABLE_GUEST_OTP_VERIFY_HTTP',
    'SERVICES_WEB_ENABLE_GUEST_OTP_BFF',
    'confirmGuestChallenge',
    'GUEST_CHALLENGE_COOKIE',
    'readGuestOtpVerifyBody(request.body)',
    "request.headers.get('origin')",
    "request.headers.get('sec-fetch-site')",
    'result.setCookie.name',
    'result.clearCookie.name',
    'csrf_token:result.csrf',
    'private, no-store',
    'noindex, nofollow',
    'Referrer-Policy',
  ])assert.ok(source.includes(statement),statement);
  assert.doesNotMatch(source,/NextResponse\.json\(result\)/);
  assert.doesNotMatch(source,/createCapability|guest_capability|Guest-Capability/);
  assert.doesNotMatch(source,/status:201/);
  const page=readFileSync(new URL(
    '../src/app/[locale]/services/[id]/page.tsx',import.meta.url,
  ),'utf8');
  assert.doesNotMatch(page,/confirmGuestChallenge|GuestOtpStep/);
});
