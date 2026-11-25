import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readScheduleProposalReceipt} from '../src/lib/customer-schedule-ui-core.mjs';
const id='123e4567-e89b-42d3-a456-426614174000';
const body={start_at:'2027-01-01T05:00:00.000Z',end_at:'2027-01-01T06:00:00.000Z',timezone:'Asia/Almaty'};
test('seller proposal receipt is bound to the expected actor',async()=>{
 const receipt={...body,id:'123e4567-e89b-42d3-a456-426614174001',request_id:id,request_version:2,revision:1,status:'proposed',initiator:'seller',replayed:false};
 const json=()=>new Response(JSON.stringify(receipt),{status:201,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 assert.equal(await readScheduleProposalReceipt(json(),id,1,body,'seller'),true);
 assert.equal(await readScheduleProposalReceipt(json(),id,1,body),false);
});
test('seller scheduling is default-off, same-origin and version scoped',()=>{
 const read=p=>readFileSync(new URL('../src/'+p,import.meta.url),'utf8');
 const route=read('app/api/account/requests/[id]/schedule-proposals/active/route.ts');
 assert.match(route,/SERVICES_WEB_ENABLE_ACCOUNT_SCHEDULE!=='enabled'/);
 assert.match(route,/sec-fetch-site'\)!=='same-origin'/);
 assert.match(route,/private, no-store/);
 const panel=read('components/SellerSchedulePanel.tsx');
 assert.match(panel,/row\.request_version!==version/);
 assert.match(panel,/row\.actor!=='seller'/);
 assert.match(panel,/actor="seller"/);
 const inbox=read('components/SellerAccountInbox.tsx');
 assert.match(inbox,/canSchedule&&item\.state==='accepted'/);
 assert.match(inbox,/onChanged=\{\(\)=>\{void load\(\);\}\}/);
});
