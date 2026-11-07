import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const ui=readFileSync(new URL('../src/components/SellerWorkspace.tsx',import.meta.url),'utf8');

test('seller page reload fails closed for revoked accounts',()=>{
 const read=ui.split('const load=useCallback')[1].split('const loadMore=useCallback')[0];
 assert.match(read,/response\.status===401/);
 assert.match(read,/setItems\(\[\]\);setCursor\(null\);setCsrf\(''\);setStatus\('unauthorized'\)/);
 assert.match(read,/pendingKeys\.current\.clear\(\);seenCursors\.current\.clear\(\)/);
 assert.match(read,/setStatus\('error'\)/);
 assert.match(read,/seenCursors\.current\.clear\(\)/);
});
test('pagination failure clears stale private data while preserving regular retry keys',()=>{
 const paginate=ui.split('const loadMore=useCallback')[1].split('const decide=useCallback')[0];
 assert.match(paginate,/if\(!cursor\|\|pageLock\.current\|\|refreshLock\.current\)return/);
 assert.match(paginate,/response\.status===401/);
 assert.match(paginate,/pendingKeys\.current\.clear\(\);seenCursors\.current\.clear\(\)/);
 assert.match(paginate,/catch\{if\(current===generation\.current\)\{/);
 assert.match(paginate,/setItems\(\[\]\);setCursor\(null\);setCsrf\(''\);seenCursors\.current\.clear\(\)/);
 assert.match(paginate,/setStatus\('error'\);setMoreError\(true\)/);
 assert.doesNotMatch(paginate.split('}catch')[1],/pendingKeys\.current\.clear/);
});
test('decision 401 invalidates all seller-scoped state and pending nonce keys',()=>{
 const decide=ui.split('const decide=useCallback')[1];
 assert.match(decide,/if\(response\.status===401\)\{/);
 assert.match(decide,/generation\.current\+\+/);
 assert.match(decide,/setItems\(\[\]\);setCursor\(null\);setCsrf\(''\)/);
 assert.match(decide,/pendingKeys\.current\.clear\(\);seenCursors\.current\.clear\(\)/);
 assert.match(decide,/setStatus\('unauthorized'\)/);
 assert.match(decide,/return 'unauthorized' as const/);
 assert.match(decide,/pendingKeys\.current\.get\(key\)/);
 assert.match(decide,/pendingKeys\.current\.set\(key,idempotencyKey\)/);
 assert.doesNotMatch(decide,/localStorage|sessionStorage|Authorization|document\.cookie/);
});
