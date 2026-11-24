import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';

const base=process.env.PRIVATE_BFF_TEST_BASE_URL??'http://127.0.0.1:3001';
const endpoint=new URL('/api/account/otp/bootstrap',base);
const options={redirect:'manual',signal:AbortSignal.timeout(8000)};

function request(url,headers={},extra={}){
 return fetch(url,{...options,headers,...extra});
}
function assertPrivate(response){
 assert.match(response.headers.get('cache-control')??'',/no-store/i);
 assert.match(response.headers.get('x-robots-tag')??'',/noindex/i);
 assert.match(response.headers.get('referrer-policy')??'',/no-referrer/i);
 assert.equal(response.headers.get('access-control-allow-origin'),null,
  'OTP bootstrap must not authorize arbitrary cross-origin browser access');
}
for(const [scenario,headers] of [
 ['cross-site',{'Sec-Fetch-Site':'cross-site'}],
 ['same-site not same-origin',{'Sec-Fetch-Site':'same-site'}],
 ['missing fetch metadata',{}],
 ['foreign Origin',{'Sec-Fetch-Site':'same-origin',
  Origin:'https://attacker.example.test'}],
]){
 const response=await request(endpoint,headers);
 assert.equal(response.status,404,scenario+' must not bootstrap account OTP');
 assertPrivate(response);
 assert.equal(response.headers.get('set-cookie'),null,
  scenario+' must not issue a preauth cookie');
 assert.deepEqual(await response.json(),{code:'UNAVAILABLE'});
}
const invalidQuery=await request(new URL('/api/account/otp/bootstrap?code=1',base),
 {'Sec-Fetch-Site':'same-origin'});
assert.equal(invalidQuery.status,400,'OTP bootstrap must not accept query parameters');
assertPrivate(invalidQuery);
assert.equal(invalidQuery.headers.get('set-cookie'),null);

const valid=await request(endpoint,{'Sec-Fetch-Site':'same-origin'});
assert.equal(valid.status,200,'same-origin browser bootstrap must issue short preauth');
assertPrivate(valid);
assert.match(valid.headers.get('content-type')??'',/application\/json/i);
const data=await valid.json();
assert.deepEqual(Object.keys(data).sort(),['csrf_token','expires_in_seconds']);
assert.match(data.csrf_token,/^[A-Za-z0-9_-]{43}$/);
assert.equal(data.expires_in_seconds,300);
const setCookie=valid.headers.get('set-cookie')??'';
assert.match(setCookie,/__Host-services_account_otp_preauth=/);
assert.match(setCookie,/HttpOnly/i);
assert.match(setCookie,/Secure/i);
assert.match(setCookie,/SameSite=Strict/i);
assert.match(setCookie,/Max-Age=300/i);
assert.ok(!setCookie.includes(data.csrf_token),
 'CSRF value must not be exposed within encrypted preauth cookie');
assert.doesNotMatch(setCookie,/__Host-services_account_web=/,
 'preauth must never mint an authenticated account session');
assert.doesNotMatch(JSON.stringify(data),/challenge_id|session_token|account_bearer/i);
const cookie=setCookie.split(';',1)[0];
assert.match(cookie,/^__Host-services_account_otp_preauth=v1\./);

const second=await request(endpoint,{'Sec-Fetch-Site':'same-origin'});
assert.equal(second.status,200,'each bootstrap has an independent CSRF nonce');
const secondBody=await second.json();
assert.notEqual(secondBody.csrf_token,data.csrf_token);
assert.notEqual((second.headers.get('set-cookie')??'').split(';',1)[0],cookie);

const verify=await request(new URL('/api/account/otp/verify',base),{
 'Sec-Fetch-Site':'same-origin',
 Origin:'https://services.example.test',
 Cookie:cookie,'Content-Type':'application/json',
},{method:'POST',body:JSON.stringify({
 challenge_id:'10000000-0000-4000-8000-000000000001',
 channel:'EMAIL',code:'123456',
 csrf_token:data.csrf_token,
})});
assert.equal(verify.status,404,
 'OTP verification must remain independently DISABLED without a delivered challenge');
assertPrivate(verify);
assert.equal(verify.headers.get('set-cookie'),null,
 'no verification challenge or authenticated cookie may be issued');
assert.deepEqual(await verify.json(),{code:'UNAVAILABLE'});

const crossSiteVerify=await request(new URL('/api/account/otp/verify',base),{
 'Sec-Fetch-Site':'cross-site',Origin:'https://attacker.example.test',
 Cookie:cookie,'Content-Type':'application/json',
},{method:'POST',body:'{}'});
assert.equal(crossSiteVerify.status,404);
assert.equal(crossSiteVerify.headers.get('set-cookie'),null);

const freshCookieOnly=await request(new URL('/api/account/sessions',base),{
 'Sec-Fetch-Site':'same-origin',Cookie:cookie,
});
assert.notEqual(freshCookieOnly.status,200,
 'preauth cookie alone must never authorize private account inventory');
assertPrivate(freshCookieOnly);
assert.equal(freshCookieOnly.headers.get('set-cookie'),null);

console.log('Live account OTP preauth: same-origin, sealed CSRF, no challenge/session issuance, gated verify PASS');
