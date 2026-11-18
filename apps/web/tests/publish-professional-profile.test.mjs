import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {publishBackendProfessionalProfile,AccountSessionTransportUnavailable} from '../src/lib/account-session-transport.mjs';
const id=randomUUID(),accountBearer=randomBytes(32).toString('base64url');
const options={baseUrl:'https://api.example.test/v1',id,version:3,accountBearer};
const response=(data,status=201,cache='private, no-store')=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':cache}});
test('publish transport sends only empty body, owner proof and strong revision',async()=>{
 assert.equal(await publishBackendProfessionalProfile({...options,transport:async(url,init)=>{
  assert.equal(url,options.baseUrl+'/me/professional-profiles/'+id+'/publish');
  assert.equal(init.method,'POST');assert.equal(init.headers.Authorization,'Bearer '+accountBearer);
  assert.equal(init.headers['If-Match'],'"3"');assert.equal(init.body,'{}');
  assert.equal(init.credentials,'omit');assert.equal(init.redirect,'manual');
  return response({id,version:4,published_version:4,lifecycle_status:'published'});
 }}),'published');
 assert.equal(await publishBackendProfessionalProfile({...options,transport:async()=>response({},409)}),'conflict');
 for(const payload of [{id,version:4,published_version:3,lifecycle_status:'published'},
  {id,version:4,published_version:4,lifecycle_status:'draft'},
  {id,version:4,published_version:4,lifecycle_status:'published',admin:true}]){
  await assert.rejects(publishBackendProfessionalProfile({...options,transport:async()=>response(payload)}),AccountSessionTransportUnavailable);
 }
 await assert.rejects(publishBackendProfessionalProfile({...options,transport:async()=>response({id,version:4,published_version:4,lifecycle_status:'published'},201,'public, no-store')}),AccountSessionTransportUnavailable);
 await assert.rejects(publishBackendProfessionalProfile({...options,version:2147483646,transport:async()=>{throw Error('should not fetch');}}),AccountSessionTransportUnavailable);
});
test('publication BFF is default-off and CSRF-protected; preview gate is separate',()=>{
 const route=readFileSync(new URL('../src/app/api/account/profiles/[id]/publish/route.ts',import.meta.url),'utf8');
 const preview=readFileSync(new URL('../src/app/[locale]/account/profiles/[id]/preview/page.tsx',import.meta.url),'utf8');
 const form=readFileSync(new URL('../src/app/[locale]/account/profiles/PublishProfileButton.tsx',import.meta.url),'utf8');
 assert.match(route,/SERVICES_WEB_ENABLE_PROFESSIONAL_PROFILE_PUBLICATION/);
 assert.ok(route.indexOf('authenticateAccountWebMutation(auth)')<route.indexOf('publishOwnProfessionalProfile('));
 assert.match(route,/bytes>16/);assert.match(route,/body!=='\{\}'/);
 assert.match(preview,/SERVICES_WEB_ENABLE_PROFESSIONAL_PROFILE_PUBLICATION/);
 assert.match(preview,/getOwnProfessionalProfilePreview/);
 assert.match(form,/role="status"/);assert.doesNotMatch(form,/localStorage|sessionStorage|Authorization/);
});
