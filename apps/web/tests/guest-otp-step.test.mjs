import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../src/'+p,import.meta.url),'utf8');

test('OTP step does not persist code, issue network requests or fake successful bookings',()=>{
 const source=read('components/GuestOtpStep.tsx');
 assert.match(source,/one-time-code/);
 assert.match(source,/busy\.current/);
 assert.match(source,/setCode\(''\)/);
 assert.match(source,/onVerify\(code\)/);
 assert.doesNotMatch(source,/fetch\(|localStorage|sessionStorage|window\.location|Guest-Capability/);
 assert.doesNotMatch(source,/setTimeout\(|Math\.random/);
});
test('a six-digit OTP and callback result drive verification state, not UI guesswork',()=>{
 const s=read('components/GuestOtpStep.tsx');
 assert.match(s,/\^\[0-9\]\{6\}\$/);
 assert.match(s,/result==='verified'/);
 assert.match(s,/invalid'\|'expired'\|'unavailable'/);
 assert.match(s,/onVerified\(\)/);
});
test('OTP step remains disconnected from production routes pending verified BFF',()=>{
 const s=read('app/[locale]/services/[id]/page.tsx');
 assert.doesNotMatch(s,/<GuestOtpStep/);
});
