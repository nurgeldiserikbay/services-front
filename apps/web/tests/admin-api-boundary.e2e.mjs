import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';

// Run from Frontend CI against the checked-out, migrated Backend HTTP server.
// The admin endpoint must not become public as the Backend baseline advances.
const base='http://127.0.0.1:3101/v1/admin/moderation/cases';
const proof=randomBytes(32).toString('base64url');
for(const authorization of [undefined,'Bearer '+proof]){
 const response=await fetch(base,{
  headers:authorization?{Authorization:authorization}:{},
  redirect:'manual',
  signal:AbortSignal.timeout(5000),
 });
 assert.equal(response.status,401,'moderation API must be disabled by default');
 assert.match(response.headers.get('cache-control')??'',/\bno-store\b/i);
 assert.equal(response.headers.get('pragma'),'no-cache');
 assert.match(response.headers.get('x-robots-tag')??'',/\bnoindex\b/i);
 const body=await response.text();
 assert.ok(!body.includes(proof),'must not echo bearer proof');
 assert.ok(!body.includes('platform_admin_sessions'),'must not expose private schema');
}
console.log('Backend admin route remains private during frontend integration');
