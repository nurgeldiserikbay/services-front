import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const css=readFileSync(new URL('../src/app/globals.css',import.meta.url),'utf8');

test('small screens have a single-column result grid and wrapping navigation',()=>{
  assert.match(css,/@media\(max-width:550px\)/);
  assert.match(css,/\.resultList\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(css,/\.header nav\{width:100%;justify-content:flex-start\}/);
  assert.match(css,/\.header\{height:auto;min-height:70px;padding-block:12px;flex-wrap:wrap\}/);
});

test('long content and interactive controls remain usable on narrow screens',()=>{
  assert.match(css,/\.resultItem,\.offerDetail,\.message\{min-width:0;overflow-wrap:anywhere\}/);
  assert.match(css,/\.searchRow input,\.searchRow button\{min-height:44px\}/);
  assert.match(css,/\.geoControls select,\.geoControls input/);
  assert.match(css,/\.searchRow button\{width:100%\}/);
});
