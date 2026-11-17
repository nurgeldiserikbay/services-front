import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {
 listBackendAccountSessions,revokeBackendAccountSession,revokeBackendAccountSessionById,
 AccountSessionTransportUnavailable,
} from '../src/lib/account-session-transport.mjs';
const bearer=randomBytes(32).toString('base64url');
const baseUrl='https://api.example.test/v1';
const src=path=>readFileSync(new URL('../src/'+path,import.meta.url),'utf8');
const validRow={
 id:randomUUID(),deviceLabel:'Phone',lastUsedAt:null,
 expiresAt:new Date(Date.now()+3600000).toISOString(),current:true,
};

test('account inventory transport is bearer-only and does not leak secrets',async()=>{
 let called=0;
 const transport=async(url,init)=>{
  called++;
  assert.equal(url,'https://api.example.test/v1/auth/sessions');
  assert.equal(init.method,'GET');
  assert.equal(init.headers.Authorization,'Bearer '+bearer);
  assert.equal(init.credentials,'omit');
  assert.equal(init.cache,'no-store');
  return new Response(JSON.stringify({items:[validRow]}),{
   status:200,headers:{'content-type':'application/json'},
  });
 };
 assert.deepEqual(await listBackendAccountSessions({
  baseUrl,accountBearer:bearer,transport,
 }),{items:[validRow]});
 assert.equal(called,1);
 await assert.rejects(listBackendAccountSessions({
  baseUrl,accountBearer:'bad',transport,
 }),AccountSessionTransportUnavailable);
 await assert.rejects(listBackendAccountSessions({
  baseUrl:'http://insecure.test/v1',accountBearer:bearer,transport,
 }),AccountSessionTransportUnavailable);
 assert.equal(called,1);
});

test('account session transports reject ambiguous server URL before sending bearer',async()=>{
 let calls=0;
 const transport=async()=>{calls++;return new Response(null,{status:204});};
 for(const unsafe of [
  'https://api.example.test/v1/%2e%2e/private',
  'https://api.example.test/v1/%61',
  'https://api.example.test/v1//nested',
  'https://api.example.test/v1\\nested',
  'https://api.example.test/v1/./nested',
  'https://api.example.test/v1/a.b',
  'https://api.example.test/v1?token=secret',
 ]){
  for(const operation of [
   ()=>listBackendAccountSessions({baseUrl:unsafe,accountBearer:bearer,transport}),
   ()=>revokeBackendAccountSession({baseUrl:unsafe,accountBearer:bearer,transport}),
   ()=>revokeBackendAccountSessionById({baseUrl:unsafe,accountBearer:bearer,
    sessionId:validRow.id,transport}),
  ])await assert.rejects(operation(),AccountSessionTransportUnavailable);
 }
 assert.equal(calls,0,'invalid URL configuration must never transmit backend bearer');
});

test('session inventory validates strict whitelist, size and JSON response',async()=>{
 for(const payload of [
  {items:[{...validRow,tokenHash:'secret'}]},
  {items:[{...validRow,id:'bad'}]},
  {items:Array(51).fill(validRow)},
  {items:[{...validRow,current:'yes'}]},
  {items:[{...validRow,deviceLabel:'x'.repeat(121)}]},
  {items:[validRow,{...validRow,current:false}]},
  {items:[{...validRow,expiresAt:'2026-02-30T12:00:00.000Z'}]},
  {items:[{...validRow,expiresAt:'2026-11-17T24:00:00.000Z'}]},
  {items:[{...validRow,lastUsedAt:'2026-02-30T12:00:00.000Z'}]},
  {items:[{...validRow,expiresAt:'2026-11-17T12:00:00Z'}]},
  {other:[]},
 ]){
  await assert.rejects(listBackendAccountSessions({
   baseUrl,accountBearer:bearer,
   transport:async()=>new Response(JSON.stringify(payload),{
    status:200,headers:{'content-type':'application/json'},
   }),
  }),AccountSessionTransportUnavailable);
 }
 await assert.rejects(listBackendAccountSessions({
  baseUrl,accountBearer:bearer,
  transport:async()=>new Response('x'.repeat(20000),{
    status:200,headers:{'content-type':'application/json'},
  }),
 }),AccountSessionTransportUnavailable);
});

test('session inventory cancels oversized streamed data before consuming the full response',async()=>{
 let produced=0;
 let cancelled=false;
 const stream=new ReadableStream({
  pull(controller){
   produced++;
   controller.enqueue(new Uint8Array(8192).fill(120));
  },
  cancel(){cancelled=true;},
 });
 await assert.rejects(listBackendAccountSessions({
  baseUrl,accountBearer:bearer,
  transport:async()=>new Response(stream,{status:200,headers:{'content-type':'application/json'}}),
 }),AccountSessionTransportUnavailable);
 assert.equal(cancelled,true,'oversized upstream response must be cancelled');
 assert.ok(produced<=4,'must not read the entire unbounded upstream body');
});

test('session inventory accepts valid JSON with multibyte UTF-8 split across chunks',async()=>{
 const payload=JSON.stringify({items:[{...validRow,deviceLabel:'Құрылғы'}]});
 const bytes=new TextEncoder().encode(payload);
 const chunks=Array.from(bytes,byte=>new Uint8Array([byte]));
 const stream=new ReadableStream({
  pull(controller){
   if(chunks.length)controller.enqueue(chunks.shift());
   else controller.close();
  },
 });
 const result=await listBackendAccountSessions({
  baseUrl,accountBearer:bearer,
  transport:async()=>new Response(stream,{status:200,headers:{'content-type':'application/json'}}),
 });
 assert.equal(result.items[0].deviceLabel,'Құрылғы');
});

test('logout transport accepts 204 only, never a redirect or JSON success',async()=>{
 let called=0;
 assert.equal(await revokeBackendAccountSession({
  baseUrl,accountBearer:bearer,transport:async(url,init)=>{
   called++;
   assert.equal(url,'https://api.example.test/v1/auth/logout');
   assert.equal(init.method,'POST');
   assert.equal(init.headers.Authorization,'Bearer '+bearer);
   assert.equal(init.credentials,'omit');
   return new Response(null,{status:204});
  },
 }),true);
 assert.equal(called,1);
 for(const status of [200,301,401,403,500]){
  await assert.rejects(revokeBackendAccountSession({
   baseUrl,accountBearer:bearer,
   transport:async()=>new Response('failure',{status}),
  }),AccountSessionTransportUnavailable);
 }
});

test('account BFF routes are server-only default-off and never accept browser bearer',()=>{
 const inventory=src('app/api/account/sessions/route.ts');
 const logout=src('app/api/account/logout/route.ts');
 const server=src('lib/account-session-bff.server.ts');
 for(const route of [inventory,logout]){
  assert.match(route,/SERVICES_WEB_ENABLE_ACCOUNT_SESSION_BFF/);
  assert.match(route,/noindex, nofollow/);
  assert.match(route,/private, no-store/);
  assert.doesNotMatch(route,/headers\.get\('authorization'\)|localStorage|sessionStorage/i);
 }
 assert.match(inventory,/sellerBffSameOrigin/);
 assert.match(inventory,/getAccountWebSessions/);
 assert.match(logout,/authenticateAccountWebMutation/);
 assert.match(logout,/clearAccountWebSession/);
 assert.match(logout,/response\.cookies\.set\(cleared\.name,cleared\.value,cleared\.options\)/,
  'Next.js cookie setter must receive expiration, HttpOnly and Secure options');
 assert.doesNotMatch(logout,/response\.cookies\.set\(clearAccountWebSession\(\)\)/);

 assert.match(server,/import 'server-only'/);
 assert.match(server,/revokeBackendAccountSession/);
 assert.match(server,/listBackendAccountSessions/);
});
