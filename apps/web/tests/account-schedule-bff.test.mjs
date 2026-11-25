import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/lib/account-schedule-route.server.ts',import.meta.url),'utf8');
const bff=readFileSync(new URL('../src/lib/account-session-bff.server.ts',import.meta.url),'utf8');
test('schedule BFF is default-off, authenticates cookie and CSRF before forwarding',()=>{
 assert.match(source,/SERVICES_WEB_ENABLE_ACCOUNT_SESSION_BFF!=='enabled'/);
 assert.match(source,/SERVICES_WEB_ENABLE_ACCOUNT_SCHEDULE!=='enabled'/);
 assert.match(source,/request\.cookies\.get\(ACCOUNT_WEB_COOKIE\)/);
 assert.match(source,/x-services-csrf/);
 assert.match(source,/authenticateAccountWebMutation\(auth\)/);
 assert.ok(source.indexOf('authenticateAccountWebMutation(auth)')<source.indexOf('await mutateAccountSchedule'));
 assert.match(source,/request\.headers\.has\('authorization'\)/);
 assert.match(source,/request\.headers\.has\('guest-capability'\)/);
 assert.match(bff,/accountBearer:auth\.accountBearer,requestId:input\.requestId/);
});
test('schedule BFF limits body, versions, keys and sanitizes uncertain outcomes',()=>{
 assert.match(source,/readBody\(request,action==='propose'\?1024:2\)/);
 assert.match(source,/bytes>limit/);
 assert.match(source,/2147483646/);
 assert.match(source,/KEY\.test\(key\)/);
 assert.match(source,/private, no-store/);
 assert.match(source,/reply\(503,'UNAVAILABLE'\)/);
 assert.match(source,/result\.receipt/);
 for(const [suffix,action] of [['','propose'],['[proposalId]/confirm/','confirm'],['[proposalId]/decline/','decline']]){
  const route=readFileSync(new URL('../src/app/api/account/requests/[id]/schedule-proposals/'+suffix+'route.ts',import.meta.url),'utf8');
  assert.match(route,/force-dynamic/);
  assert.match(route,/revalidate=0/);
  assert.ok(route.includes("handleAccountSchedule(request,id,'"+action+"'"));
 }
});
