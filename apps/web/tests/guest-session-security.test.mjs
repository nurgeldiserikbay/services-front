import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {
  sealGuestSession,openGuestSession,verifyGuestCsrf,verifyMutationOrigin,
} from '../src/lib/guest-session-core.mjs';

const key=randomBytes(32);
const capability=randomBytes(32).toString('base64url');
const now=Date.parse('2026-11-04T08:00:00.000Z');

test('guest capability stays in authenticated ciphertext, not plaintext cookie',()=>{
  const session=sealGuestSession(key,capability,900,now);
  assert.equal(session.cookie.includes(capability),false);
  assert.equal(session.cookie.includes(session.csrf),false);
  const restored=openGuestSession(key,session.cookie,now+1000);
  assert.equal(restored.capability,capability);
  assert.equal(restored.scope,'guest:create_request');
  assert.equal(verifyGuestCsrf(restored,session.csrf),true);
  assert.equal(verifyGuestCsrf(restored,randomBytes(32).toString('base64url')),false);
});

test('expired, tampered, wrong-key and malformed guest cookies fail closed',()=>{
  const session=sealGuestSession(key,capability,60,now);
  assert.equal(openGuestSession(key,session.cookie,now+60000),null);
  assert.equal(openGuestSession(randomBytes(32),session.cookie,now+1000),null);
  const parts=session.cookie.split('.');
  parts[2]=(parts[2][0]==='A'?'B':'A')+parts[2].slice(1);
  assert.equal(openGuestSession(key,parts.join('.'),now+1000),null);
  for(const value of ['',undefined,'v1.foo.bar.baz','x'.repeat(3000)]){
    assert.equal(openGuestSession(key,value,now),null);
  }
});

test('only 32-byte server keys, bounded TTL and canonical capability accepted',()=>{
  assert.throws(()=>sealGuestSession(randomBytes(16),capability),/key/);
  assert.throws(()=>sealGuestSession(key,'bad'),/invalid/);
  assert.throws(()=>sealGuestSession(key,capability,901),/invalid/);
  assert.throws(()=>sealGuestSession(key,capability,0),/invalid/);
});

test('CSRF and origin reject cross-site, missing, suffix and spoofed origins',()=>{
  assert.equal(verifyMutationOrigin('https://services.example','https://services.example','same-origin'),true);
  assert.equal(verifyMutationOrigin('https://services.example','https://services.example','none'),true);
  for(const origin of [undefined,'','https://evil.example',
    'https://services.example.evil.test','https://services.example/path',
    'https://services.example@evil.test','null']){
    assert.equal(verifyMutationOrigin(origin,'https://services.example','same-origin'),false);
  }
  assert.equal(verifyMutationOrigin('https://services.example','https://services.example','cross-site'),false);
  assert.equal(verifyMutationOrigin('https://services.example','https://services.example','same-site'),false);
});

test('Next.js wrapper is server-only, HttpOnly and no public action is mounted',()=>{
  const read=p=>readFileSync(new URL('../src/'+p,import.meta.url),'utf8');
  const wrapper=read('lib/guest-session.server.ts');
  assert.match(wrapper,/import 'server-only'/);
  for(const part of ['__Host-services_guest_create','httpOnly:true',
    'secure:true', "sameSite:'strict'", "path:'/'", 'maxAge:0']){
    assert.ok(wrapper.includes(part),part);
  }
  assert.doesNotMatch(read('app/[locale]/services/[id]/page.tsx'),/guest-session\.server|GuestInquiryDraft/);
});
