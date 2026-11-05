import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {sealAccountWebSession,openAccountWebSession,verifyAccountCsrf,
  verifyAccountMutationOrigin} from '../src/lib/account-web-session-core.mjs';

const key=randomBytes(32),bearer=randomBytes(32).toString('base64url');
const now=Date.parse('2026-11-06T00:00:00Z');

test('account bearer and CSRF remain encrypted in an authenticated cookie',()=>{
 const issued=sealAccountWebSession(key,bearer,300,now);
 assert.equal(issued.cookie.includes(bearer),false);
 assert.equal(issued.cookie.includes(issued.csrf),false);
 const restored=openAccountWebSession(key,issued.cookie,now+1000);
 assert.equal(restored.token,bearer);
 assert.equal(restored.scope,'account:web');
 assert.equal(verifyAccountCsrf(restored,issued.csrf),true);
 assert.equal(verifyAccountCsrf(restored,randomBytes(32).toString('base64url')),false);
});
test('expiry, tampering, wrong key and malformed account cookies fail closed',()=>{
 const issued=sealAccountWebSession(key,bearer,60,now);
 assert.equal(openAccountWebSession(key,issued.cookie,now+60000),null);
 assert.equal(openAccountWebSession(randomBytes(32),issued.cookie,now+1000),null);
 const parts=issued.cookie.split('.');
 parts[2]=(parts[2][0]==='A'?'B':'A')+parts[2].slice(1);
 assert.equal(openAccountWebSession(key,parts.join('.'),now+1000),null);
 for(const malformed of ['',undefined,'v1.foo.bar.baz','a'.repeat(3000)])
   assert.equal(openAccountWebSession(key,malformed,now),null);
});
test('account sessions use dedicated key, canonical proof and bounded expiry',()=>{
 assert.throws(()=>sealAccountWebSession(randomBytes(16),bearer,60,now));
 assert.throws(()=>sealAccountWebSession(key,'invalid',60,now));
 assert.throws(()=>sealAccountWebSession(key,bearer,0,now));
 assert.throws(()=>sealAccountWebSession(key,bearer,43201,now));
 assert.equal(verifyAccountCsrf(null,bearer),false);
});
test('mutations reject cross-site origins and unsupported fetch-site',()=>{
 const canonical='https://services.example';
 assert.equal(verifyAccountMutationOrigin(canonical,canonical,'same-origin'),true);
 for(const origin of [undefined,'https://evil.test',
    'https://services.example.evil.test',
    'https://services.example/path','https://services.example@evil.test']){
   assert.equal(verifyAccountMutationOrigin(origin,canonical,'same-origin'),false);
 }
 for(const site of ['cross-site','same-site','bogus']){
   assert.equal(verifyAccountMutationOrigin(canonical,canonical,site),false);
 }
});
test('account cookie wrapper stays server-only and separate from guest scope',()=>{
 const source=readFileSync(new URL('../src/lib/account-web-session.server.ts',import.meta.url),'utf8');
 for(const item of ["import 'server-only'","__Host-services_account_web",
   'httpOnly:true','secure:true',"sameSite:'strict'","path:'/'",'maxAge:0',
   'verifyAccountMutationOrigin','verifyAccountCsrf']){
   assert.ok(source.includes(item),item);
 }
 assert.doesNotMatch(source,/guest-create|guest_read_cancel|localStorage|sessionStorage/);
});
