import assert from 'node:assert/strict';

// Live HTTP negative-path checks against the pinned PostgreSQL-backed backend.
// These are safe even when the guest / seller workflows remain default off.
const api='http://127.0.0.1:3101/v1';
const id='10000000-0000-4000-8000-000000000099';
const checks=[
 {label:'guest status without proof',url:`${api}/requests/${id}`,init:{method:'GET'},allowed:[404]},
 {label:'seller inbox without session',url:`${api}/me/seller-requests`,init:{method:'GET'},allowed:[401]},
 {label:'accept without seller session',url:`${api}/requests/${id}/accept`,init:{method:'POST'},allowed:[401]},
 {label:'decline without seller session',url:`${api}/requests/${id}/decline`,init:{method:'POST'},allowed:[401]},
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
 assert.ok(!(await response.text()).includes('platform_admin_sessions'));
}
console.log('Pinned backend guest and seller HTTP boundaries deny anonymous requests');
