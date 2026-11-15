import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const robots=readFileSync(new URL('../src/app/robots.ts',import.meta.url),'utf8');

test('robots policy preserves crawlability of published catalog routes',()=>{
  assert.match(robots,/userAgent: '\*'/);
  for(const route of ['/kk/professionals/','/ru/professionals/',
    '/kk/organizations/','/ru/organizations/','/kk/services/','/ru/services/']){
    assert.ok(robots.includes("'"+route+"'"),route);
  }
  assert.doesNotMatch(robots,/disallow:\s*\['\/'\]/);
});

test('robots policy excludes private workspaces and PWA infrastructure',()=>{
  for(const route of ['/api','/api/','/_next/','/manifest.webmanifest','/kk/account','/kk/account/',
    '/ru/account','/ru/account/','/kk/seller','/kk/seller/',
    '/ru/seller','/ru/seller/','/offline.html','/sw.js']){
    assert.ok(robots.includes("'"+route+"'"),route);
  }
  assert.doesNotMatch(robots,/https?:\/\//);
});
