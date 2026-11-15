import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const manifest=readFileSync(new URL('../src/app/manifest.ts',import.meta.url),'utf8');
const icon=readFileSync(new URL('../src/app/icon.svg',import.meta.url),'utf8');

test('install metadata is same-origin, localized and scoped to the public catalog',()=>{
  assert.match(manifest,/start_url: '\/kk'/);
  assert.match(manifest,/scope: '\/'/);
  assert.match(manifest,/display: 'standalone'/);
  assert.match(manifest,/lang: 'kk'/);
  assert.match(manifest,/src: '\/icon.svg'/);
  assert.doesNotMatch(manifest,/https?:\/\//);
});

test('install icon is self-contained SVG without scripts or external assets',()=>{
  assert.match(icon,/<svg[^>]+viewBox="0 0 192 192"/);
  assert.doesNotMatch(icon,/<script|<foreignObject|<image|href=|url\(/i);
});
