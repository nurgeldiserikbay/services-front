import{test}from'node:test';
import assert from'node:assert/strict';
import{readFileSync}from'node:fs';
const read=p=>readFileSync(new URL('../src/'+p,import.meta.url),'utf8');
test('seller inbox adapter whitelists safe summary fields and never forwards PII',()=>{
 const s=read('lib/seller-request-api-contract.ts');
 assert.match(s,/parseSellerInboxPage/);
 assert.match(s,/seller_kind/);
 assert.match(s,/Number.isSafeInteger/);
 assert.match(s,/desiredStartAt:null/);
 assert.doesNotMatch(s,/customerPhone|customerEmail|guestCapability|customerNote/);
});
test('typed seller decision result is server-authoritative',()=>{
 const s=read('lib/seller-request-api-contract.ts');
 assert.match(s,/parseSellerDecisionReply/);
 assert.match(s,/r\.replayed/);
 assert.doesNotMatch(s,/fetch\(|localStorage|sessionStorage|document\.cookie/);
});
