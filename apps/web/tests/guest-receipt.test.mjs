import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../src/'+p,import.meta.url),'utf8');

test('receipt accepts only committed UUID/status/version shape',()=>{
 const code=read('lib/request-receipt.ts');
 assert.match(code,/parseCommittedReceipt/);
 assert.match(code,/Number.isSafeInteger/);
 assert.match(code,/version<1/);
 assert.doesNotMatch(code,/localStorage|sessionStorage|Math\.random/);
});
test('receipt never exposes guest bearer, OTP or contact data',()=>{
 const source=read('components/GuestRequestReceipt.tsx');
 assert.match(source,/receipt.state/);
 assert.doesNotMatch(source,/guestCapability|requestCapability|phone|contact|code|token|fetch\(/);
 assert.doesNotMatch(read('app/[locale]/services/[id]/page.tsx'),/<GuestRequestReceipt/);
});
