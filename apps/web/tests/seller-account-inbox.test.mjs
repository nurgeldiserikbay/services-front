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
