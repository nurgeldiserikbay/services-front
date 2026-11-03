import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
test('browser geography proxy never forwards cookies or credentials',()=>{
  const source=readFileSync(new URL('../src/app/api/geography/[kind]/route.ts',import.meta.url),'utf8');
  assert.match(source,/cache:'no-store'/);
  assert.doesNotMatch(source,/req\.headers\.get\(['"]cookie|headers:\s*req\.headers|Authorization:/);
});
test('country/city selection submits scoped location IDs',()=>{
  const source=readFileSync(new URL('../src/components/GeographyPicker.tsx',import.meta.url),'utf8');
  assert.match(source,/name="country_id"/);
  assert.match(source,/name="city_id"/);
  assert.match(source,/name="scope"/);
});
