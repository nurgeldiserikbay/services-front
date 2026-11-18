import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createBackendProfessionalProfile,AccountSessionTransportUnavailable} from '../src/lib/account-session-transport.mjs';
const professionId=randomUUID(),id=randomUUID(),idempotencyKey=randomUUID(),accountBearer=randomBytes(32).toString('base64url');
const options={baseUrl:'https://api.example.test/v1',professionId,idempotencyKey,accountBearer};
const row={id,profession_id:professionId,lifecycle_status:'draft',slug:'pro-'+id,title:null,offers:[]};
const response=(body,status=201)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'private, no-store'}});
test('create sends only canonical profession with idempotency key and server bearer',async()=>{
 assert.equal(await createBackendProfessionalProfile({...options,transport:async(url,init)=>{
  assert.equal(url,options.baseUrl+'/me/professional-profiles');
  assert.equal(init.headers.Authorization,'Bearer '+accountBearer);assert.equal(init.headers['Idempotency-Key'],idempotencyKey);
  assert.deepEqual(JSON.parse(init.body),{profession_id:professionId});return response(row);
 }}),'created');
 assert.equal(await createBackendProfessionalProfile({...options,transport:async()=>response({},409)}),'conflict');
 await assert.rejects(createBackendProfessionalProfile({...options,transport:async()=>response({...row,secret:'x'})}),AccountSessionTransportUnavailable);
});
test('browser mutation checks CSRF before backend call and has independent feature gate',()=>{
 const source=readFileSync(new URL('../src/app/api/account/profiles/route.ts',import.meta.url),'utf8');
 assert.match(source,/SERVICES_WEB_ENABLE_PROFESSIONAL_PROFILE_CREATION/);
 assert.ok(source.indexOf('if(!authenticateAccountWebMutation(auth))')<source.indexOf('await createOwnProfessionalProfile('));
 assert.match(source,/bytes>512/);
});
