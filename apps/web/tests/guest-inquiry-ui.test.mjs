import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../src/'+path,import.meta.url),'utf8');

test('guest inquiry draft requires contact consent, rejects seller injection and overlong note',()=>{
 const source=read('lib/guest-inquiry.ts');
 assert.match(source,/consentToContact!==true/);
 assert.match(source,/note\.length>1000/);
 assert.match(source,/serviceOfferId/);
 assert.doesNotMatch(source,/sellerId|price_amount|paymentMethod/);
});
test('guest inquiry UI stays unmounted until BFF and OTP flows exist',()=>{
 const ui=read('components/GuestInquiryDraft.tsx');
 assert.match(ui,/onContinue/);
 assert.match(ui,/event\.preventDefault\(\)/);
 assert.doesNotMatch(ui,/fetch\(|localStorage|sessionStorage|window\.location|wa\.me/);
 const page=read('app/[locale]/services/[id]/page.tsx');
 assert.doesNotMatch(page,/<GuestInquiryDraft/);
});
test('kk and ru drafts clarify that no request has been submitted',()=>{
 const s=read('components/GuestInquiryDraft.tsx');
 assert.match(s,/kk:/);assert.match(s,/ru:/);assert.match(s,/Әзірге серверге жіберілген жоқ/);
 assert.match(s,/не отправлен на сервер/);
});
