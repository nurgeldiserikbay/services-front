import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('profile requests are server-only and never forward browser credentials',()=>{
 const source=readFileSync(new URL('../src/lib/public-profiles.ts',import.meta.url),'utf8');
 assert.match(source,/server-only/);
 assert.match(source,/cache:'no-store'/);
 assert.doesNotMatch(source,/Cookie:|Guest-Capability:|Authorization:/);
});
test('private data is not rendered in the public profile templates',()=>{
 for(const file of ['professionals/[slug]/page.tsx','organizations/[id]/page.tsx']){
  const s=readFileSync(new URL('../src/app/[locale]/'+file,import.meta.url),'utf8');
  assert.doesNotMatch(s,/ownerPersonId|person_id|privateAddress|encryptedValue/);
 }
});
