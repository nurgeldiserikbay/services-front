import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {
  parsePrivateGuestStatus,privateGuestStatusUrl,
  readPrivateGuestStatusResponse,MAX_STATUS_BYTES,
} from '../src/lib/guest-status-ui-core.mjs';

const read=p=>readFileSync(new URL('../src/'+p,import.meta.url),'utf8');
const id=randomUUID(),offer=randomUUID();
const good={
  id,service_offer_id:offer,state:'accepted',version:2,
  created_at:'2026-11-04T12:00:00.000Z',
};
const json=(raw,status=200,headers={})=>new Response(
  JSON.stringify(raw),{status,headers:{'content-type':'application/json',...headers}},
);
test('private status is accepted only for the exact committed request and offer',()=>{
  assert.deepEqual(parsePrivateGuestStatus(good,id,offer),{
    id,state:'accepted',version:2,createdAt:good.created_at,
  });
  assert.equal(privateGuestStatusUrl(id),'/api/guest-requests/'+id+'/status');
  for(const extra of [
    {...good,id:randomUUID()},
    {...good,service_offer_id:randomUUID()},
    {...good,state:'invalid'},
    {...good,version:0},
    {...good,contact:'+77001234567'},
    {...good,request_capability:'secret'},
    {...good,created_at:'invalid'},
    null,[],{},
  ])assert.throws(()=>parsePrivateGuestStatus(extra,id,offer));
  assert.throws(()=>privateGuestStatusUrl('/?request=secret'));
});
test('private status network response rejects redirect, oversized or unknown fields',async()=>{
  assert.equal((await readPrivateGuestStatusResponse(json(good),id,offer)).state,'accepted');
  const bad=[
    json(good,302),json(good,404),
    json(good,200,{'content-type':'text/html'}),
    json(good,200,{'content-length':String(MAX_STATUS_BYTES+1)}),
    json({...good,private_contact:'private'}),
    json({...good,state:'cancelled_by_customer',id:randomUUID()}),
  ];
  for(const response of bad)await assert.rejects(
    readPrivateGuestStatusResponse(response,id,offer));
});
test('receipt status check is manual-only, localized and default-off',()=>{
  const check=read('components/GuestRequestStatusCheck.tsx');
  const receipt=read('components/GuestRequestReceipt.tsx');
  const wizard=read('components/GuestRequestWizard.tsx');
  const adapter=read('components/ConnectedGuestRequestWizard.tsx');
  const page=read('app/[locale]/services/[id]/page.tsx');
  for(const marker of [
    'privateGuestStatusUrl(requestId)',
    'readPrivateGuestStatusResponse(',
    "credentials:'same-origin'",
    "cache:'no-store'",
    "redirect:'error'",
    'controller.current?.abort()',
    'role="status"',
    'aria-live="polite"',
    'Өтінімнің қазіргі күйі',
    'Текущий статус заявки',
  ])assert.ok(check.includes(marker),marker);
  assert.doesNotMatch(check,/setInterval|setTimeout|localStorage|sessionStorage|document.cookie|Guest-Capability/);
  assert.match(receipt,/statusEnabled&&serviceOfferId/);
  assert.match(wizard,/statusEnabled=\{statusEnabled\}/);
  assert.match(adapter,/statusEnabled=\{statusEnabled\}/);
  assert.match(page,/SERVICES_WEB_ENABLE_GUEST_STATUS_HTTP/);
  assert.match(page,/<ConnectedGuestRequestWizard/);
  assert.doesNotMatch(page,/Guest-Capability|request_capability/);
});
