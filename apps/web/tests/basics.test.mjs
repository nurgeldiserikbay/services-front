import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
const root = new URL('../src/', import.meta.url);
test('public search does not leak guest authentication', () => {
 const text=readFileSync(new URL('lib/api.ts',root),'utf8');
 assert.match(text,/cache: 'no-store'/);
 assert.doesNotMatch(text,/Authorization:|Guest-Capability|Cookie:/);
});
test('both initial languages exist', () => {
 const text=readFileSync(new URL('lib/i18n.ts',root),'utf8');
 assert.match(text,/\bkk:/);
 assert.match(text,/\bru:/);
});
