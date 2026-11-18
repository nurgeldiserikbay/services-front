import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {readBackendAppealableProfileRejection,requestBackendProfessionalProfileAppeal,AccountSessionTransportUnavailable} from '../src/lib/account-session-transport.mjs';
const id=randomUUID(),decisionId=randomUUID(),caseId=randomUUID(),bearer=randomBytes(32).toString('base64url');
const opts={baseUrl:'https://api.example.test/v1',id,accountBearer:bearer};
const response=(value,status=200,cache='private, no-store')=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':cache}});

test('private rejection lookup requires exact owner-visible shape',async()=>{
 assert.deepEqual(await readBackendAppealableProfileRejection({...opts,transport:async(url,init)=>{
  assert.equal(url,opts.baseUrl+'/me/professional-profiles/'+id+'/appealable-rejection');
  assert.equal(init.method,'GET');assert.equal(init.headers.Authorization,'Bearer '+bearer);
  assert.equal(init.credentials,'omit');assert.equal(init.redirect,'manual');
  return response({profile_id:id,profile_version:2,decision_id:decisionId});
 }}),{profile_id:id,profile_version:2,decision_id:decisionId});
 assert.equal(await readBackendAppealableProfileRejection({...opts,transport:async()=>response(null)}),null);
 for(const invalid of [{profile_id:id,profile_version:2,decision_id:decisionId,actor_id:randomUUID()},
  {profile_id:randomUUID(),profile_version:2,decision_id:decisionId},
  {profile_id:id,profile_version:0,decision_id:decisionId},
  {profile_id:id,profile_version:2,decision_id:'invalid'}]){
  await assert.rejects(readBackendAppealableProfileRejection({...opts,transport:async()=>response(invalid)}),AccountSessionTransportUnavailable);
 }
 await assert.rejects(readBackendAppealableProfileRejection({...opts,transport:async()=>response(null,200,'public, no-store')}),AccountSessionTransportUnavailable);
});

test('appeal request binds exact draft version and rejects altered receipts',async()=>{
 const args={...opts,version:2,decisionId};
 assert.equal(await requestBackendProfessionalProfileAppeal({...args,transport:async(url,init)=>{
  assert.equal(url,opts.baseUrl+'/me/professional-profiles/'+id+'/appeals');
  assert.equal(init.method,'POST');assert.equal(init.headers['If-Match'],'"2"');
  assert.deepEqual(JSON.parse(init.body),{decision_id:decisionId});
  assert.equal(init.headers.Authorization,'Bearer '+bearer);
  assert.equal(init.credentials,'omit');assert.equal(init.redirect,'manual');
  return response({case_id:caseId,profile_id:id,profile_version:2,state:'appeal'},201);
 }}),'submitted');
 assert.equal(await requestBackendProfessionalProfileAppeal({...args,transport:async()=>response({},409)}),'conflict');
 for(const bad of [{case_id:caseId,profile_id:id,profile_version:3,state:'appeal'},
  {case_id:caseId,profile_id:id,profile_version:2,state:'closed'},
  {case_id:caseId,profile_id:id,profile_version:2,state:'appeal',actor_id:randomUUID()}]){
  await assert.rejects(requestBackendProfessionalProfileAppeal({...args,transport:async()=>response(bad,201)}),AccountSessionTransportUnavailable);
 }
 await assert.rejects(requestBackendProfessionalProfileAppeal({...args,version:0,transport:async()=>{throw Error('called');}}),AccountSessionTransportUnavailable);
});
test('appeals BFF remains independently gated with CSRF and preview UI',()=>{
 const get=readFileSync(new URL('../src/app/api/account/profiles/[id]/appealable-rejection/route.ts',import.meta.url),'utf8');
 const post=readFileSync(new URL('../src/app/api/account/profiles/[id]/appeals/route.ts',import.meta.url),'utf8');
 const page=readFileSync(new URL('../src/app/[locale]/account/profiles/[id]/preview/page.tsx',import.meta.url),'utf8');
 const form=readFileSync(new URL('../src/app/[locale]/account/profiles/AppealProfileButton.tsx',import.meta.url),'utf8');
 for(const s of [get,post,page])assert.match(s,/SERVICES_WEB_ENABLE_PROFESSIONAL_PROFILE_APPEALS/);
 assert.match(post,/authenticateAccountWebMutation\(auth\)/);
 assert.ok(post.indexOf('authenticateAccountWebMutation(auth)')<post.indexOf('submitOwnProfessionalProfileAppeal('));
 assert.match(post,/bytes>128/);assert.match(post,/request\.headers\.get\('if-match'\)/);
 assert.match(page,/rejection\.profile_version===preview\.draft\.version/);
 assert.match(form,/role="status"/);assert.match(form,/confirmed/);
 assert.doesNotMatch(form,/localStorage|sessionStorage|Authorization/);
});
