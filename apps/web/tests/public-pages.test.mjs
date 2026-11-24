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

test('public detail outage offers localized full-document retry without exposing private routes',()=>{
 const routes=[
  ['professionals/[slug]/page.tsx','professionals','slug'],
  ['organizations/[id]/page.tsx','organizations','id'],
  ['services/[id]/page.tsx','services','id'],
 ];
 for(const [route,segment,param] of routes){
  const source=readFileSync(new URL('../src/app/[locale]/'+route,import.meta.url),'utf8');
  assert.match(source,/role="alert"/,route+' must announce transient error');
  assert.match(source,/t\.retryDetail/,route+' must label retry accessibly');
  assert.ok(source.includes('href={`/${locale}/'+segment+'/\${encodeURIComponent('+param+')}`}')
    ||source.includes('href={`/${locale}/'+segment+'/\${encodeURIComponent('+param+')}`}}'),
    route+' must retry exactly the same public resource via full reload');
  assert.doesNotMatch(source,/onClick=\{.*(fetch|router\.refresh)/,
    'fallback must not initiate a private authenticated request');
 }
 const i18n=readFileSync(new URL('../src/lib/i18n.ts',import.meta.url),'utf8');
 assert.match(i18n,/retryDetail: 'Бетті қайта жүктеу'/);
 assert.match(i18n,/retryDetail: 'Перезагрузить страницу'/);
});
