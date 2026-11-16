import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';

// Live production-Next.js checks; CI leaves all private rollout switches off.
// This verifies the *frontend BFF* response, not just the backend's ACL.
const base=process.env.WEB_BASE_URL??'http://127.0.0.1:3000';
const id=randomUUID();
const fakeCookie='account_session='+randomBytes(24).toString('base64url');
const cases=[
  {label:'guest status',path:`/api/guest-requests/${id}/status`,method:'GET'},
  {label:'guest OTP bootstrap',path:'/api/guest-requests/challenges/start',method:'GET'},
  {label:'guest OTP start',path:'/api/guest-requests/challenges/start',method:'POST'},
  {label:'seller inbox',path:'/api/seller/requests?limit=30',method:'GET'},
  {label:'seller accept',path:`/api/seller/requests/${id}/accept`,method:'POST'},
  {label:'seller decline',path:`/api/seller/requests/${id}/decline`,method:'POST'},
  {label:'account notifications',path:'/api/account/notifications',method:'GET'},
];
for(const check of cases){
  // A forged client cookie must not bypass disabled private routes. A second
  // request without cookies ensures denial does not depend on malformed proof.
  for(const withCookie of [false,true]){
    const response=await fetch(new URL(check.path,base),{
      method:check.method,
      headers:{
        'Sec-Fetch-Site':'same-origin',
        ...(withCookie?{Cookie:fakeCookie}:{}),
        ...(check.method==='POST'?{'Content-Type':'application/json'}:{}),
      },
      ...(check.method==='POST'?{body:'{}'}:{}),
      redirect:'manual',
      signal:AbortSignal.timeout(8000),
    });
    assert.equal(response.status,404,`${check.label} must remain default-off`);
    assert.match(response.headers.get('cache-control')??'',/\bno-store\b/i,
      `${check.label} must not be cached`);
    assert.match(response.headers.get('x-robots-tag')??'',/\bnoindex\b/i,
      `${check.label} must not be indexed`);
    assert.match(response.headers.get('referrer-policy')??'',/\bno-referrer\b/i,
      `${check.label} must not leak its private URL via referrers`);
    assert.match(response.headers.get('content-type')??'',/application\/json/i,
      `${check.label} must respond with a sanitized JSON error`);
    const text=await response.text();
    assert.ok(text.length<=2048,`${check.label} must not expose a detailed error`);
    const payload=JSON.parse(text);
    assert.deepEqual(Object.keys(payload).sort(),
      check.label==='guest status'?['code','message']:['code','message'].filter(
        key=>key==='code'||check.label==='guest OTP bootstrap'||check.label==='guest OTP start'));
    assert.doesNotMatch(text,/request_capability|csrf_token|idempotency_key|DATABASE_URL|node_modules|stack|Bearer /i);
    assert.ok(!text.includes(fakeCookie),'cookie must not be reflected');
    assert.equal(response.headers.get('set-cookie'),null,
      `${check.label} must not issue cookies when disabled`);
  }
}
console.log('Production Next.js private BFF feature gates fail closed over real HTTP');
