import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {revokeBackendAccountSessionById,AccountSessionTransportUnavailable}
 from '../src/lib/account-session-transport.mjs';

const bearer='A'.repeat(43);
const sessionId='a59e3b8b-72ae-4ed8-91f9-51484d5f8cf0';
const baseUrl='https://api.example.test/v1';
const source=path=>readFileSync(new URL('../src/'+path,import.meta.url),'utf8');
test('remote revoke uses bearer solely on server, explicit DELETE and no redirects',async()=>{
 let called=0;
 assert.equal(await revokeBackendAccountSessionById({
  baseUrl,accountBearer:bearer,sessionId,
  transport:async(url,init)=>{
   called++;
   assert.equal(url,baseUrl+'/auth/sessions/'+sessionId);
   assert.equal(init.method,'DELETE');
   assert.equal(init.headers.Authorization,'Bearer '+bearer);
   assert.equal(init.credentials,'omit');
   assert.equal(init.cache,'no-store');
   assert.equal(init.redirect,'manual');
   return new Response(null,{status:204});
  },
 }),true);
 assert.equal(called,1);
});
test('remote revoke denies malformed IDs, bad bearer, insecure production URL, redirects and errors',async()=>{
 for(const input of [
  {sessionId:'bad',accountBearer:bearer,baseUrl},
  {sessionId,accountBearer:'bad',baseUrl},
  {sessionId,accountBearer:bearer,baseUrl:'http://api.example.test/v1'},
 ]){
  await assert.rejects(revokeBackendAccountSessionById({
   ...input,transport:async()=>{throw Error('should not call');},
  }),AccountSessionTransportUnavailable);
 }
 for(const status of [200,301,401,403,404,409,503]){
  await assert.rejects(revokeBackendAccountSessionById({
   baseUrl,accountBearer:bearer,sessionId,
   transport:async()=>new Response(null,{status}),
  }),AccountSessionTransportUnavailable);
 }
});
test('remote session BFF keeps CSRF, cookies, ownership and current-session guard',()=>{
 const route=source('app/api/account/sessions/[id]/route.ts');
 const service=source('lib/account-session-bff.server.ts');
 for(const expected of ['SERVICES_WEB_ENABLE_ACCOUNT_SESSION_BFF',
  'sellerBffSameOrigin','authenticateAccountWebMutation',
  'x-services-csrf','revokeOtherAccountWebSession','private, no-store']){
  assert.ok(route.includes(expected),expected);
 }
 assert.match(route,/result==='current'/);
 assert.match(service,/target\.current/);
 assert.match(service,/inventory\.items\.find/);
 assert.match(service,/revokeBackendAccountSessionById/);
 assert.match(service,/authenticateAccountWebMutation/);
 assert.doesNotMatch(route,/headers\.get\('authorization'\)|localStorage|sessionStorage/i);
 assert.doesNotMatch(route,/clearAccountWebSession/);
});
