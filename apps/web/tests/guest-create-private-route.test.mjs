import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {
  parseGuestCreateRequestBytes,validateGuestCreateRouteBody,
  GUEST_CREATE_MAX_BODY_BYTES,
} from '../src/lib/guest-create-route-core.mjs';
import {sealGuestSession,openGuestSession,verifyGuestCsrf}
  from '../src/lib/guest-session-core.mjs';

const id=randomUUID();
const csrf=randomBytes(32).toString('base64url');
const payload={
  service_offer_id:id,consent_to_contact:true,note:'Need an appointment',
  csrf_token:csrf,idempotency_key:'guest_'+randomUUID().replace(/-/g,''),
};
const encode=value=>new TextEncoder().encode(JSON.stringify(value)).buffer;

test('accepts only bounded allowlisted body and normalizes offer ID',()=>{
  const actual=parseGuestCreateRequestBytes(encode(payload));
  assert.deepEqual(actual,{csrfToken:csrf,idempotencyKey:payload.idempotency_key,
    body:{service_offer_id:id,consent_to_contact:true,
      note:'Need an appointment'}});
  assert.equal(GUEST_CREATE_MAX_BODY_BYTES,2048);
});
test('untrusted fields, malformed csrf/key and missing consent fail closed',()=>{
  const bad=[
    {...payload,seller_id:randomUUID()},
    {...payload,request_capability:randomBytes(32).toString('base64url')},
    {...payload,csrf_token:'invalid'},
    {...payload,idempotency_key:'bad'},
    {...payload,service_offer_id:'bad'},
    {...payload,consent_to_contact:false},
    {...payload,note:'x'.repeat(1001)},
    {...payload,note:'private\u0000data'},
    {...payload,note:1},null,[],{},
  ];
  for(const value of bad){
    assert.throws(()=>validateGuestCreateRouteBody(value));
  }
  assert.throws(()=>parseGuestCreateRequestBytes(
    new TextEncoder().encode('{').buffer));
  assert.throws(()=>parseGuestCreateRequestBytes(
    new Uint8Array([0xff,0xfe]).buffer));
  assert.throws(()=>parseGuestCreateRequestBytes(
    new Uint8Array(GUEST_CREATE_MAX_BODY_BYTES+1).buffer));
});
test('create session proof is sealed and CSRF mismatch fails',()=>{
  const key=randomBytes(32);
  const capability=randomBytes(32).toString('base64url');
  const issued=sealGuestSession(key,capability,600);
  const opened=openGuestSession(key,issued.cookie);
  assert.equal(opened.capability,capability);
  assert.equal(verifyGuestCsrf(opened,issued.csrf),true);
  assert.equal(verifyGuestCsrf(opened,randomBytes(32).toString('base64url')),false);
  assert.equal(openGuestSession(randomBytes(32),issued.cookie),null);
});
test('route cannot expose bearer secrets and remains disabled until rollout',()=>{
  const source=readFileSync(new URL(
    '../src/app/api/guest-requests/route.ts',import.meta.url),'utf8');
  for(const literal of [
    'SERVICES_WEB_ENABLE_GUEST_CREATE_HTTP',
    "import {submitVerifiedGuestRequest}",
    'GUEST_CREATE_COOKIE',
    'parseGuestCreateRequestBytes',
    'request.headers.get(\'origin\')',
    'request.headers.get(\'sec-fetch-site\')',
    'response.cookies.set(created.setCookie.name',
    'response.cookies.set(created.clearCookie.name',
    'private, no-store',
    'noindex, nofollow',
    'Referrer-Policy',
    'status:201',
  ])assert.ok(source.includes(literal),literal);
  assert.doesNotMatch(source,/NextResponse\.json\(created\)/);
  assert.doesNotMatch(source,/Guest-Capability['":]/);
  assert.doesNotMatch(source,/created\.setCookie\.value[^,]*\}/);
  const offer=readFileSync(new URL(
    '../src/app/[locale]/services/[id]/page.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(offer,/GuestRequestWizard|submitVerifiedGuestRequest/);
});
