import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';

// Production-built Next.js responses, not configuration source inspection.
// Private account features are default-off on :3000 and deliberately enabled
// without a trusted login on :3001. No user or staging credentials are used.
const bases=[
  {label:'default-off',url:process.env.WEB_BASE_URL??'http://127.0.0.1:3000'},
  {label:'feature-enabled without login',url:process.env.PRIVATE_BFF_TEST_BASE_URL??'http://127.0.0.1:3001'},
];
const paths=['/kk/account/requests','/ru/account/requests',
  '/kk/account/notifications','/ru/account/notifications',
  '/kk/account/devices','/ru/account/devices'];
const forged=randomBytes(24).toString('base64url');

for(const base of bases){
  for(const path of paths){
    for(const withCookie of [false,true]){
      const response=await fetch(new URL(path,base.url),{
        method:'GET',
        redirect:'manual',
        credentials:'omit',
        headers:withCookie?{Cookie:'__Host-services_account_web='+forged}:{},
        signal:AbortSignal.timeout(10000),
      });
      assert.equal(response.status,404,
        base.label+' '+path+' must not show private workspace without verified login');
      const cache=response.headers.get('cache-control')??'';
      const robots=response.headers.get('x-robots-tag')??'';
      assert.match(cache,/\bprivate\b/i,path+' must be private');
      assert.match(cache,/\bno-store\b/i,path+' must forbid shared/private cache storage');
      assert.match(robots,/\bnoindex\b/i,path+' must not be indexed');
      assert.match(robots,/\bnofollow\b/i,path+' must not be crawled');
      assert.equal(response.headers.get('set-cookie'),null,
        path+' must not issue session cookies on denied workspace');
      // An HTML not-found response is permissible but must never echo forged
      // proof or display the protected inbox/workspace UI.
      const body=await response.text();
      assert.ok(body.length<256*1024,path+' denied response unusually large');
      assert.ok(!body.includes(forged),path+' echoed forged session cookie');
      console.log('[private-workspace] '+base.label+' '+path+
        (withCookie?' forged-cookie':' cookie-free')+' denied with no-store/noindex');
    }
  }
}
console.log('Private workspace live HTTP denial and cache isolation PASS; manual staging sign-off still pending.');
