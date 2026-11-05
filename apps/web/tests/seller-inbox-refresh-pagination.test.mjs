import{test}from'node:test';
import assert from'node:assert/strict';
import{readFileSync}from'node:fs';
const read=path=>readFileSync(new URL('../src/'+path,import.meta.url),'utf8');

test('pagination merge is seller scoped and keeps newer versions',()=>{
  const src=read('lib/seller-request-api-contract.ts');
  assert.match(src,/export function mergeSellerInboxPages/);
  assert.match(src,/item\.sellerKind!==sellerKind/);
  assert.match(src,/item\.version>prior\.version/);
  assert.match(src,/byId\.set\(item\.id,item\)/);
  assert.match(src,/export function canAdvanceSellerCursor/);
  assert.match(src,/!seenCursors\.has\(nextCursor\)/);
});

test('caller controls post-decision refresh without optimistic state changes',()=>{
  const src=read('components/SellerRequestList.tsx');
  assert.match(src,/onRefresh\?:\(\)=>Promise<void>/);
  assert.match(src,/refreshLock\.current/);
  assert.match(src,/await onRefresh\(\)/);
  assert.match(src,/await refresh\(\)/);
  assert.match(src,/result==='ok'\|\|result==='conflict'/);
  assert.match(src,/settled\[req\.id\]===req\.version/);
  assert.doesNotMatch(src,/fetch\(|localStorage|sessionStorage/);
});

test('refresh is accessible in both locales and exposes failures',()=>{
  const src=read('components/SellerRequestList.tsx');
  assert.match(src,/refresh:'Жаңарту'/);
  assert.match(src,/refresh:'Обновить'/);
  assert.match(src,/errors\.__refresh&&<p role="alert">/);
  assert.match(src,/disabled=\{refreshing\|\|busy!==null\}/);
});
