import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  parsePrivateGuestStatus, readPrivateGuestStatusResponse, shouldReplaceGuestStatus,
} from '../src/lib/guest-status-ui-core.mjs';

const requestId='11111111-1111-4111-8111-111111111111';
const offerId='22222222-2222-4222-8222-222222222222';
const createdAt='2026-11-12T10:00:00.000Z';
const states=[
  'pending','accepted','declined','completed','expired',
  'cancelled_by_customer','cancelled_by_provider','cancelled_mutual',
];
const receipt=(state,version)=>({
  id:requestId,service_offer_id:offerId,state,version,created_at:createdAt,
});

test('all documented guest/seller decision and cancellation states preserve receipt isolation',()=>{
  for(const state of states){
    const result=parsePrivateGuestStatus(receipt(state,1),requestId,offerId);
    assert.deepEqual(result,{id:requestId,state,version:1,createdAt});
    assert.throws(()=>parsePrivateGuestStatus(receipt(state,1),requestId,
      '33333333-3333-4333-8333-333333333333'),/guest_status_unavailable/);
  }
});

test('out-of-order cancellation and seller decisions never regress a displayed status',()=>{
  for(const terminal of ['declined','completed','expired',
    'cancelled_by_customer','cancelled_by_provider','cancelled_mutual']){
    let version=null;
    let displayed=null;
    for(const payload of [
      receipt('pending',1),receipt('accepted',2),receipt(terminal,5),
      receipt('accepted',3),receipt('pending',1),receipt('declined',5),
    ]){
      const parsed=parsePrivateGuestStatus(payload,requestId,offerId);
      if(shouldReplaceGuestStatus(version,parsed.version)){
        version=parsed.version;
        displayed=parsed.state;
      }
    }
    assert.equal(version,5);
    assert.equal(displayed,terminal);
  }
});

test('private lifecycle transport rejects accidental sensitive fields in every state',async()=>{
  for(const state of states){
    const response=new Response(JSON.stringify({...receipt(state,3),contact_phone:'+77000000000'}),{
      status:200,headers:{'content-type':'application/json'},
    });
    await assert.rejects(readPrivateGuestStatusResponse(response,requestId,offerId),
      error=>error?.message==='guest_status_unavailable');
  }
});

test('unknown decision and cancellation state is denied rather than displayed',()=>{
  for(const state of ['cancelled','canceled_by_customer','refunded','reopened','APPROVED','']){
    assert.throws(()=>parsePrivateGuestStatus(receipt(state,2),requestId,offerId),
      /guest_status_unavailable/);
  }
});
