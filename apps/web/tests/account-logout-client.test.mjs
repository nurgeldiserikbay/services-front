import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {logoutCurrentAccount} from '../src/lib/account-logout-client.mjs';

const csrf='A'.repeat(43);
const goodInventory=async()=>({csrf});
const response=status=>({status});

test('confirmed sign-out reads CSRF from private device session, sends same-origin POST',async()=>{
 const calls=[];
 const outcome=await logoutCurrentAccount({
  loadDevices:async opts=>{
   assert.equal(typeof opts.transport,'function');
   return goodInventory();
  },
  transport:async(url,init)=>{
   calls.push({url,init});
   return response(204);
  },
 });
 assert.equal(outcome,'confirmed');
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,'/api/account/logout');
 assert.equal(calls[0].init.method,'POST');
 assert.equal(calls[0].init.credentials,'same-origin');
 assert.equal(calls[0].init.cache,'no-store');
 assert.equal(calls[0].init.redirect,'error');
 assert.equal(calls[0].init.headers['x-services-csrf'],csrf);
 assert.equal(calls[0].init.body,undefined);
 assert.equal(calls[0].init.headers.Authorization,undefined);
});

test('uncertain server revocation is never presented as confirmed logout',async()=>{
 for(const [status,expected] of [[503,'local_only'],[404,'unavailable'],
   [401,'unavailable'],[500,'unavailable']]){
  assert.equal(await logoutCurrentAccount({
   loadDevices:goodInventory,transport:async()=>response(status),
  }),expected);
 }
});

test('cannot logout without validated current-session CSRF',async()=>{
 for(const loadDevices of [
  async()=>{throw Error('offline');},
  async()=>({csrf:'invalid'}),
  async()=>({csrf:undefined}),
 ]){
  let requests=0;
  assert.equal(await logoutCurrentAccount({
   loadDevices,transport:async()=>{requests++;return response(204);},
  }),'unavailable');
  assert.equal(requests,0);
 }
});

test('network failure during POST does not claim successful logout',async()=>{
 assert.equal(await logoutCurrentAccount({
  loadDevices:goodInventory,
  transport:async()=>{throw Error('network reset');},
 }),'unavailable');
});

test('authorized account UI renders a localized, single-flight sign-out control',()=>{
 const account=readFileSync(new URL('../src/app/[locale]/account/page.tsx',import.meta.url),'utf8');
 const component=readFileSync(new URL('../src/components/AccountSignOut.tsx',import.meta.url),'utf8');
 assert.match(account,/AccountSignOut locale=\{locale\}/);
 assert.match(component,/gate\.current=true/);
 assert.match(component,/logoutCurrentAccount\(\)/);
 assert.match(component,/outcome==='confirmed'/);
 assert.match(component,/window\.location\.replace\('\/'\+locale\)/);
 assert.match(component,/outcome==='local_only'/);
 assert.match(component,/setLocalOnly\(true\)/);
 assert.match(component,/role="alert"/);
 assert.match(component,/minHeight:44/);
 assert.match(component,/Аккаунттан шығу/);
 assert.match(component,/Выйти из аккаунта/);
});
