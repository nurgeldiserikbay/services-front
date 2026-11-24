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
 assert.match(src,/finally\{setPendingId\(null\);\}/);
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
