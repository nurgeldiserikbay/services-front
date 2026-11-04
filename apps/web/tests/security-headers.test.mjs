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
  assert.doesNotMatch(config,/X-Robots-Tag|noindex, nofollow|Cache-Control.*no-store/);
});

test('production CSP restricts framing, forms, resources and mixed content',()=>{
  for(const directive of ["default-src 'self'","object-src 'none'",
    "frame-ancestors 'none'","form-action 'self'","base-uri 'self'",
    "connect-src 'self'","upgrade-insecure-requests"]){
    assert.ok(config.includes(directive),directive);
  }
  assert.match(config,/process\.env\.NODE_ENV === 'production'/);
  assert.doesNotMatch(config,/unsafe-eval|default-src \*|connect-src \*/);
});
