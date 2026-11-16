import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const config = readFileSync(new URL('../next.config.ts',import.meta.url),'utf8');

test('public responses have protective headers without global deindexing',()=>{
  for(const name of ['X-Content-Type-Options','nosniff','Referrer-Policy',
    'X-Frame-Options','DENY','Permissions-Policy',
    'Cross-Origin-Opener-Policy','same-origin']){
    assert.ok(config.includes(name),name);
  }
  // Public pages must remain indexable; no-store is allowed for the two
  // PWA infrastructure files only, not the global /:path* header rule.
  const globalHeaders=config.split("source: '/:path*'")[1]?.split("...['kk','ru'].flatMap")[0]??'';
  assert.ok(globalHeaders.includes('...securityHeaders'), 'global header rule must be found');
  assert.doesNotMatch(globalHeaders,/X-Robots-Tag|noindex, nofollow|Cache-Control.*no-store/);
  assert.match(config,/source: '\/sw\.js'/);
  assert.match(config,/source: '\/offline\.html'/);
});

test('production CSP restricts framing, forms, resources and mixed content',()=>{
  for(const directive of ["default-src 'self'","object-src 'none'",
    "frame-ancestors 'none'","form-action 'self'","base-uri 'self'",
    "connect-src 'self'","worker-src 'self'","manifest-src 'self'",
    "upgrade-insecure-requests"]){
    assert.ok(config.includes(directive),directive);
  }
  assert.match(config,/process\.env\.NODE_ENV === 'production'/);
  assert.doesNotMatch(config,/unsafe-eval|default-src \*|connect-src \*/);
});


test('private account and seller workspaces have route-scoped no-store and noindex',()=>{
  assert.match(config,/\['kk','ru'\]\.flatMap\(locale=>\['account','seller'\]/);
  assert.match(config,/source: '\/'\+locale\+'\/'\+section\+'\/:path\*'/);
  assert.match(config,/Cache-Control', value: 'private, no-store, max-age=0'/);
  assert.match(config,/X-Robots-Tag', value: 'noindex, nofollow, noarchive'/);
});


test('offline fallback has route-scoped noindex, no-store and nosniff headers',()=>{
  const offlineHeaders=config.split("source: '/offline.html'")[1]??'';
  assert.ok(offlineHeaders.includes('headers:'),'offline HTTP header block must exist');
  assert.match(offlineHeaders,/Cache-Control', value: 'no-cache, no-store, must-revalidate'/);
  assert.match(offlineHeaders,/X-Robots-Tag', value: 'noindex, nofollow, noarchive'/);
  assert.match(offlineHeaders,/X-Content-Type-Options', value: 'nosniff'/);
});

test('private frontend BFF headers override the public referrer policy',()=>{
  assert.match(config,/\['guest-requests','seller','account'\]\.map\(section=>\(\{/);
  assert.match(config,/source: '\/api\/'\+section\+'\/:path\*'/);
  assert.match(config,/headers: \[\{key: 'Referrer-Policy', value: 'no-referrer'\}\]/);
  // The public baseline remains unchanged for indexable catalog pages.
  assert.match(config,/\{key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin'\}/);
});
