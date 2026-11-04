import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../src/'+p,import.meta.url),'utf8');

test('guest wizard separates OTP verification from committed request receipt',()=>{
  const source=read('components/GuestRequestWizard.tsx');
  for(const step of ["'draft'","'otp'","'ready'","'submitting'","'receipt'"])
    assert.ok(source.includes(step),step);
  assert.match(source,/onStartChallenge\(next\)/);
  assert.match(source,/onVerifyChallenge\(challengeId,code\)/);
  assert.match(source,/onCreateRequest\(draft,key.current\)/);
  assert.match(source,/parseCommittedCreateReceipt\(result\)/);
  assert.match(source,/if\(!parsed\)throw/);
  assert.match(source,/setReceipt\(parsed\)/);
  assert.doesNotMatch(source,/fetch\(|localStorage|sessionStorage|Guest-Capability|window\.location/);
});

test('retries use stable operation key and do not repeat consumed OTP',()=>{
  const source=read('components/GuestRequestWizard.tsx');
  assert.match(source,/key.current\?\?=/);
  assert.match(source,/setStep\('ready'\)/);
  assert.match(source,/setError\('submit'\)/);
  assert.match(source,/busy.current/);
  assert.doesNotMatch(source,/onVerifyChallenge\(challengeId,code\)[\s\S]*onCreateRequest\(draft,key.current\)[\s\S]*onVerifyChallenge/);
});

test('request receipt only renders committed backend result and does not fabricate version',()=>{
  const source=read('lib/guest-create-ui.ts');
  assert.match(source,/o.state!=='pending'/);
  assert.match(source,/UUID.test\(o.id\)/);
  assert.match(source,/return \{id:o.id.toLowerCase\(\),state:'pending'\}/);
  const wizard=read('components/GuestRequestWizard.tsx');
  assert.match(wizard,/step==='receipt'&&receipt/);
  assert.doesNotMatch(wizard,/version:1/);
});

test('public offer only mounts connected wizard with all rollout gates and opt-in',()=>{
  const page=read('app/[locale]/services/[id]/page.tsx');
  for(const gate of [
    'SERVICES_WEB_ENABLE_GUEST_WIZARD',
    'SERVICES_WEB_ENABLE_GUEST_OTP_START_HTTP',
    'SERVICES_WEB_ENABLE_GUEST_OTP_VERIFY_HTTP',
    'SERVICES_WEB_ENABLE_GUEST_OTP_BFF',
    'SERVICES_WEB_ENABLE_GUEST_CREATE_HTTP',
    "contact_methods.includes('guest_request')",
  ])assert.ok(page.includes(gate),gate);
  assert.match(page,/<ConnectedGuestRequestWizard serviceOfferId={offer.id} locale={locale}/);
  assert.doesNotMatch(page,/<GuestInquiryDraft|<GuestOtpStep/);
});

test('BFF composition reuses existing wizard, no duplicate UI or persistent secrets',()=>{
  const adapter=read('components/ConnectedGuestRequestWizard.tsx');
  assert.match(adapter,/onStartChallenge={start}/);
  assert.match(adapter,/onVerifyChallenge={verify}/);
  assert.match(adapter,/onCreateRequest={create}/);
  for(const url of [
    '/api/guest-requests/challenges/start',
    '/api/guest-requests/challenges/verify',
    '/api/guest-requests',
  ])assert.ok(adapter.includes(url),url);
  assert.match(adapter,/parseCommittedCreateReceipt/);
  assert.match(adapter,/createCsrf.current=response.csrf_token/);
  assert.match(adapter,/redirect:'error'/);
  assert.match(adapter,/credentials:'same-origin'/);
  assert.match(adapter,/cache:'no-store'/);
  assert.doesNotMatch(adapter,/localStorage|sessionStorage|window.location|document.cookie|Guest-Capability|guest_capability|request_capability/);
});
