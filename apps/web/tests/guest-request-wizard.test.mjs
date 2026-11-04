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

test('wizard remains unmounted on public routes while OTP and BFF gates are open',()=>{
  const page=read('app/[locale]/services/[id]/page.tsx');
  assert.doesNotMatch(page,/<GuestRequestWizard|<GuestInquiryDraft|<GuestOtpStep/);
});
