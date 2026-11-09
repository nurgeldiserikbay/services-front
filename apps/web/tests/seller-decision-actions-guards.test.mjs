import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const component=readFileSync(new URL('../src/components/SellerDecisionActions.tsx',import.meta.url),'utf8');

test('both seller decision buttons fail closed on invalid request context',()=>{
 assert.match(component,/if\(locked\.current\|\|!validContext\)return/);
 assert.match(component,/disabled=\{busy\|\|!validContext\} onClick=\{\(\)=>void submit\('accept'\)\}/);
 assert.match(component,/disabled=\{busy\|\|!validContext\} onClick=\{\(\)=>void submit\('decline'\)\}/);
});
