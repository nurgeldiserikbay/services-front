import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 parseAccountDeviceInventory,loadAccountDevices,revokeOtherAccountDevice,
 AccountDeviceUnavailable,AccountDeviceAuthenticationRequired,
} from '../src/lib/account-device-client.mjs';

const id='a59e3b8b-72ae-4ed8-91f9-51484d5f8cf0';
const other='b59e3b8b-72ae-4ed8-91f9-51484d5f8cf0';
const csrf='x'.repeat(43);
const current={id,deviceLabel:'Phone',lastUsedAt:null,
 expiresAt:'2026-12-01T00:00:00.000Z',current:true};
const another={...current,id:other,current:false,deviceLabel:'Laptop'};
const response=(value,status=200)=>new Response(JSON.stringify(value),{
 status,headers:{'content-type':'application/json'},
});
const src=path=>readFileSync(new URL('../src/'+path,import.meta.url),'utf8');

test('strict account inventory accepts exactly one current session, excludes extra secrets',()=>{
 const page={items:[current,another],csrf_token:csrf};
 assert.deepEqual(parseAccountDeviceInventory(page),
  {items:[current,another],csrf});
 for(const invalid of [
  {...page,access_token:'secret'},{...page,csrf_token:'bad'},
  {...page,items:[{...current,token_hash:'private'}]},
  {...page,items:[current,{...another,id}]},
  {...page,items:[{...current,current:false},another]},
  {...page,items:[current,{...another,current:true}]},
  {...page,items:Array(51).fill(current)},
  {...page,items:[{...current,expiresAt:'tomorrow'}]},
 ]){
  assert.throws(()=>parseAccountDeviceInventory(invalid),AccountDeviceUnavailable);
 }
});
test('browser inventory fetch uses only same-origin cookie and no-store',async()=>{
 const loaded=await loadAccountDevices({transport:async(url,options)=>{
  assert.equal(url,'/api/account/sessions');
  assert.equal(options.method,'GET');
  assert.equal(options.credentials,'same-origin');
  assert.equal(options.cache,'no-store');
  assert.equal('Authorization' in options.headers,false);
  return response({items:[current],csrf_token:csrf});
 }});
 assert.deepEqual(loaded.items,[current]);
 await assert.rejects(loadAccountDevices({
  transport:async()=>new Response(null,{status:401}),
 }),AccountDeviceAuthenticationRequired);
 await assert.rejects(loadAccountDevices({
  transport:async()=>new Response(null,{status:503}),
 }),AccountDeviceUnavailable);
});
test('remote logout sends only CSRF to same-origin BFF and accepts confirmed 204',async()=>{
 assert.equal(await revokeOtherAccountDevice({sessionId:other,csrf,
  transport:async(url,options)=>{
   assert.equal(url,'/api/account/sessions/'+other);
   assert.equal(options.method,'DELETE');
   assert.equal(options.credentials,'same-origin');
   assert.equal(options.cache,'no-store');
   assert.equal(options.headers['x-services-csrf'],csrf);
   assert.equal('Authorization' in options.headers,false);
   return new Response(null,{status:204});
  },
 }),'ok');
 for(const [status,expected] of [[401,'authentication_required'],
  [404,'authentication_required'],[409,'current_session'],
  [503,'unavailable'],[301,'unavailable']]){
  assert.equal(await revokeOtherAccountDevice({
   sessionId:other,csrf,transport:async()=>new Response(null,{status}),
  }),expected);
 }
 await assert.rejects(revokeOtherAccountDevice({sessionId:'bad',csrf}),
  AccountDeviceUnavailable);
});
test('device UI is localized and never exposes bearer/optimistically deletes remote session',()=>{
 const component=src('components/AccountDeviceSessions.tsx');
 assert.match(component,/loadAccountDevices/);
 assert.match(component,/revokeOtherAccountDevice/);
 assert.match(component,/await refresh\(\)/);
 assert.match(component,/Сессиялар жүктелуде/);
 assert.match(component,/Загрузка сеансов/);
 assert.match(component,/item\.current/);
 assert.doesNotMatch(component,/localStorage|sessionStorage|Authorization/);
});
