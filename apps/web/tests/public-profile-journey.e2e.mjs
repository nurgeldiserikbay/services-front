import assert from 'node:assert/strict';

const webBase = process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3000';
const query = 'Stage 2 Journey';
const requestTimeoutMs = 10_000;

async function fetchPage(url, description) {
  const response = await fetch(url, {signal: AbortSignal.timeout(requestTimeoutMs)});
  assert.equal(response.status, 200, `${description} should render`);
  assert.match(response.headers.get('content-type') ?? '', /text\/html/i, `${description} should return HTML`);
  return response.text();
}
const searchUrl = new URL('/ru', webBase);
searchUrl.searchParams.set('q', query);

const searchHtml = await fetchPage(searchUrl, 'localized search page');
assert.match(searchHtml, /<html lang="ru">/, 'document language should match the Russian route');
assert.equal((searchHtml.match(/<h1(?:\s|>)/g) ?? []).length, 1, 'search page should have one primary heading');
assert.match(searchHtml, /<main class="shell">/, 'search content should have a main landmark');
assert.match(searchHtml, /<label for="query">[^<]+<\/label>/, 'search input should have a visible label');
assert.match(searchHtml, /<nav class="language" aria-label="Выбор языка">/, 'language navigation should have a localized accessible name');
assert.match(searchHtml, /Stage 2 Journey Specialist Offer/, 'search should render the real specialist result');
assert.match(searchHtml, /Stage 2 Journey Company Offer/, 'search should render the real company result');

function findHref(html, path) {
  const links = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
  const href = links.find((candidate) => {
    const url = new URL(candidate, webBase);
    return url.origin === new URL(webBase).origin && url.pathname === path;
  });
  assert.ok(href, `Expected same-origin link to ${path}`);
  return href;
}

const professionalHref = findHref(searchHtml, '/ru/professionals/ci-stage2-specialist');
assert.ok(professionalHref, 'search result should link to the specialist profile');
const professionalHtml = await fetchPage(new URL(professionalHref, webBase), 'specialist profile');
assert.match(professionalHtml, /<html lang="ru">/);
assert.equal((professionalHtml.match(/<h1(?:\s|>)/g) ?? []).length, 1, 'specialist page should have one primary heading');
assert.match(professionalHtml, /<main class="shell publicDetail">/);
assert.match(professionalHtml, /<h1>Stage 2 Journey Specialist<\/h1>/);
assert.match(professionalHtml, /Stage 2 Journey Specialist Offer/);
assert.match(professionalHtml, /<title>Stage 2 Journey Specialist — Services<\/title>/);

const companyHref = findHref(searchHtml, '/ru/organizations/10000000-0000-4000-8000-000000000006');
assert.ok(companyHref, 'search result should link to the company profile');
const companyHtml = await fetchPage(new URL(companyHref, webBase), 'company profile');
assert.match(companyHtml, /<html lang="ru">/);
assert.equal((companyHtml.match(/<h1(?:\s|>)/g) ?? []).length, 1, 'company page should have one primary heading');
assert.match(companyHtml, /<main class="shell publicDetail">/);
assert.match(companyHtml, /<h1>Stage 2 Journey Company<\/h1>/);
assert.match(companyHtml, /Stage 2 Journey Company Offer/);
assert.match(companyHtml, /<title>Stage 2 Journey Company — Services<\/title>/);


const kazakhSearchUrl = new URL('/kk', webBase);
kazakhSearchUrl.searchParams.set('q', query);
const kazakhSearchHtml = await fetchPage(kazakhSearchUrl, 'Kazakh localized search page');
assert.match(kazakhSearchHtml, /<html lang="kk">/, 'Kazakh route should declare its language');
assert.equal((kazakhSearchHtml.match(/<h1(?:\\s|>)/g) ?? []).length, 1,
  'Kazakh search page should have one primary heading');
assert.match(kazakhSearchHtml, /Stage 2 Journey Specialist Offer/,
  'Kazakh search should render the specialist result');
assert.match(kazakhSearchHtml, /Stage 2 Journey Company Offer/,
  'Kazakh search should render the company result');
findHref(kazakhSearchHtml, '/kk/professionals/ci-stage2-specialist');
findHref(kazakhSearchHtml, '/kk/organizations/10000000-0000-4000-8000-000000000006');

console.log('Live Kazakh/Russian search → specialist and company profiles: passed');
