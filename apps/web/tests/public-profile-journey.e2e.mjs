import assert from 'node:assert/strict';

const webBase = process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3000';
const query = 'Stage 2 Journey';
const searchUrl = new URL('/ru', webBase);
searchUrl.searchParams.set('q', query);

const searchResponse = await fetch(searchUrl);
assert.equal(searchResponse.status, 200, 'localized search page should render');
const searchHtml = await searchResponse.text();
assert.match(searchHtml, /<html lang="ru">/, 'document language should match the Russian route');
assert.match(searchHtml, /Stage 2 Journey Specialist Offer/, 'search should render the real specialist result');
assert.match(searchHtml, /Stage 2 Journey Company Offer/, 'search should render the real company result');

function findHref(html, path) {
  const links = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
  return links.find((href) => href.includes(path));
}

const professionalHref = findHref(searchHtml, '/ru/professionals/ci-stage2-specialist');
assert.ok(professionalHref, 'search result should link to the specialist profile');
const professionalResponse = await fetch(new URL(professionalHref, webBase));
assert.equal(professionalResponse.status, 200, 'specialist profile should render');
const professionalHtml = await professionalResponse.text();
assert.match(professionalHtml, /<html lang="ru">/);
assert.match(professionalHtml, /<h1>Stage 2 Journey Specialist<\/h1>/);
assert.match(professionalHtml, /Stage 2 Journey Specialist Offer/);
assert.match(professionalHtml, /<title>Stage 2 Journey Specialist — Services<\/title>/);

const companyHref = findHref(searchHtml, '/ru/organizations/10000000-0000-4000-8000-000000000006');
assert.ok(companyHref, 'search result should link to the company profile');
const companyResponse = await fetch(new URL(companyHref, webBase));
assert.equal(companyResponse.status, 200, 'company profile should render');
const companyHtml = await companyResponse.text();
assert.match(companyHtml, /<html lang="ru">/);
assert.match(companyHtml, /<h1>Stage 2 Journey Company<\/h1>/);
assert.match(companyHtml, /Stage 2 Journey Company Offer/);
assert.match(companyHtml, /<title>Stage 2 Journey Company — Services<\/title>/);

console.log('Live search → specialist and company profiles: passed');
