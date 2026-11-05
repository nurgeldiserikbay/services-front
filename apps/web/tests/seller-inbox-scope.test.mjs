import{test}from'node:test';
import assert from'node:assert/strict';
import{readFileSync}from'node:fs';
import{assertSellerInboxScope}from'../src/lib/seller-inbox-scope.mjs';

const id='a59e3b8b-72ae-4ed8-91f9-51484d5f8cf0';
const other='d31bfdea-5c21-45be-82b0-ec3b89cac042';
const identity={sellerKind:'professional',sellerId:id};
const row=(seller_id=id,seller_kind='professional')=>({
 id:other,seller_id,seller_kind,state:'pending'
});
test('same seller page passes through for subsequent strict wire parser',()=>{
 const page={items:[row()],next_cursor:null};
 assert.equal(assertSellerInboxScope(page,identity),page);
 assert.deepEqual(assertSellerInboxScope({items:[]},identity),{items:[]});
});
test('mixed seller or wrong seller-kind page fails closed',()=>{
 for(const page of [
  {items:[row(),row(other)]},
  {items:[row(id,'organization')]},
  {items:[null]},
  {items:{}},
  null,
  {items:Array.from({length:51},()=>row())},
 ]){
  assert.throws(()=>assertSellerInboxScope(page,identity),/Invalid seller inbox scope/);
 }
});
test('seller id validation rejects arbitrary client strings',()=>{
 assert.throws(()=>assertSellerInboxScope({items:[]},
  {sellerKind:'professional',sellerId:'any'}));
 assert.throws(()=>assertSellerInboxScope({items:[]},
  {sellerKind:'admin',sellerId:id}));
});
test('Next server boundary calls scope and allowlist parser, not raw UI',()=>{
 const src=readFileSync(new URL('../src/lib/seller-inbox-boundary.server.ts',import.meta.url),'utf8');
 assert.match(src,/import 'server-only'/);
 assert.match(src,/assertSellerInboxScope\(raw,input\.identity\)/);
 assert.match(src,/parseSellerInboxPage\(scoped\)/);
 assert.doesNotMatch(src,/cookies\(|localStorage|sessionStorage/);
});
