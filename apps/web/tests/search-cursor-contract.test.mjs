import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const api = readFileSync(new URL('../src/lib/api.ts', import.meta.url), 'utf8');
const page = readFileSync(new URL('../src/app/[locale]/page.tsx', import.meta.url), 'utf8');

test('public search accepts opaque keyset cursors and forwards profession IDs', () => {
  assert.match(api, /cursor\.length > 512/);
  assert.match(api, /data\.next_cursor\.length <= 512/);
  assert.match(api, /url\.searchParams\.set\('profession_id', professionId\.toLowerCase\(\)\)/);
  assert.match(api, /export async function getPublicProfessions\(\)/);
  assert.match(api, /value\.length > 2000/);
  assert.match(api, /typeof item\.code !== 'string'/);
  assert.doesNotMatch(api, /Number\(cursor\).*10000/);
});

test('marketplace preserves profession filters and follows the server cursor', () => {
  assert.match(page, /profession_id\?: string/);
  assert.match(page, /profession_id: rawProfessionId/);
  assert.match(page, /pageLink\(nextCursor\)/);
  assert.doesNotMatch(page, /Number\(cursor\) - 50/);
});

test('marketplace filter controls forward and preserve profession and delivery selections', () => {
  assert.match(api, /url\.searchParams\.set\('delivery_mode', deliveryMode\)/);
  assert.match(api, /url\.searchParams\.set\('profession_id', professionId\.toLowerCase\(\)\)/);
  assert.match(page, /getPublicProfessions\(\)/);
  assert.match(page, /name="profession_id"/);
  assert.match(page, /name="delivery_mode"/);
  assert.match(page, /query\.set\('delivery_mode', deliveryMode\)/);
  assert.match(page, /query\.set\('profession_id', professionId\)/);
});
