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
test('browser notification reader cancels oversized and nonbyte response streams',async()=>{
 for(const invalidChunk of [false,true]){
  let cancelled=false;
  let produced=0;
  const stream=new ReadableStream({
   pull(controller){
    produced++;
    controller.enqueue(invalidChunk?'invalid-chunk':new Uint8Array(8192));
   },
   cancel(){cancelled=true;},
  });
  await assert.rejects(readNotificationBrowserReply({
   status:200,headers:new Headers({'content-type':'application/json'}),body:stream,
  }),/unavailable/);
  assert.equal(cancelled,true,'bad browser response stream must be cancelled');
  assert.ok(produced<=7,'unbounded browser stream must not be fully consumed');
 }
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
test('private notification refresh hides stale account data before revalidation',()=>{
 const source=readFileSync(new URL('../src/components/AccountNotificationsInbox.tsx',import.meta.url),'utf8');
 const start=source.indexOf('const load=useCallback(async()=>{');
 const request=source.indexOf("fetch('/api/account/notifications'",start);
 const clear=source.indexOf('setItems(null)',start);
 assert.ok(start>=0&&clear>start&&request>clear,
  'refresh must clear stale private notification rows before fetching');
 assert.match(source,/if\(current===generation\.current\)setItems\(result\.items\)/,
  'only current request may render revalidated notifications');
 assert.match(source,/if\(current===generation\.current\)\{\s*setItems\(null\)/,
  'authorization and transport failures must leave no stale notifications');
});

test('notification lifecycle cancels obsolete requests without unlocking a replacement',()=>{
 const source=readFileSync(new URL('../src/components/AccountNotificationsInbox.tsx',import.meta.url),'utf8');
 assert.match(source,/const active=useRef<AbortController\|null>\(null\)/);
 assert.match(source,/if\(active\.current\)return;/);
 assert.match(source,/AbortSignal\.any\(\[controller\.signal,AbortSignal\.timeout\(8000\)\]\)/);
 assert.match(source,/if\(active\.current===controller\)active\.current=null/);
 assert.match(source,/generation\.current\+\+;\s*const previous=active\.current;\s*active\.current=null;\s*previous\?\.abort\(\)/);
 assert.match(source,/if\(current===generation\.current\)setBusy\(false\)/);
});

test('account pages cross-link only when related private feature is enabled',()=>{
 const read=p=>readFileSync(new URL('../src/app/[locale]/account/'+p+'/page.tsx',import.meta.url),'utf8');
 const seller=read('requests'),notifications=read('notifications');
 assert.match(seller,/SERVICES_WEB_ENABLE_ACCOUNT_NOTIFICATIONS==='enabled'/);
 assert.match(seller,/account\/notifications/);
 assert.match(notifications,/SERVICES_WEB_ENABLE_SELLER_WORKSPACE==='enabled'/);
 assert.match(notifications,/account\/requests/);
});
