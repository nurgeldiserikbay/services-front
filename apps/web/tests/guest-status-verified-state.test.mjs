import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {
 parsePrivateGuestStatus,readPrivateGuestStatusResponse,
} from '../src/lib/guest-status-ui-core.mjs';

const id=randomUUID(),offer=randomUUID();
const valid={id,service_offer_id:offer,state:'pending',version:1,
 created_at:'2026-11-07T11:02:03.004Z'};
const src=path=>readFileSync(new URL('../src/'+path,import.meta.url),'utf8');
test('guest request status only accepts real canonical UTC timestamp',async()=>{
 assert.equal(parsePrivateGuestStatus(valid,id,offer).createdAt,valid.created_at);
 for(const created_at of [
  '2026-02-30T11:02:03.004Z','2026-11-07T25:02:03.004Z',
  '2026-11-07 11:02:03','2026-11-07T11:02:03Z',
  '2026-11-07T11:02:03.004+00:00','2026-11-07T11:02:03.004Z\n',
  'not-a-timestamp',null,
 ]){
  assert.throws(()=>parsePrivateGuestStatus({...valid,created_at},id,offer),
   {message:'guest_status_unavailable'});
 }
 await assert.rejects(readPrivateGuestStatusResponse(
  new Response(JSON.stringify({...valid,created_at:'2026-02-30T11:02:03.004Z'}),{
   status:200,headers:{'Content-Type':'application/json'},
  }),id,offer));
});
test('guest status UI never assumes pending before verified private status',()=>{
 const check=src('components/GuestRequestStatusCheck.tsx');
 assert.match(check,/useState<PrivateGuestStatusState\|null>\(null\)/);
 assert.match(check,/version!==null&&state!==null\?t\.statuses\[state\]:t\.idle/);
 assert.match(check,/version!==null&&state!==null&&<>/);
 assert.match(check,/currentVersion\.current=null/);
 assert.match(check,/setVersion\(null\);setState\(null\);setError\(true\)/);
 assert.match(check,/Өтінімнің күйін көру үшін/);
 assert.match(check,/Нажмите «Обновить статус»/);
 assert.match(check,/readPrivateGuestStatusResponse/);
 assert.match(check,/result\.version>=currentVersion\.current/);
 assert.doesNotMatch(check,/setInterval|localStorage|sessionStorage|document\.cookie/);
});
