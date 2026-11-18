import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {updateBackendProfessionalProfile,validProfessionalEdit,AccountSessionTransportUnavailable} from '../src/lib/account-session-transport.mjs';
const id=randomUUID(),accountBearer=randomBytes(32).toString('base64url'),body={about:'Қызмет'};
const options={baseUrl:'https://api.example.test/v1',id,accountBearer,body,version:1};
const row={id,profession_id:randomUUID(),lifecycle_status:'draft',slug:'draft',title:null,about:body.about,version:2,offers:[]};
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':'private, no-store'}});
test('edit transport sends version and changed fields only',async()=>{
 assert.equal(await updateBackendProfessionalProfile({...options,transport:async(url,init)=>{
  assert.equal(url,options.baseUrl+'/me/professional-profiles/'+id);assert.equal(init.headers['If-Match'],'"1"');assert.equal(init.headers.Authorization,'Bearer '+accountBearer);assert.deepEqual(JSON.parse(init.body),body);return response(row);
 }}),'updated');
 assert.equal(await updateBackendProfessionalProfile({...options,transport:async()=>response({},409)}),'conflict');
 await assert.rejects(updateBackendProfessionalProfile({...options,transport:async()=>response({...row,version:1})}),AccountSessionTransportUnavailable);
 for(const invalid of [{},{title:null},{version:2},{title:'x'.repeat(181)}])assert.equal(validProfessionalEdit(invalid),false);
});
test('edit route uses feature gates and verifies browser CSRF before mutation',()=>{
 const source=readFileSync(new URL('../src/app/api/account/profiles/[id]/route.ts',import.meta.url),'utf8');
 assert.match(source,/SERVICES_WEB_ENABLE_PROFESSIONAL_PROFILE_EDITING/);assert.ok(source.indexOf('if(!authenticateAccountWebMutation(auth))')<source.indexOf('await updateOwnProfessionalProfile('));
 assert.match(source,/bytes>LIMIT/);
});
