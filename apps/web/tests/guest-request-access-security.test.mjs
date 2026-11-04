import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {
  sealGuestRequestAccess,openGuestRequestAccess,verifyGuestRequestAccess,
} from '../src/lib/guest-request-access-core.mjs';
import {sealGuestSession} from '../src/lib/guest-session-core.mjs';

const key=randomBytes(32),id=randomUUID(),otherId=randomUUID();
const secret=randomBytes(32).toString('base64url');
const now=Date.parse('2026-11-04T12:00:00Z');

test('READ_CANCEL proof is scoped to exact request and remains encrypted',()=>{
  const issued=sealGuestRequestAccess(key,id,secret,now+24*60*60*1000,now);
  assert.equal(issued.cookie.includes(secret),false);
  assert.equal(issued.cookie.includes(issued.csrf),false);
  assert.equal(issued.cookie.includes(id),false);
  const opened=openGuestRequestAccess(key,issued.cookie,now+1000);
  assert.equal(opened.requestId,id);
  assert.equal(opened.scope,'guest:read_cancel');
  assert.equal(opened.capability,secret);
  assert.equal(verifyGuestRequestAccess(opened,id,issued.csrf),true);
  assert.equal(verifyGuestRequestAccess(opened,otherId,issued.csrf),false);
  assert.equal(verifyGuestRequestAccess(opened,id,randomBytes(32).toString('base64url')),false);
});

test('expired or tampered read access fails closed',()=>{
  const issued=sealGuestRequestAccess(key,id,secret,now+1000,now);
  assert.equal(openGuestRequestAccess(key,issued.cookie,now+1000),null);
  assert.equal(openGuestRequestAccess(randomBytes(32),issued.cookie,now),null);
  const chunks=issued.cookie.split('.');
  chunks[3]=(chunks[3][0]==='A'?'B':'A')+chunks[3].slice(1);
  assert.equal(openGuestRequestAccess(key,chunks.join('.'),now),null);
  for(const invalid of [undefined,'', 'v1.x.x.x','x'.repeat(3000)]){
    assert.equal(openGuestRequestAccess(key,invalid,now),null);
  }
});

test('CREATE_REQUEST cookies are cryptographically isolated from READ_CANCEL',()=>{
  const create=sealGuestSession(key,secret,900,now);
  assert.equal(openGuestRequestAccess(key,create.cookie,now),null);
});

test('cannot extend request access beyond 24h or accept invalid scoped proof',()=>{
  assert.throws(()=>sealGuestRequestAccess(key,id,secret,now+24*60*60*1000+1,now));
  assert.throws(()=>sealGuestRequestAccess(key,id,secret,now,now));
  assert.throws(()=>sealGuestRequestAccess(key,'invalid',secret,now+1000,now));
  assert.throws(()=>sealGuestRequestAccess(key,id,'bad',now+1000,now));
  assert.throws(()=>sealGuestRequestAccess(randomBytes(16),id,secret,now+1000,now));
});

test('request access server adapter uses HttpOnly host cookie, no public endpoints',()=>{
  const read=p=>readFileSync(new URL('../src/'+p,import.meta.url),'utf8');
  const wrapper=read('lib/guest-request-access.server.ts');
  for(const fragment of ["import 'server-only'",'__Host-services_guest_request',
    'httpOnly:true','secure:true', "sameSite:'strict'","path:'/'",
    'verifyMutationOrigin','verifyGuestRequestAccess']){
    assert.ok(wrapper.includes(fragment),fragment);
  }
  assert.doesNotMatch(read('app/[locale]/services/[id]/page.tsx'),
    /guest-request-access\.server|GuestInquiryDraft/);
});
