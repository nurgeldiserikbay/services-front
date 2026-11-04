import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {
  sealGuestChallenge,openGuestChallenge,verifyGuestChallengeSession,
} from '../src/lib/guest-challenge-session-core.mjs';
import {sealGuestSession} from '../src/lib/guest-session-core.mjs';
import {sealGuestRequestAccess} from '../src/lib/guest-request-access-core.mjs';

const key=randomBytes(32),other=randomBytes(32);
const id=randomUUID(),otherId=randomUUID();
const now=Date.parse('2026-11-04T09:00:00Z');

test('encrypted challenge session binds exact challenge and separate CSRF',()=>{
  const value=sealGuestChallenge(key,id,600,now);
  assert.equal(value.cookie.includes(id),false);
  assert.equal(value.cookie.includes(value.csrf),false);
  const opened=openGuestChallenge(key,value.cookie,now+1000);
  assert.equal(opened.challengeId,id);
  assert.equal(verifyGuestChallengeSession(opened,id,value.csrf),true);
  assert.equal(verifyGuestChallengeSession(opened,otherId,value.csrf),false);
  assert.equal(verifyGuestChallengeSession(opened,id,randomBytes(32).toString('base64url')),false);
  assert.equal(verifyGuestChallengeSession(opened,id,undefined),false);
});

test('expired, forged and damaged cookie is denied without exceptions',()=>{
  const sealed=sealGuestChallenge(key,id,10,now);
  assert.equal(openGuestChallenge(key,sealed.cookie,now+10000),null);
  assert.equal(openGuestChallenge(other,sealed.cookie,now),null);
  const parts=sealed.cookie.split('.');
  parts[3]=(parts[3][0]==='A'?'B':'A')+parts[3].slice(1);
  assert.equal(openGuestChallenge(key,parts.join('.'),now),null);
  for(const invalid of [undefined,'','v1.x.x.x','x'.repeat(2500)]){
    assert.equal(openGuestChallenge(key,invalid,now),null);
  }
});

test('challenge session cannot be used as CREATE_REQUEST or READ_CANCEL cookie',()=>{
  const sealed=sealGuestChallenge(key,id,600,now);
  const capability=randomBytes(32).toString('base64url');
  const create=sealGuestSession(key,capability,600,now);
  const read=sealGuestRequestAccess(key,id,capability,now+600000,now);
  assert.equal(openGuestChallenge(key,create.cookie,now),null);
  assert.equal(openGuestChallenge(key,read.cookie,now),null);
  assert.equal(openGuestChallenge(key,sealed.cookie,now)?.challengeId,id);
});

test('reject invalid TTL and challenge session values',()=>{
  for(const ttl of [0,601,1.5,-1]){
    assert.throws(()=>sealGuestChallenge(key,id,ttl,now));
  }
  assert.throws(()=>sealGuestChallenge(key,'invalid',60,now));
  assert.throws(()=>sealGuestChallenge(randomBytes(16),id,60,now));
  assert.throws(()=>openGuestChallenge(randomBytes(16),'v1.x.x.x',now));
});

test('BFF is disabled by default and keeps bearer proof in encrypted HttpOnly cookie',()=>{
  const read=p=>readFileSync(new URL('../src/'+p,import.meta.url),'utf8');
  const bff=read('lib/guest-otp-bff.server.ts');
  for(const s of [
    "import 'server-only'",
    'SERVICES_WEB_ENABLE_GUEST_OTP_BFF',
    'verifyMutationOrigin',
    'verifyGuestChallengeSession',
    'openGuestChallenge',
    'issueGuestCreateSession',
    "'__Host-services_guest_challenge'",
    'httpOnly:true','secure:true',"sameSite:'strict'",
  ])assert.ok(bff.includes(s),s);
  assert.doesNotMatch(bff,/NextResponse\.json\(proof|return proof/);
  assert.doesNotMatch(read('app/[locale]/services/[id]/page.tsx'),
    /startGuestChallenge|confirmGuestChallenge|guest-otp-bff/);
});
