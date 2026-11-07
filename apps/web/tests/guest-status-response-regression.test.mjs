import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  parsePrivateGuestStatus,privateGuestStatusUrl,readPrivateGuestStatusResponse,
  shouldReplaceGuestStatus,
} from '../src/lib/guest-status-ui-core.mjs';

const id='11111111-1111-4111-8111-111111111111';
const offer='22222222-2222-4222-8222-222222222222';
const payload={id,service_offer_id:offer,state:'accepted',version:2,
  created_at:'2026-11-07T10:00:00.000Z'};

test('private guest status accepts only matching committed receipt',()=>{
  assert.equal(privateGuestStatusUrl(id),'/api/guest-requests/'+id+'/status');
  assert.equal(parsePrivateGuestStatus(payload,id,offer).state,'accepted');
  for(const bad of [
    {...payload,id:offer},{...payload,service_offer_id:id},
    {...payload,version:0},{...payload,created_at:'2026-02-30T10:00:00.000Z'},
    {...payload,contact:'private'},{...payload,state:'unknown'},
  ])assert.throws(()=>parsePrivateGuestStatus(bad,id,offer));
});

test('private guest status rejects non-JSON, oversized and failed responses',async()=>{
  const good=()=>new Response(JSON.stringify(payload),{
    status:200,headers:{'content-type':'application/json'},
  });
  assert.equal((await readPrivateGuestStatusResponse(good(),id,offer)).version,2);
  for(const response of [
    new Response('{}',{status:403,headers:{'content-type':'application/json'}}),
    new Response(JSON.stringify(payload),{status:200,headers:{'content-type':'text/html'}}),
    new Response(JSON.stringify(payload),{status:200,headers:{
      'content-type':'application/json','content-length':'99999',
    }}),
  ])await assert.rejects(readPrivateGuestStatusResponse(response,id,offer));
});

test('guest status never regresses or overwrites equal-version result',()=>{
  assert.equal(shouldReplaceGuestStatus(null,1),true);
  assert.equal(shouldReplaceGuestStatus(1,2),true);
  assert.equal(shouldReplaceGuestStatus(2,2),false);
  assert.equal(shouldReplaceGuestStatus(2,1),false);
  assert.equal(shouldReplaceGuestStatus(2,0),false);
  assert.equal(shouldReplaceGuestStatus(2,1.5),false);
});
