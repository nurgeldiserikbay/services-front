import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {
  sealOtpInitiation,openOtpInitiation,verifyOtpInitiation,
  OTP_INIT_TTL_SECONDS,
} from '../src/lib/guest-otp-init-core.mjs';
import {sealGuestChallenge,openGuestChallenge}
  from '../src/lib/guest-challenge-session-core.mjs';
import {validateOtpStartInput,readOtpStartBody,MAX_OTP_START_BODY_BYTES}
  from '../src/lib/guest-otp-start-core.mjs';

const csrf=randomBytes(32).toString('base64url');
const valid={channel:'sms',contact:'+77001234567',locale:'kk',csrf_token:csrf};
const toBytes=x=>new TextEncoder().encode(JSON.stringify(x));

test('initial OTP CSRF is sealed, time-bound and cannot become a challenge session',()=>{
  const key=randomBytes(32),now=Date.parse('2026-11-04T11:00:00Z');
  const init=sealOtpInitiation(key,now);
  assert.equal(init.cookie.includes(init.csrf),false);
  assert.equal(OTP_INIT_TTL_SECONDS,300);
  const decoded=openOtpInitiation(key,init.cookie,now);
  assert.equal(verifyOtpInitiation(decoded,init.csrf),true);
  assert.equal(verifyOtpInitiation(decoded,csrf),false);
  assert.equal(openOtpInitiation(key,init.cookie,now+300000),null);
  assert.equal(openOtpInitiation(randomBytes(32),init.cookie,now),null);
  assert.equal(openGuestChallenge(key,init.cookie,now),null);
  const challenge=sealGuestChallenge(key,randomUUID(),300,now);
  assert.equal(openOtpInitiation(key,challenge.cookie,now),null);
  const fields=init.cookie.split('.');
  fields[2]=(fields[2][0]==='A'?'B':'A')+fields[2].slice(1);
  const broken=fields.join('.');
  assert.equal(openOtpInitiation(key,broken,now),null);
});
test('OTP start parser rejects injection, invalid destination and huge chunked input',async()=>{
  assert.deepEqual(validateOtpStartInput(valid),
    {channel:'sms',contact:'+77001234567',locale:'kk',csrfToken:csrf});
  for(const payload of [
    {...valid,csrf_token:'bad'},{...valid,contact:'87001234567'},
    {...valid,contact:'203.0.113.10'},{...valid,locale:'en'},
    {...valid,channel:'push'},{...valid,network_proof:'forged'},
    {...valid,contact:'+'+'1'.repeat(400)},null,{},[],
  ])assert.throws(()=>validateOtpStartInput(payload));
  const msg=toBytes(valid);
  const good=new ReadableStream({start(c){
    c.enqueue(msg.subarray(0,6));c.enqueue(msg.subarray(6));c.close();
  }});
  assert.deepEqual(await readOtpStartBody(good),
    validateOtpStartInput(valid));
  let cancelled=false;
  const flood=new ReadableStream({
    pull(c){c.enqueue(new Uint8Array(MAX_OTP_START_BODY_BYTES+1));},
    cancel(){cancelled=true;},
  });
  await assert.rejects(readOtpStartBody(flood));
  assert.equal(cancelled,true);
  await assert.rejects(readOtpStartBody(null));
  await assert.rejects(readOtpStartBody(
    new ReadableStream({start(c){c.enqueue(new Uint8Array([255]));c.close();}})));
});
test('route stays disabled by default and never signs trusted network proof',()=>{
  const route=readFileSync(new URL(
    '../src/app/api/guest-requests/challenges/start/route.ts',import.meta.url,
  ),'utf8');
  for(const phrase of [
    'SERVICES_WEB_ENABLE_GUEST_OTP_START_HTTP',
    'SERVICES_WEB_ENABLE_GUEST_OTP_BFF',
    'requireGuestOtpOrigin',
    'authorizeOtpInitiation',
    'readOtpStartBody(request.body)',
    'startGuestChallenge',
    'clearOtpInitiation',
    'private, no-store',
    'noindex, nofollow',
    'response.cookies.set',
  ])assert.ok(route.includes(phrase),phrase);
  assert.doesNotMatch(route,/X-Forwarded-For|X-Real-IP|signTrustedNetworkProof|GUEST_NETWORK_ATTESTATION_KEY/);
  assert.doesNotMatch(route,/return NextResponse\.json\(started\)/);
  const bff=readFileSync(new URL('../src/lib/guest-otp-backend.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(bff,/X-Services-Network-Proof/);
});
