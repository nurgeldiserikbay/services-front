import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseSellerInboxPage} from '../src/lib/seller-inbox-ui-core.mjs';

const id='11111111-1111-4111-8111-111111111111';
const offer='22222222-2222-4222-8222-222222222222';
const seller='33333333-3333-4333-8333-333333333333';
const row={id,service_offer_id:offer,title:'Service',state:'pending',
  version:1,seller_kind:'professional',seller_id:seller,
  created_at:'2026-11-07T10:00:00.000Z',scheduled_start_at:null};

test('seller inbox parser accepts a bounded, contact-free page',()=>{
  assert.deepEqual(parseSellerInboxPage({items:[row],next_cursor:null}).items[0],row);
});
test('seller inbox parser fails closed on sensitive or malformed rows',()=>{
  for(const bad of [
    {...row,contact:'+77000000000'},
    {...row,note:'private'},
    {...row,state:'unknown'},
    {...row,version:0},
    {...row,created_at:'2026-02-30T10:00:00.000Z'},
    {...row,seller_id:'invalid'},
  ])assert.throws(()=>parseSellerInboxPage({items:[bad],next_cursor:null}));
  assert.throws(()=>parseSellerInboxPage({items:[row],next_cursor:'invalid+'}));
  assert.throws(()=>parseSellerInboxPage({items:[row],next_cursor:null,secret:'x'}));
});

test('seller inbox parser rejects duplicate request IDs in a page',()=>{
  assert.throws(()=>parseSellerInboxPage({items:[row,{...row,title:'duplicate'}],next_cursor:null}));
});
