import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {readNotificationBrowserReply,notificationTopicLabel}
 from '../src/lib/account-notifications-ui.mjs';

const item={id:randomUUID(),subject_id:randomUUID(),
 topic:'service_request.accepted',created_at:'2026-11-08T02:03:04.005Z'};
const reply=(text,headers={})=>new Response(text,{
 status:200,headers:{'content-type':'application/json',...headers},
});
test('browser notification JSON reader accepts a small strict private response',async()=>{
 assert.deepEqual(await readNotificationBrowserReply(reply(JSON.stringify({items:[item]}))),
  {items:[item]});
});
test('browser notification reader rejects declared and actual unbounded responses',async()=>{
 await assert.rejects(readNotificationBrowserReply(reply(
  JSON.stringify({items:[item]}),{'content-length':'65536'})),/unavailable/);
 await assert.rejects(readNotificationBrowserReply(reply(
  JSON.stringify({items:[{...item,topic:'x'.repeat(40000)}]}))),/unavailable/);
 await assert.rejects(readNotificationBrowserReply(reply(
  JSON.stringify({items:[item]}),{'content-length':'not-a-number'})),/unavailable/);
});
test('browser notification reader rejects forged and invalid data',async()=>{
 for(const result of [
  reply('{invalid'),
  reply(JSON.stringify({items:[{...item,contact:'private'}]})),
  reply(JSON.stringify({items:[{...item,created_at:'2026-02-30T02:03:04.005Z'}]})),
  new Response('<html/>',{status:200,headers:{'content-type':'text/html'}}),
  new Response(new Uint8Array([0xff]),{headers:{'content-type':'application/json'}}),
  new Response(null,{status:302,headers:{location:'https://third-party.test'}}),
 ]){
  await assert.rejects(readNotificationBrowserReply(result),/unavailable/);
 }
});
test('known event titles are localized, unknown topics never shown raw',()=>{
 assert.equal(notificationTopicLabel('kk','service_request.accepted'),'Өтінім қабылданды');
 assert.equal(notificationTopicLabel('ru','service_request.declined'),'Заявка отклонена');
 assert.equal(notificationTopicLabel('kk','unknown.subject'),'Өтінім бойынша жаңалық');
 assert.equal(notificationTopicLabel('ru','<script>alert(1)</script>'),'Обновление по заявке');
 assert.equal(notificationTopicLabel('en','service_request.accepted'),'');
});
test('account pages cross-link only when related private feature is enabled',()=>{
 const read=p=>readFileSync(new URL('../src/app/[locale]/account/'+p+'/page.tsx',import.meta.url),'utf8');
 const seller=read('requests'),notifications=read('notifications');
 assert.match(seller,/SERVICES_WEB_ENABLE_ACCOUNT_NOTIFICATIONS==='enabled'/);
 assert.match(seller,/account\/notifications/);
 assert.match(notifications,/SERVICES_WEB_ENABLE_SELLER_WORKSPACE==='enabled'/);
 assert.match(notifications,/account\/requests/);
});
