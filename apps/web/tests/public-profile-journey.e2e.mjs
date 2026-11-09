import assert from 'node:assert/strict';

const webBase = process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3000';
const query = 'Stage 2 Journey';
const requestTimeoutMs = 10_000;

async function fetchPage(url, description) {
  console.log(`[journey] GET ${description}: ${url}`);
  let response;
  try {
    response = await fetch(url, {signal: AbortSignal.timeout(requestTimeoutMs)});
  } catch (error) {
    throw new Error(`${description} request failed at ${url}: ${error?.message ?? error}`, {cause: error});
  }
  const body = await response.text();
  assert.equal(response.status, 200,
    `${description} should render at ${url}; received ${response.status}; body: ${body.slice(0, 500)}`);
  assert.match(response.headers.get('content-type') ?? '', /text\/html/i,
    `${description} should return HTML at ${url}`);
  console.log(`[journey] OK ${description} (${response.status})`);
  return body;
}
// Fail early with the actual API status instead of a misleading missing-HTML assertion.
const apiBase = process.env.SERVICES_API_BASE_URL;
if (apiBase) {
  for (const [endpoint, expected] of [
    ['/search?q=Stage%202%20Journey&scope=global&kind=all', 'items'],
    ['/professionals/ci-stage2-specialist', 'offers'],
    ['/organizations/10000000-0000-4000-8000-000000000006', 'offers'],
  ]) {
    const url = new URL(apiBase.replace(/\/$/, '') + endpoint);
    console.log(`[journey] API preflight: ${url.pathname}`);
    const response = await fetch(url, {signal: AbortSignal.timeout(requestTimeoutMs)});
    const body = await response.text();
    assert.equal(response.status, 200,
      `API ${url.pathname} returned ${response.status}: ${body.slice(0, 500)}`);
    let payload;
    try { payload = JSON.parse(body); }
    catch { throw new Error(`API ${url.pathname} returned invalid JSON`); }
    assert.ok(payload && typeof payload === 'object' && expected in payload,
      `API ${url.pathname} missing ${expected}; body: ${body.slice(0, 500)}`);
    console.log(`[journey] API OK: ${url.pathname}`);
  }
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
assert.equal((kazakhSearchHtml.match(/<h1(?:\s|>)/g) ?? []).length, 1,
  'Kazakh search page should have one primary heading');
assert.match(kazakhSearchHtml, /Stage 2 Journey Specialist Offer/,
  'Kazakh search should render the specialist result');
assert.match(kazakhSearchHtml, /Stage 2 Journey Company Offer/,
  'Kazakh search should render the company result');
findHref(kazakhSearchHtml, '/kk/professionals/ci-stage2-specialist');
findHref(kazakhSearchHtml, '/kk/organizations/10000000-0000-4000-8000-000000000006');

const kazakhProfessionalHref = findHref(kazakhSearchHtml, '/kk/professionals/ci-stage2-specialist');
const kazakhProfessionalHtml = await fetchPage(
  new URL(kazakhProfessionalHref, webBase), 'Kazakh specialist profile');
assert.match(kazakhProfessionalHtml, /<html lang="kk">/);
assert.equal((kazakhProfessionalHtml.match(/<h1(?:\s|>)/g) ?? []).length, 1,
  'Kazakh specialist profile should have one primary heading');
assert.match(kazakhProfessionalHtml, /Stage 2 Journey Specialist Offer/);

const kazakhCompanyHref = findHref(
  kazakhSearchHtml, '/kk/organizations/10000000-0000-4000-8000-000000000006');
const kazakhCompanyHtml = await fetchPage(
  new URL(kazakhCompanyHref, webBase), 'Kazakh company profile');
assert.match(kazakhCompanyHtml, /<html lang="kk">/);
assert.equal((kazakhCompanyHtml.match(/<h1(?:\s|>)/g) ?? []).length, 1,
  'Kazakh company profile should have one primary heading');
assert.match(kazakhCompanyHtml, /Stage 2 Journey Company Offer/);


async function expectNotFound(path, description) {
  const response = await fetch(new URL(path, webBase), {
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  assert.equal(response.status, 404, `${description} must not be publicly visible`);
}

await expectNotFound('/ru/professionals/ci-stage2-unpublished', 'unknown specialist');
await expectNotFound(
  '/ru/organizations/10000000-0000-4000-8000-000000000099',
  'unknown company',
);
await expectNotFound('/kk/professionals/ci-stage2-unpublished', 'unknown Kazakh specialist');
await expectNotFound(
  '/kk/organizations/10000000-0000-4000-8000-000000000099',
  'unknown Kazakh company',
);

console.log('Live Kazakh/Russian search → specialist and company profiles: passed');
