import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fetchAccountNotifications,validateNotificationInbox,
 NotificationTransportUnavailable,NotificationTransportUnauthorized}
 from '../src/lib/account-notifications-transport.mjs';

const token='A'.repeat(43);
const record={id:randomUUID(),subject_id:randomUUID(),
 topic:'service_request.accepted',created_at:'2026-11-08T02:03:04.005Z'};
const response=(value,status=200,headers={})=>new Response(JSON.stringify(value),{
 status,headers:{'content-type':'application/json',...headers},
});
const call=(transport)=>fetchAccountNotifications({
 baseUrl:'https://backend.example.test/v1',accountBearer:token,limit:30,transport,
});
test('server notification transport validates strict schema and private backend fetch',async()=>{
 let url='',settings;
 const page=await call(async(u,init)=>{url=u;settings=init;return response({items:[record]});});
 assert.deepEqual(page,{items:[record]});
 assert.equal(url,'https://backend.example.test/v1/me/notifications?limit=30');
 assert.equal(settings.headers.Authorization,'Bearer '+token);
 assert.equal(settings.credentials,'omit');
 assert.equal(settings.cache,'no-store');
 assert.equal(settings.redirect,'manual');
 assert.equal(settings.method,'GET');
 for(const extra of [{...record,email:'private'}, {...record,topic:'<script>'},
  {...record,created_at:'2026-02-30T02:03:04.005Z'},
  {...record,id:'invalid'}]){
  assert.throws(()=>validateNotificationInbox({items:[extra]}),
   NotificationTransportUnavailable);
 }
 for(const other of [{items:[record],account:'secret'},{items:'wrong'},
  {items:Array(51).fill(record)}]){
  assert.throws(()=>validateNotificationInbox(other),NotificationTransportUnavailable);
 }
});
test('notification transport fails closed on revoked bearer, redirects and overlarge content',async()=>{
 await assert.rejects(call(async()=>response({code:'AUTH_REQUIRED'},401)),
  NotificationTransportUnauthorized);
 for(const answer of [
  new Response(null,{status:302,headers:{location:'https://elsewhere.test'}}),
  new Response('<html/>',{headers:{'content-type':'text/html'}}),
  response({items:[record]},200,{'content-length':'40000'}),
  response({items:[{...record,topic:'x'.repeat(40000)}]}),
 ]){
  await assert.rejects(call(async()=>answer),NotificationTransportUnavailable);
 }
 await assert.rejects(fetchAccountNotifications({
  baseUrl:'http://example.test',accountBearer:token,
 }),NotificationTransportUnavailable);
});
test('notification route and page are private, gated and backend revalidated',()=>{
 const read=p=>readFileSync(new URL('../src/'+p,import.meta.url),'utf8');
 const route=read('app/api/account/notifications/route.ts');
 const bridge=read('lib/account-notifications-bff.server.ts');
 const page=read('app/[locale]/account/notifications/page.tsx');
 const ui=read('components/AccountNotificationsInbox.tsx');
 assert.match(route,/SERVICES_WEB_ENABLE_ACCOUNT_NOTIFICATIONS/);
 assert.match(route,/sellerBffSameOrigin/);
 assert.match(route,/ACCOUNT_WEB_COOKIE/);
 assert.match(route,/getOwnAccountNotifications/);
 assert.match(route,/Cache-Control.*no-store/);
 assert.match(bridge,/readAccountWebSession/);
 assert.match(bridge,/fetchAccountNotifications/);
 assert.match(page,/getOwnAccountNotifications/);
 assert.match(page,/notFound\(\)/);
 assert.match(ui,/setItems\(null\)/);
 assert.match(ui,/credentials:'same-origin'/);
 assert.match(ui,/notificationTopicLabel\(locale,item.topic\)/);
 assert.match(ui,/readNotificationBrowserReply\(response\)/);
 assert.doesNotMatch(ui,/response\.text\(\)/);
 assert.doesNotMatch(route+bridge+page+ui,/localStorage|sessionStorage|NEXT_PUBLIC_.*TOKEN/);
});
