import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {listBackendProfessionalProfiles,AccountSessionTransportUnavailable} from '../src/lib/account-session-transport.mjs';
const baseUrl='https://api.example.test/v1',accountBearer=randomBytes(32).toString('base64url');
const row={id:randomUUID(),profession_id:randomUUID(),lifecycle_status:'draft',slug:'draft',title:null,about:null,version:1,offers:[]};
const res=(body,cache='private, no-store')=>new Response(JSON.stringify(body),{headers:{'content-type':'application/json','cache-control':cache}});
test('owner profile transport is bearer scoped and validates exact response',async()=>{
 assert.deepEqual(await listBackendProfessionalProfiles({baseUrl,accountBearer,transport:async(url,init)=>{
  assert.equal(url,baseUrl+'/me/professional-profiles');assert.equal(init.headers.Authorization,'Bearer '+accountBearer);
  assert.equal(init.cache,'no-store');return res([row]);
 }}),[row]);
 for(const payload of [[{...row,secret:'x'}],[{...row,version:0}],[row,row],[{...row,lifecycle_status:'unknown'}]]){
  await assert.rejects(listBackendProfessionalProfiles({baseUrl,accountBearer,transport:async()=>res(payload)}),AccountSessionTransportUnavailable);
 }
 await assert.rejects(listBackendProfessionalProfiles({baseUrl,accountBearer,transport:async()=>res([row],'public, no-store')}),AccountSessionTransportUnavailable);
});
test('profile page requires live owner fetch and feature gates',()=>{
 const source=readFileSync(new URL('../src/app/[locale]/account/profiles/page.tsx',import.meta.url),'utf8');
 assert.match(source,/SERVICES_WEB_ENABLE_PROFESSIONAL_PROFILES/);assert.match(source,/await getOwnProfessionalProfiles/);
 assert.match(source,/catch\{notFound\(\);\}/);assert.doesNotMatch(source,/localStorage|sessionStorage/);
});
