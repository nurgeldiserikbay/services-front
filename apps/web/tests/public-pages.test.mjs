import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';

test('public page clients do not forward user credentials to API',()=>{
 const source=readFileSync(new URL('../src/lib/api.ts',import.meta.url),'utf8');
 assert.match(source,/cache: 'no-store'/);
 const section=source.slice(source.indexOf('async function readPublicResource'));
 assert.doesNotMatch(section,/headers:\s*\{[^}]*Cookie:|headers:\s*\{[^}]*Authorization:/);
 assert.match(section,/status === 404/);
});
test('published profile and organization pages use isolated routes',()=>{
 const prof=readFileSync(new URL('../src/app/[locale]/professionals/[slug]/page.tsx',import.meta.url),'utf8');
 const org=readFileSync(new URL('../src/app/[locale]/organizations/[id]/page.tsx',import.meta.url),'utf8');
 assert.match(prof,/getPublicProfessional/);
 assert.match(org,/getPublicOrganization/);
 assert.match(prof,/PublicOffers/);
 assert.match(org,/PublicOffers/);
});
