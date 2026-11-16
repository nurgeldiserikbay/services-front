import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';

// Run against a separate production Next.js instance with private flags
// deliberately enabled but WITHOUT a trusted login or guest capability.
// Authentication must still fail closed. No real user or staging credentials.
const base=process.env.PRIVATE_BFF_TEST_BASE_URL??'http://127.0.0.1:3001';
const id=randomUUID();
const csrf=randomBytes(32).toString('base64url');
const forged=randomBytes(24).toString('base64url');
const fakeCookies=[
  '',
  '__Host-services_account_web='+forged+'; __Host-services_guest_request='+forged,
];
const checks=[
 {label:'guest status without request proof',path:`/api/guest-requests/${id}/status`,method:'GET',status:404,code:'NOT_FOUND'},
 {label:'seller inbox without account session',path:'/api/seller/requests',method:'GET',status:401,code:'AUTH_REQUIRED'},
 {label:'seller accept without account session',path:`/api/seller/requests/${id}/accept`,method:'POST',status:401,code:'AUTH_REQUIRED'},
 {label:'seller decline without account session',path:`/api/seller/requests/${id}/decline`,method:'POST',status:401,code:'AUTH_REQUIRED'},
];
for(const check of checks){
 for(const cookie of fakeCookies){
  const payload={version:1,csrf_token:csrf,idempotency_key:randomUUID()};
  const response=await fetch(new URL(check.path,base),{
   method:check.method,redirect:'manual',signal:AbortSignal.timeout(8000),
   headers:{
    'Sec-Fetch-Site':'same-origin',
    ...(cookie?{Cookie:cookie}:{}),
    ...(check.method==='POST'?{
      'Origin':'https://services.example.test',
      'Content-Type':'application/json',
    }:{}),
   },
   ...(check.method==='POST'?{body:JSON.stringify(payload)}:{}),
  });
  assert.equal(response.status,check.status,check.label+' must fail without a trusted session');
  assert.match(response.headers.get('cache-control')??'',/\bno-store\b/i);
  assert.match(response.headers.get('x-robots-tag')??'',/\bnoindex\b/i);
  assert.match(response.headers.get('referrer-policy')??'',/\bno-referrer\b/i);
  assert.equal(response.headers.get('set-cookie'),null,'denied request must not issue a cookie');
  const body=await response.text();
  assert.ok(body.length<1024,'private error must remain bounded');
  const json=JSON.parse(body);
  assert.equal(json.code,check.code);
  assert.ok(!body.includes(forged)&&!body.includes(csrf),'credentials must not echo');
 }
}
// Cross-site intent is rejected independently of forged credentials.
for(const path of ['/api/seller/requests',
 `/api/guest-requests/${id}/status`]){
 const response=await fetch(new URL(path,base),{
  headers:{'Sec-Fetch-Site':'cross-site'},redirect:'manual',
  signal:AbortSignal.timeout(8000),
 });
 assert.equal(response.status,404,'cross-site private reads must remain unavailable');
 assert.match(response.headers.get('cache-control')??'',/no-store/i);
}
console.log('Enabled private BFF routes still reject missing, forged and cross-site proofs');
