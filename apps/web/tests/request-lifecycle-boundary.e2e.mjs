import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';

// Live HTTP negative-path checks against the pinned PostgreSQL-backed backend.
// These are safe even when the guest / seller workflows remain default off.
const api='http://127.0.0.1:3101/v1';
const id='10000000-0000-4000-8000-000000000099';
const forgedBearer='Bearer '+randomBytes(32).toString('base64url');
const checks=[
 {label:'guest status without proof',url:`${api}/requests/${id}`,init:{method:'GET'},allowed:[404]},
 {label:'seller inbox without session',url:`${api}/me/seller-requests`,init:{method:'GET'},allowed:[401]},
 {label:'accept without seller session',url:`${api}/requests/${id}/accept`,init:{method:'POST'},allowed:[401]},
 {label:'decline without seller session',url:`${api}/requests/${id}/decline`,init:{method:'POST'},allowed:[401]},
 {label:'seller inbox with forged bearer',url:`${api}/me/seller-requests`,init:{method:'GET',headers:{Authorization:forgedBearer}},allowed:[401]},
 {label:'accept with forged bearer',url:`${api}/requests/${id}/accept`,init:{method:'POST',headers:{Authorization:forgedBearer,'If-Match':'"1"','Idempotency-Key':randomBytes(16).toString('hex')}},allowed:[401]},
 {label:'accept with weak version precondition',url:`${api}/requests/${id}/accept`,init:{method:'POST',headers:{Authorization:forgedBearer,'If-Match':'W/"1"','Idempotency-Key':randomBytes(16).toString('hex')}},allowed:[400]},
 {label:'decline with missing idempotency key',url:`${api}/requests/${id}/decline`,init:{method:'POST',headers:{Authorization:forgedBearer,'If-Match':'"1"'}},allowed:[400]},
 {label:'accept with malformed version',url:`${api}/requests/${id}/accept`,init:{method:'POST',headers:{Authorization:forgedBearer,'If-Match':'not-a-version','Idempotency-Key':randomBytes(16).toString('hex')}},allowed:[400]},
 {label:'decline with malformed idempotency key',url:`${api}/requests/${id}/decline`,init:{method:'POST',headers:{Authorization:forgedBearer,'If-Match':'"1"','Idempotency-Key':'invalid key with spaces'}},allowed:[400]},
 {label:'decline with forged bearer',url:`${api}/requests/${id}/decline`,init:{method:'POST',headers:{Authorization:forgedBearer,'If-Match':'"1"','Idempotency-Key':randomBytes(16).toString('hex')}},allowed:[401]},
];
for(const check of checks){
 const response=await fetch(check.url,{
  ...check.init,
  redirect:'manual',
  signal:AbortSignal.timeout(5000),
 });
 assert.ok(check.allowed.includes(response.status),
  `${check.label}: expected ${check.allowed.join(' / ')}, received ${response.status}`);
 assert.match(response.headers.get('cache-control')??'',/\bno-store\b/i,
  `${check.label}: private request response may not be cached`);
 const body=await response.text();
 assert.ok(!body.includes('platform_admin_sessions'),'private admin schema must not leak');
 assert.ok(!body.includes('secret_not_configured') && !body.includes('DATABASE_URL') &&
  !body.includes('ACCOUNT_SESSION_HMAC_KEY') && !body.includes('node_modules/'),
  `${check.label}: internal configuration or stack trace must not leak`);
 assert.ok(!body.includes(forgedBearer.slice(7)),'forged bearer must never be echoed');
}
console.log('Pinned backend guest and seller HTTP boundaries deny anonymous requests');
