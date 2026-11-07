import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../src/'+path,import.meta.url),'utf8');

test('seller decision BFF is opt-in, authenticated and rejects cross-site writes',()=>{
 const source=read('app/api/seller/requests/[id]/[action]/route.ts');
 assert.match(source,/SERVICES_WEB_ENABLE_SELLER_BFF/);
 assert.match(source,/sellerBffSameOrigin/);
 assert.match(source,/parseSellerDecisionBytes/);
 assert.match(source,/decideOwnSellerRequest/);
 assert.match(source,/ACCOUNT_WEB_COOKIE/);
 assert.match(source,/no-store/);
 assert.doesNotMatch(source,/NEXT_PUBLIC_.*TOKEN|localStorage|sessionStorage/);
});
test('seller workspace consumes only same-origin BFF and keeps retry keys',()=>{
 const source=read('components/SellerWorkspace.tsx');
 assert.match(source,/fetch\('\/api\/seller\/requests\?limit=50'/);
 assert.match(source,/credentials:'same-origin'/);
 assert.match(source,/pendingKeys\.current\.get\(key\)/);
 assert.match(source,/pendingKeys\.current\.set\(key,idempotencyKey\)/);
 assert.match(source,/SellerRequestList/);
 assert.doesNotMatch(source,/Authorization|localStorage|sessionStorage|NEXT_PUBLIC_BACKEND/);
});
test('seller workspace page is locale-checked and not cached',()=>{
 const source=read('app/[locale]/seller/requests/page.tsx');
 assert.match(source,/isLocale\(locale\)/);
 assert.match(source,/dynamic='force-dynamic'/);
 assert.match(source,/SellerWorkspace/);
});

test('seller workspace paginates without cursor loops or stale version rollback',()=>{
 const source=read('components/SellerWorkspace.tsx');
 assert.match(source,/cursor=\x27\+encodeURIComponent\(cursor\)/);
 assert.match(source,/seenCursors\.current\.has\(page\.next_cursor\)/);
 assert.match(source,/item\.version>old\.version/);
 assert.match(source,/current!==generation\.current/);
 assert.match(source,/onClick=\{\(\)=>void loadMore\(\)\}/);
});

test('seller workspace validates canonical dates and serializes pagination',()=>{
 const source=read('components/SellerWorkspace.tsx');
 assert.match(source,/new Date\(value\)\.toISOString\(\)===value/);
 assert.match(source,/!validDate\(r\.createdAt\)/);
 assert.match(source,/pageLock\.current=true/);
 assert.match(source,/if\(!cursor\|\|pageLock\.current\)return/);
 assert.match(source,/pageLock\.current=false/);
});

test('seller inbox refresh errors are observable to decision UI',()=>{
 const workspace=read('components/SellerWorkspace.tsx');
 const list=read('components/SellerRequestList.tsx');
 assert.match(workspace,/throw error;/);
 assert.match(workspace,/refreshLock\.current=true/);
 assert.match(workspace,/refreshLock\.current=false/);
 assert.match(workspace,/if\(!cursor\|\|pageLock\.current\|\|refreshLock\.current\)return/);
 assert.match(workspace,/void load\(\)\.catch\(\(\)=>\{\}\)/);
 assert.match(list,/await onRefresh\(\)/);
 assert.match(list,/__refresh:t\.error/);
 assert.match(list,/__refresh:''/);
});

test('paginated seller requests revoke local private data on expired session',()=>{
 const source=read('components/SellerWorkspace.tsx');
 const segment=source.split('const loadMore=useCallback')[1];
 assert.match(segment,/response\.status===401/);
 assert.match(segment,/setItems\(\[\]\);setCursor\(null\);setCsrf\(''\);setStatus\('unauthorized'\)/);
});
