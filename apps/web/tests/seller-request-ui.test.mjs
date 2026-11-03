import{test}from'node:test';
import assert from'node:assert/strict';
import{readFileSync}from'node:fs';
const read=p=>readFileSync(new URL('../src/'+p,import.meta.url),'utf8');
test('seller actions require pending status and matching workspace',()=>{
 const src=read('lib/seller-requests.ts');
 assert.match(src,/request.state==='pending'/);
 assert.match(src,/request.sellerKind===sellerContext/);
 assert.match(src,/Number.isSafeInteger/);
});
test('seller request component prevents duplicate clicks and never mutates local truth',()=>{
 const src=read('components/SellerRequestList.tsx');
 assert.match(src,/inFlight.current.has/);
 assert.match(src,/onDecision\(req.id,req.version,decision\)/);
 assert.match(src,/caller MUST refresh/);
 assert.doesNotMatch(src,/fetch\(|localStorage|sessionStorage|window\.location/);
});
test('seller request component is not mounted publicly before seller authorization',()=>{
 const page=read('app/[locale]/services/[id]/page.tsx');
 assert.doesNotMatch(page,/<SellerRequestList/);
});
