import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(
 new URL('../src/app/[locale]/account/devices/page.tsx',import.meta.url),'utf8');

test('device settings route is explicitly gated and always dynamically evaluated',()=>{
 assert.match(source,/SERVICES_WEB_ENABLE_ACCOUNT_DEVICES_PAGE/);
 assert.match(source,/SERVICES_WEB_ENABLE_ACCOUNT_SESSION_BFF/);
 assert.match(source,/dynamic='force-dynamic'/);
 assert.match(source,/revalidate=0/);
 assert.match(source,/isLocale\(locale\)/);
});
test('server revalidates the actual account bearer before rendering devices',()=>{
 assert.match(source,/await cookies\(\)/);
 assert.match(source,/ACCOUNT_WEB_COOKIE/);
 assert.match(source,/await getAccountWebSessions\(cookie\)/);
 assert.match(source,/catch\s*\{[\s\S]*?notFound\(\)/);
 assert.match(source,/<AccountDeviceSessions locale=\{locale\}\/>/);
});
test('private settings never trusts a client supplied user ID or bearer',()=>{
 assert.doesNotMatch(source,/localStorage|sessionStorage|headers\(\)|authorization|user_id|userId/i);
 assert.doesNotMatch(source,/cache:\s*'force-cache'|revalidate=\{[1-9]/);
 assert.match(source,/Каталогқа қайту/);
 assert.match(source,/Вернуться в каталог/);
});
