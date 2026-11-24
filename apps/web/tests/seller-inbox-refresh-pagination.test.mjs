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
  assert.match(src,/await refresh\(true\);/);
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

test('seller request list uses the tested single-flight gate across different request rows',()=>{
  const src=read('components/SellerRequestList.tsx');
  assert.match(src,/import \{createSellerDecisionSingleFlight,sellerRefreshBlocked\} from '@\/lib\/seller-decision-single-flight\.mjs'/);
  assert.match(src,/const decisionGate=useRef\(createSellerDecisionSingleFlight\(\)\)/);
  assert.match(src,/const gate=sharedDecisionGate\?\?decisionGate\.current/);
  assert.match(src,/if\(refreshLock\.current\|\|gate\.active\|\|inFlight\.current\.has\(req\.id\)/);
  const handler=src.split('async function decide(req:SellerRequestSummary,decision:Decision)')[1];
  assert.ok(handler,'decision handler required');
  assert.ok(handler.indexOf('await gate.run(async()=>{')<
    handler.indexOf('await onDecision('),
    'single-flight must acquire before dispatching a seller decision');
  assert.match(handler,/inFlight\.current\.add\(req\.id\)/,
    'existing per-request lock must remain');
  assert.match(handler,/finally\{inFlight\.current\.delete\(req\.id\);setBusy\(null\);\}/);
  assert.match(handler,/await refresh\(true\);/,
    'the lock must cover the post-decision server refresh');
});

test('seller workspace provides one shared gate to both seller scopes',()=>{
  const parent=read('components/SellerWorkspace.tsx');
  const child=read('components/SellerRequestList.tsx');
  assert.match(parent,/const \[sharedDecisionGate\]=useState\(createSellerDecisionSingleFlight\)/);
  assert.equal((parent.match(/sharedDecisionGate=\{sharedDecisionGate\}/g)??[]).length,2,
    'both specialist and organization sections must share the same gate');
  assert.match(child,/sharedDecisionGate\?:SellerDecisionSingleFlight/);
  assert.match(child,/const gate=sharedDecisionGate\?\?decisionGate\.current/);
  assert.match(child,/await gate\.run\(async\(\)=>\{/);
  assert.match(child,/await refresh\(true\);/);
});
