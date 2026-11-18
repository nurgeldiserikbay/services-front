import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../src/app/[locale]/account/'+path,import.meta.url),'utf8');
test('account home links to all enabled workspaces but preserves route gates',()=>{
 const page=read('page.tsx');
 assert.match(page,/SERVICES_WEB_ENABLE_SELLER_BFF==='enabled'&&process.env.SERVICES_WEB_ENABLE_SELLER_WORKSPACE==='enabled',path:'requests'/);
 assert.match(page,/SERVICES_WEB_ENABLE_ACCOUNT_NOTIFICATIONS==='enabled',path:'notifications'/);
 assert.match(page,/SERVICES_WEB_ENABLE_ACCOUNT_DEVICES_PAGE==='enabled',path:'devices'/);
 assert.match(page,/links.filter\(item=>item.enabled\)/);
});
test('each private child links back to account home only when both home gates are enabled',()=>{
 for(const path of ['requests/page.tsx','notifications/page.tsx','devices/page.tsx']){
  const page=read(path);
  assert.match(page,/SERVICES_WEB_ENABLE_ACCOUNT_HOME==='enabled'&&process.env.SERVICES_WEB_ENABLE_ACCOUNT_SESSION_BFF==='enabled'&&<Link href=\{'\/'\+locale\+'\/account'\}/);
 }
});
