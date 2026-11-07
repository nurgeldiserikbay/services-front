import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

/**
 * Regression for conflict between geography PR #3 and public-profile PR #4.
 * Both features must survive the merged discovery page and typed API.
 */
const read=(path)=>readFileSync(new URL('../src/'+path, import.meta.url),'utf8');

test('public discovery retains geographic selection and links to published profiles', () => {
  const page=read('app/[locale]/page.tsx');
  assert.match(page, /GeographyPicker/);
  assert.match(page, /country_id/);
  assert.match(page, /city_id/);
  assert.match(page, /searchPublicMarketplace\(q, scope, \{countryId, cityId\}, undefined, cursor\)/);
  assert.match(page, /\/professionals\//);
  assert.match(page, /\/organizations\//);
  assert.match(page, /encodeURIComponent\(item\.slug\)/);
  assert.match(page, /encodeURIComponent\(item\.id\)/);
});

test('server API retains location filters and rejects unauthenticated private data forwarding', () => {
  const api=read('lib/api.ts');
  assert.match(api, /country_id/);
  assert.match(api, /city_id/);
  assert.match(api, /slug\?: string \| null/);
  assert.match(api, /getPublicProfessional/);
  assert.match(api, /getPublicOrganization/);
  assert.match(api, /cache: 'no-store'/);
  assert.doesNotMatch(api, /headers:\s*\{[^}]*Cookie:/);
});

test('profile pages display public offers without losing region search entry point', () => {
  const profile=read('app/[locale]/professionals/[slug]/page.tsx');
  const organization=read('app/[locale]/organizations/[id]/page.tsx');
  const offers=read('components/PublicOffers.tsx');
  assert.match(profile, /PublicOffers/);
  assert.match(organization, /PublicOffers/);
  assert.match(profile, /getPublicProfessional/);
  assert.match(organization, /getPublicOrganization/);
  assert.match(offers, /offer\.title/);
  assert.doesNotMatch(profile+organization+offers, /ownerPersonId|encryptedValue|privateAddress/);
});
