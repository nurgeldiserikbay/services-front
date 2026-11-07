import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SellerClientAuthenticationRequired,SellerClientUnavailable,loadSellerInbox}
 from '../src/lib/seller-bff-client.mjs';

const src=path=>readFileSync(new URL('../src/'+path,import.meta.url),'utf8');
test('seller inbox distinguishes expired account from backend outage',async()=>{
 await assert.rejects(loadSellerInbox({
  transport:async()=>new Response(null,{status:401}),
 }),SellerClientAuthenticationRequired);
 for(const status of [403,404,429,503]){
  await assert.rejects(loadSellerInbox({
   transport:async()=>new Response(null,{status}),
  }),SellerClientUnavailable);
 }
});
test('seller workspace is default-off and backend validates live seller bearer before render',()=>{
 const page=src('app/[locale]/account/requests/page.tsx');
 assert.match(page,/SERVICES_WEB_ENABLE_SELLER_BFF/);
 assert.match(page,/SERVICES_WEB_ENABLE_SELLER_WORKSPACE/);
 assert.match(page,/dynamic='force-dynamic'/);
 assert.match(page,/revalidate=0/);
 assert.match(page,/isLocale\(locale\)/);
 assert.match(page,/await cookies\(\)/);
 assert.match(page,/ACCOUNT_WEB_COOKIE/);
 assert.match(page,/await getOwnSellerInbox\(cookie,\{limit:1,state:null,cursor:null\}\)/);
 assert.match(page,/catch\s*\{[\s\S]*?notFound\(\)/);
 assert.match(page,/<SellerAccountInbox locale=\{locale\}\/>/);
 assert.doesNotMatch(page,/Authorization|localStorage|sessionStorage|userId|user_id/);
});
test('seller inbox clears stale private state when session ends',()=>{
 const ui=src('components/SellerAccountInbox.tsx');
 assert.match(ui,/SellerClientAuthenticationRequired/);
 assert.match(ui,/current\.current=null;setPage\(null\);retry\.current\.clear\(\)/);
 assert.match(ui,/outcome==='unauthorized'/);
 assert.match(ui,/Сессия аяқталды/);
 assert.match(ui,/Сессия завершена/);
 assert.match(ui,/retry\.current\.get\(key\)/);
 assert.match(ui,/retry\.current\.delete\(key\)/);
 assert.doesNotMatch(ui,/Authorization|localStorage|sessionStorage|document\.cookie/);
});
