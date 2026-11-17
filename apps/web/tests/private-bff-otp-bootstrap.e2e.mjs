import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';

// Isolated feature-enabled Next.js instance, with no provider, network
// attestation signer, or ability to deliver a real OTP to a user.
const base=process.env.PRIVATE_BFF_TEST_BASE_URL??'http://127.0.0.1:3001';
const path='/api/guest-requests/challenges/start';
const url=new URL(path,base);
const headers={'Sec-Fetch-Site':'same-origin'};
const response=await fetch(url,{headers,redirect:'manual',signal:AbortSignal.timeout(8000)});
assert.equal(response.status,200,'enabled bootstrap must issue a CSRF synchronizer');
for(const [name,pattern] of [
 ['cache-control',/no-store/i],['x-robots-tag',/noindex/i],
 ['referrer-policy',/no-referrer/i],['content-type',/application\/json/i],
])assert.match(response.headers.get(name)??'',pattern);
const payload=await response.json();
assert.deepEqual(Object.keys(payload).sort(),['csrf_token','expires_in']);
assert.match(payload.csrf_token,/^[A-Za-z0-9_-]{43}$/);
assert.equal(payload.expires_in,300);
const setCookie=response.headers.get('set-cookie')??'';
assert.match(setCookie,/__Host-services_guest_otp_init=/);
assert.match(setCookie,/httponly/i);
assert.match(setCookie,/secure/i);
assert.match(setCookie,/samesite=strict/i);
assert.ok(!setCookie.includes(payload.csrf_token),'cookie must not contain plaintext CSRF');
assert.doesNotMatch(setCookie,/guest_challenge|guest_create|guest_request/);
const browserCookie=setCookie.split(';',1)[0];
async function attempt(csrfToken,cookie,fetchSite='same-origin'){
 const request=await fetch(url,{
  method:'POST',redirect:'manual',signal:AbortSignal.timeout(8000),
  headers:{
   'Sec-Fetch-Site':fetchSite,
   'Origin':'https://services.example.test',
   'Content-Type':'application/json',
   ...(cookie?{'Cookie':cookie}:{}),
  },
  body:JSON.stringify({
   channel:'email',contact:'guest-ci-'+randomUUID()+'@example.test',
   locale:'kk',csrf_token:csrfToken,
  }),
 });
 assert.equal(request.status,503,'unavailable provider must never issue an OTP');
 assert.match(request.headers.get('cache-control')??'',/no-store/i);
 assert.equal(request.headers.get('set-cookie'),null,'denial cannot issue challenge cookie');
 const failure=await request.json();
 assert.deepEqual(failure,{code:'UNAVAILABLE',message:'OTP temporarily unavailable'});
 assert.ok(!JSON.stringify(failure).includes(csrfToken));
}
await attempt(payload.csrf_token,browserCookie);
await attempt(randomBytes(32).toString('base64url'),browserCookie);
await attempt(payload.csrf_token,'');
await attempt(payload.csrf_token,browserCookie,'cross-site');
const crossSite=await fetch(url,{
 headers:{'Sec-Fetch-Site':'cross-site'},redirect:'manual',
 signal:AbortSignal.timeout(8000),
});
assert.equal(crossSite.status,503,'cross-site bootstrap must fail closed');
assert.equal(crossSite.headers.get('set-cookie'),null);
const verify=await fetch(new URL('/api/guest-requests/challenges/verify',base),{
 method:'POST',redirect:'manual',signal:AbortSignal.timeout(8000),
 headers:{...headers,'Origin':'https://services.example.test','Content-Type':'application/json'},
 body:'{}',
});
assert.equal(verify.status,404,'OTP verification remains separately disabled');
assert.equal(verify.headers.get('set-cookie'),null);
const create=await fetch(new URL('/api/guest-requests',base),{
 method:'POST',redirect:'manual',signal:AbortSignal.timeout(8000),
 headers:{...headers,'Origin':'https://services.example.test','Content-Type':'application/json'},
 body:'{}',
});
assert.equal(create.status,404,'guest create remains separately disabled');
console.log('Live OTP CSRF bootstrap works, no provider tokens leak, verify/create gates remain disabled');
