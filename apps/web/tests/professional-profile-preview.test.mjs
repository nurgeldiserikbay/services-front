import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {readBackendProfessionalProfilePreview,AccountSessionTransportUnavailable} from '../src/lib/account-session-transport.mjs';
const profileId=randomUUID(),profession=randomUUID(),accountBearer=randomBytes(32).toString('base64url');
const payload={id:profileId,slug:'profile',profession_id:profession,lifecycle_status:'published',
 draft:{title:'Private',about:'draft',version:2},published:{title:'Public',about:null,version:1}};
const response=(body,cache='private, no-store')=>new Response(JSON.stringify(body),{headers:{'content-type':'application/json','cache-control':cache}});
test('preview uses server bearer and returns only the scoped projection',async()=>{
 const got=await readBackendProfessionalProfilePreview({baseUrl:'https://api.example.test/v1',accountBearer,profileId,transport:async(url,opts)=>{
  assert.equal(url,'https://api.example.test/v1/me/professional-profiles/'+profileId+'/preview');
  assert.equal(opts.headers.Authorization,'Bearer '+accountBearer);
  assert.equal(opts.cache,'no-store');
  return response(payload);
 }});
 assert.deepEqual(got,payload);
 for(const bad of [{...payload,secret:'bad'},{...payload,draft:{...payload.draft,version:0}},{...payload,published:{...payload.published,version:3}}]){
  await assert.rejects(readBackendProfessionalProfilePreview({baseUrl:'https://api.example.test/v1',accountBearer,profileId,transport:async()=>response(bad)}),AccountSessionTransportUnavailable);
 }
 await assert.rejects(readBackendProfessionalProfilePreview({baseUrl:'https://api.example.test/v1',accountBearer,profileId,transport:async()=>response(payload,'public, no-store')}),AccountSessionTransportUnavailable);
});
test('preview is SSR only and explicitly feature gated',()=>{
 const source=readFileSync(new URL('../src/app/[locale]/account/profiles/[id]/preview/page.tsx',import.meta.url),'utf8');
 assert.match(source,/SERVICES_WEB_ENABLE_PROFESSIONAL_PROFILE_PREVIEW/);
 assert.match(source,/await getOwnProfessionalProfilePreview/);
 assert.match(source,/catch\{notFound\(\);\}/);
 assert.doesNotMatch(source,/use client|localStorage|sessionStorage/);
});
