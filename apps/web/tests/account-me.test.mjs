import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {readBackendAccountMe,AccountSessionTransportUnavailable} from '../src/lib/account-session-transport.mjs';
const accountBearer=randomBytes(32).toString('base64url');
const baseUrl='https://api.example.test/v1';
const identity={user_id:randomUUID(),person_id:randomUUID()};
const response=(body=identity,headers={})=>new Response(JSON.stringify(body),{headers:{'content-type':'application/json','cache-control':'private, no-store',...headers}});
test('account identity uses server bearer, no cache and exact response fields',async()=>{
 const result=await readBackendAccountMe({baseUrl,accountBearer,transport:async(url,init)=>{
  assert.equal(url,baseUrl+'/me');assert.equal(init.headers.Authorization,'Bearer '+accountBearer);
  assert.equal(init.cache,'no-store');assert.equal(init.credentials,'omit');return response();
 }});
 assert.deepEqual(result,identity);
});
test('account identity denies invalid data and cache policy',async()=>{
 for(const r of [response({...identity,token:'secret'}),response({...identity,user_id:'bad'}),
  response(identity,{'cache-control':'public, no-store'}),response(identity,{'cache-control':'private'}),
  new Response(null,{status:401}),new Response(null,{status:302})]){
  await assert.rejects(readBackendAccountMe({baseUrl,accountBearer,transport:async()=>r}),AccountSessionTransportUnavailable);
 }
});
test('account home is default-off, revalidates backend and does not render raw IDs',()=>{
 const source=readFileSync(new URL('../src/app/[locale]/account/page.tsx',import.meta.url),'utf8');
 assert.match(source,/SERVICES_WEB_ENABLE_ACCOUNT_HOME/);assert.match(source,/await getAccountWebIdentity/);
 assert.match(source,/catch\{notFound\(\);\}/);assert.doesNotMatch(source,/user_id|person_id|localStorage|sessionStorage/);
});
