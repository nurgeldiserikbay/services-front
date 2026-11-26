import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseSellerBffInbox,SellerClientUnavailable}
  from '../src/lib/seller-bff-client.mjs';

const uuid='a59e3b8b-72ae-4ed8-91f9-51484d5f8cf0';
const offer='d31bfdea-5c21-45be-82b0-ec3b89cac042';
const item={id:uuid,serviceOfferId:offer,title:'Verified service',state:'pending',
  version:2,createdAt:'2026-11-06T00:00:00.000Z',
  desiredStartAt:null,sellerKind:'organization'};
const page={items:[item],next_cursor:null,csrf_token:'z'.repeat(43)};

test('seller BFF client refuses extra private item fields',()=>{
  assert.equal(parseSellerBffInbox(page).items[0].title,item.title);
  for(const invalid of [
    {...item,customer_contact:'secret'}, {...item,guestCapability:'secret'},
    {...item,createdAt:'now'},{...item,sellerKind:'other'},
  ]){
    assert.throws(()=>parseSellerBffInbox({...page,items:[invalid]}),
      SellerClientUnavailable);
  }
});
test('account inbox is a client component that never reads backend tokens',()=>{
  const src=readFileSync(new URL('../src/components/SellerAccountInbox.tsx',import.meta.url),'utf8');
  assert.match(src,/'use client'/);
  assert.match(src,/loadSellerInbox/);
  assert.match(src,/sendSellerDecision/);
  assert.match(src,/t\[item\.sellerKind\]/);
  assert.match(src,/retry\.current\.get\(key\)/);
  assert.match(src,/retry\.current\.delete\(key\)/);
  assert.match(src,/epoch\.current\+\+/);
  assert.match(src,/disabled=\{busy\|\|pendingId!==null\|\|blocked\[item\.id\]===item\.version\}/);
  assert.doesNotMatch(src,/accountBearer|Authorization|localStorage|sessionStorage|document\.cookie/);
});
test('account inbox is not publicly mounted before registered-account login',()=>{
  const src=readFileSync(new URL('../src/app/[locale]/page.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(src,/SellerAccountInbox/);
});

test('account-wide seller actions identify request and seller scope for screen readers',()=>{
  const src=readFileSync(new URL('../src/components/SellerAccountInbox.tsx',import.meta.url),'utf8');
  for(const action of ['accept','decline']){
    const accessible="aria-label={t."+action+
      "+': '+t[item.sellerKind]+' · '+item.title+' № '+item.id.slice(0,8)}";
    assert.ok(src.includes(accessible),'missing scoped accessible label: '+action);
  }
  assert.match(src,/professional:'Маман',organization:'Компания'/);
  assert.match(src,/professional:'Специалист',organization:'Компания'/);
  assert.match(src,/onClick=\{\(\)=>void decide\(item,'accept'\)\}>\{t\.accept\}<\/button>/);
  assert.match(src,/onClick=\{\(\)=>void decide\(item,'decline'\)\}>\{t\.decline\}<\/button>/);
});

test('account-wide seller decisions use executable synchronous gate',()=>{
 const src=readFileSync(new URL('../src/components/SellerAccountInbox.tsx',import.meta.url),'utf8');
 assert.match(src,/const decisionGate=useRef\(createSellerDecisionSingleFlight\(\)\)/);
 assert.match(src,/if\(run\.current\|\|decisionGate\.current\.active\|\|pendingId\|\|item\.state!=='pending'/);
 assert.match(src,/await decisionGate\.current\.run\(async\(\)=>\{/);
 assert.match(src,/retry\.current\.get\(key\)/);
 assert.match(src,/retry\.current\.set\(key,nonce\)/);
 assert.match(src,/finally\{if\(isCurrentSellerDecision\(mounted\.current,decisionEpoch,decisionLifetime\.current\)\)setPendingId\(null\);\}/);
});

test('external account inbox reloads cannot race an in-flight seller decision',()=>{
 const src=readFileSync(new URL('../src/components/SellerAccountInbox.tsx',import.meta.url),'utf8');
 assert.match(src,/const load=useCallback\(async\(next=false,afterDecision=false\)=>\{/);
 assert.match(src,/if\(run\.current\|\|\(decisionGate\.current\.active&&!afterDecision\)\)return false;/);
 assert.match(src,/await load\(false,true\);/,
   'only post-decision server refresh can bypass the decision gate');
 assert.match(src,/onClick=\{\(\)=>void load\(\)\}/,
   'manual refresh cannot bypass the guard');
 assert.match(src,/onClick=\{\(\)=>void load\(true\)\}/,
   'load-more cannot bypass the guard');
 assert.match(src,/void load\(\);/,
   'initial mount fetch remains protected by the same gate');
});


test('unmount invalidates old inbox lock without letting its stale finally unlock a new fetch',()=>{
 const src=readFileSync(new URL('../src/components/SellerAccountInbox.tsx',import.meta.url),'utf8');
 assert.match(src,/const invalidateLifecycle=\(\)=>\{decisionLifetime\.current\+\+;epoch\.current\+\+;retry\.current\.clear\(\);seenCursors\.current\.clear\(\);\};/);
 assert.match(src,/return \(\)=>\{mounted\.current=false;invalidateLifecycle\(\);run\.current=false;/,
   'Strict Mode cleanup must release the old mount lock before refetch');
 assert.match(src,/if\(seq===epoch\.current\)\{run\.current=false;setBusy\(false\);\}/,
   'old in-flight request may not clear the new fetch lock');
 assert.match(src,/if\(seq!==epoch\.current\)return false;/,
   'stale response must never populate inbox after remount');
});

test('post-decision refresh preserves conflict and forbidden feedback until a fresh user refresh',()=>{
 const src=readFileSync(new URL('../src/components/SellerAccountInbox.tsx',import.meta.url),'utf8');
 assert.match(src,/run\.current=true;setBusy\(true\);if\(!afterDecision\)setMessage\(''\);/,
   'post-decision reload must not immediately clear outcome text');
 assert.match(src,/if\(outcome==='forbidden'\)setMessage\(t\.forbidden\);/);
 assert.match(src,/if\(outcome==='conflict'\)setMessage\(t\.conflict\);/);
 assert.match(src,/await load\(false,true\);/);
 assert.match(src,/setMessage\(t\.failed\);/,
   'a failed refresh must still override outcome with a truthful load failure');
});

test('seller decision completion cannot refresh a remounted or logged-out account inbox',()=>{
 const src=readFileSync(new URL('../src/components/SellerAccountInbox.tsx',import.meta.url),'utf8');
 assert.match(src,/const mounted=useRef\(false\);/);
 assert.match(src,/mounted\.current=true;/);
 assert.match(src,/return \(\)=>\{mounted\.current=false;invalidateLifecycle\(\);/);
 assert.match(src,/const decisionEpoch=decisionLifetime\.current;/);
 assert.match(src,/if\(!isCurrentSellerDecision\(mounted\.current,decisionEpoch,decisionLifetime\.current\)\)return;\s*if\(outcome==='unauthorized'\)/,
   'late successful response must not perform an account-scoped read');
 assert.match(src,/\}catch\{\s*if\(!isCurrentSellerDecision\(mounted\.current,decisionEpoch,decisionLifetime\.current\)\)return;/,
   'late network failures must not alter the next account view');
 assert.match(src,/finally\{if\(isCurrentSellerDecision\(mounted\.current,decisionEpoch,decisionLifetime\.current\)\)setPendingId\(null\);\}/);
});

test('post-write inbox refetch cannot strand seller decision pending state',()=>{
 const src=readFileSync(new URL('../src/components/SellerAccountInbox.tsx',import.meta.url),'utf8');
 assert.match(src,/const epoch=useRef\(0\);/,'fetches retain their own response epoch');
 assert.match(src,/const decisionLifetime=useRef\(0\);/,
   'seller decisions require a separate mount lifetime');
 assert.match(src,/const decisionEpoch=decisionLifetime\.current;/);
 assert.match(src,/await load\(false,true\);/,
   'post-decision refresh advances the fetch epoch');
 assert.match(src,/finally\{if\(isCurrentSellerDecision\(mounted\.current,decisionEpoch,decisionLifetime\.current\)\)setPendingId\(null\);\}/,
   'successful refresh must still release pendingId and re-enable seller actions');
 assert.doesNotMatch(src,/decisionEpoch[!=]==epoch\.current/,
   'fetch epoch must not gate decision completion or finally');
});

test('effect restarts clear private seller rows and stale pending action before reload',()=>{
 const src=readFileSync(new URL('../src/components/SellerAccountInbox.tsx',import.meta.url),'utf8');
 assert.match(src,/mounted\.current=true;\s*const lifetime=decisionLifetime\.current;[\s\S]*?Promise\.resolve\(\)\.then\(\(\)=>\{\s*if\(!isCurrentSellerDecision\(mounted\.current,lifetime,decisionLifetime\.current\)\)return;[\s\S]*?current\.current=null;setPage\(null\);setPendingId\(null\);setBlocked\(\{\}\);[\s\S]*?setMessage\(''\);setBusy\(false\);[\s\S]*?void load\(\);/,
   'locale or effect remount must not reuse private rows, disabled action state, or prior feedback');
 assert.match(src,/return \(\)=>\{mounted\.current=false;invalidateLifecycle\(\);/,
   'prior response/decision lifetimes must be invalidated on cleanup');
});

test('locale restart replaces an in-flight seller write gate before new inbox loading',()=>{
 const src=readFileSync(new URL('../src/components/SellerAccountInbox.tsx',import.meta.url),'utf8');
 assert.match(src,/decisionGate\.current=createSellerDecisionSingleFlight\(\);\s*void load\(\);/,
   'fresh account inbox fetch must not be blocked by a write from the old effect');
 assert.match(src,/return \(\)=>\{mounted\.current=false;invalidateLifecycle\(\);/,
   'cleanup must invalidate outstanding seller decision responses');
});
