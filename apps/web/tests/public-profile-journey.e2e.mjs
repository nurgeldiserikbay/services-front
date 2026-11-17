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
    `${description} should render at ${url}; received ${response.status}`);
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
      `API ${url.pathname} returned HTTP ${response.status}`);
    let payload;
    try { payload = JSON.parse(body); }
    catch { throw new Error(`API ${url.pathname} returned invalid JSON`); }
    assert.ok(payload && typeof payload === 'object' && expected in payload,
      `API ${url.pathname} missing required ${expected} field`);
    console.log(`[journey] API OK: ${url.pathname}`);
  }
}

// Confirm the backend itself does not publish unknown resources, independent of
// Next.js streaming status codes and SEO handling.
if (apiBase) {
  for (const endpoint of [
    '/professionals/ci-stage2-unpublished',
    '/organizations/10000000-0000-4000-8000-000000000099',
  ]) {
    const url = new URL(apiBase.replace(/\/$/, '') + endpoint);
    const response = await fetch(url, {signal: AbortSignal.timeout(requestTimeoutMs)});
    assert.equal(response.status, 404,
      `Backend must not expose unknown public resource ${endpoint}; got ${response.status}`);
    console.log(`[journey] API hidden resource OK: ${endpoint} (404)`);
  }
}

// Exercise the real production Next.js BFF route, not just source-level
// feature-gate assertions. CI intentionally leaves guest creation disabled.
const disabledCreate = await fetch(new URL('/api/guest-requests', webBase), {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({service_offer_id: '10000000-0000-4000-8000-000000000007'}),
  signal: AbortSignal.timeout(requestTimeoutMs),
  redirect: 'manual',
});
assert.equal(disabledCreate.status, 404,
  'guest creation must be unavailable before explicit release approval');
assert.match(disabledCreate.headers.get('cache-control') ?? '', /no-store/,
  'private guest endpoint must never be cached');
assert.match(disabledCreate.headers.get('x-robots-tag') ?? '', /noindex/,
  'guest endpoint must not be indexed');
const disabledBody = await disabledCreate.text();
assert.doesNotMatch(disabledBody, /(?:request_capability|create_capability|csrf_token)/i,
  'disabled endpoint must not expose guest secrets');
console.log('[journey] guest creation remains default-off and non-cacheable');

// Installability metadata is public and must not expose authenticated data.
// This does not claim service-worker offline support or device acceptance.
const manifestResponse = await fetch(new URL('/manifest.webmanifest', webBase), {
  signal: AbortSignal.timeout(requestTimeoutMs),
});
assert.equal(manifestResponse.status, 200, 'PWA manifest must be available');
const installManifest = await manifestResponse.json();
assert.equal(installManifest.start_url, '/kk');
assert.equal(installManifest.scope, '/');
assert.equal(installManifest.display, 'standalone');
assert.ok(installManifest.icons?.some(icon => icon.src === '/icon.svg' && icon.type === 'image/svg+xml'));
const iconResponse = await fetch(new URL('/icon.svg', webBase), {
  signal: AbortSignal.timeout(requestTimeoutMs),
});
assert.equal(iconResponse.status, 200, 'PWA icon must be available');
assert.match(iconResponse.headers.get('content-type') ?? '', /image\/svg\+xml/i);
assert.match(await iconResponse.text(), /<svg[^>]+viewBox="0 0 192 192"/);
console.log('[journey] public PWA install metadata and icon verified');

// Offline fallback is a generic public shell. No authenticated or API data is cached.
for(const [path,expectedType,bodyPattern] of [
  ['/offline.html',/text\/html/i,/Нет подключения/],
  ['/sw.js',/javascript/i,/services-offline-shell-v1/],
]){
  const response=await fetch(new URL(path,webBase),{signal:AbortSignal.timeout(requestTimeoutMs)});
  assert.equal(response.status,200,path+' must be served by production frontend');
  assert.match(response.headers.get('content-type')??'',expectedType);
  assert.match(response.headers.get('cache-control')??'',/no-store/,
    path+' must be revalidated instead of served as stale HTTP cache');
  if(path==='/sw.js')assert.equal(response.headers.get('service-worker-allowed'),'/');
  if(path==='/offline.html'){
    assert.match(response.headers.get('x-robots-tag')??'',/noindex/,
      'offline fallback must not be indexed');
    assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  }
  const body=await response.text();
  assert.match(body,bodyPattern);
  if(path==='/offline.html'){
    assert.match(body,/<a href="\/kk">/);
    assert.match(body,/<a href="\/ru" lang="ru">/);
    assert.match(body,/<main id="main-content">/);
  }
}
console.log('[journey] offline shell assets available');

const robotsResponse=await fetch(new URL('/robots.txt',webBase),{
  signal:AbortSignal.timeout(requestTimeoutMs),
});
assert.equal(robotsResponse.status,200,'robots.txt must be served');
assert.match(robotsResponse.headers.get('content-type')??'',/text\/plain/i);
const robotsBody=await robotsResponse.text();
for(const route of ['/kk/account','/kk/account/','/ru/account','/ru/account/',
  '/kk/seller','/kk/seller/','/ru/seller','/ru/seller/',
  '/api','/api/','/_next/','/manifest.webmanifest','/offline.html','/sw.js']){
  assert.ok(robotsBody.includes('Disallow: '+route),'robots must exclude '+route);
}
assert.match(robotsBody,/Allow: \/kk\/professionals\//);
assert.match(robotsBody,/Allow: \/ru\/organizations\//);
console.log('[journey] public SEO robots policy excludes private routes');

// Route-scoped headers protect private workspace responses even when feature
// flags deny access and Next.js renders a 404.
for(const path of ['/kk/account','/ru/account','/kk/seller','/ru/seller',
  '/kk/account/requests','/ru/account/notifications','/kk/seller/requests']){
  const response=await fetch(new URL(path,webBase),{
    signal:AbortSignal.timeout(requestTimeoutMs),redirect:'manual',
  });
  assert.match(response.headers.get('cache-control')??'',/no-store/,
    path+' must not be cached');
  assert.match(response.headers.get('x-robots-tag')??'',/noindex/,
    path+' must not be indexed');
}
console.log('[journey] private workspace HTTP cache and index boundaries verified');

// Clear-all must be available for filter-only URLs, without a search query.
// The default unfiltered page must not show a redundant reset action.
for (const [locale, label] of [
  ['kk', 'Іздеуді және сүзгілерді тазарту'],
  ['ru', 'Очистить поиск и фильтры'],
]) {
  const pristine = await fetchPage(new URL('/' + locale, webBase),
    locale + ' unfiltered search');
  assert.doesNotMatch(pristine, /class="clearFilters"/,
    locale + ' must not display reset on the unfiltered landing page');

  const filteredUrl = new URL('/' + locale, webBase);
  filteredUrl.searchParams.set('delivery_mode', 'online');
  const filtered = await fetchPage(filteredUrl, locale + ' filter-only search');
  assert.ok(filtered.includes(`class="clearFilters" href="/${locale}">${label}</a>`),
    locale + ' filter-only page must offer a locale-preserving clear-all link');
  assert.doesNotMatch(filtered, /<li class="resultItem">/,
    locale + ' filter-only page must not fabricate search results');
}

const searchUrl = new URL('/ru', webBase);
searchUrl.searchParams.set('q', query);

const searchHeadersResponse=await fetch(searchUrl,{signal:AbortSignal.timeout(requestTimeoutMs)});
assert.equal(searchHeadersResponse.status,200);
const csp=searchHeadersResponse.headers.get('content-security-policy')??'';
assert.match(csp,/worker-src 'self'/,'PWA workers must be same-origin');
assert.match(csp,/manifest-src 'self'/,'PWA manifests must be same-origin');
assert.equal(searchHeadersResponse.headers.get('x-robots-tag'),null,'public pages must remain indexable');
const searchHtml = await fetchPage(searchUrl, 'localized search page');
assert.match(searchHtml, /<html lang="ru">/, 'document language should match the Russian route');
assert.match(searchHtml, /<form role="search" class="searchForm"/, 'search filters should expose a search landmark');
assert.match(searchHtml, /<meta name="theme-color" content="#167b72"/,
  'PWA browser theme must match the manifest');
assert.match(searchHtml, /<meta name="viewport" content="width=device-width, initial-scale=1"/,
  'PWA must render with a mobile viewport');
assert.equal((searchHtml.match(/<h1(?:\s|>)/g) ?? []).length, 1, 'search page should have one primary heading');
assert.match(searchHtml, /<main id="main-content" class="shell">/, 'search content should have a main landmark');
assert.match(searchHtml, /href="#main-content"/, 'localized keyboard skip link should be rendered');
assert.match(searchHtml, /<label for="query">[^<]+<\/label>/, 'search input should have a visible label');
assert.match(searchHtml, /<select[^>]+id="delivery_mode"[^>]+aria-label="Где окажут услугу\?"/, 'delivery filter must expose a Russian accessible name');
assert.match(searchHtml, /<nav class="language" aria-label="Выбор языка">/, 'language navigation should have a localized accessible name');
assert.match(searchHtml, /Stage 2 Journey Specialist Offer/, 'search should render the real specialist result');
assert.match(searchHtml, /Stage 2 Journey Company Offer/, 'search should render the real company result');
assert.match(searchHtml, /<a class="clearFilters" href="\/ru">Очистить поиск и фильтры<\/a>/,
  'Russian search reset should navigate to unfiltered localized search');
assertPageResultAnnouncement(searchHtml, 'ru');

function assertPageResultAnnouncement(html, locale) {
  // Assert the actual SSR output against the rendered result elements,
  // not an assumed total count or a mocked API fixture.
  const count = (html.match(/<li class="resultItem">/g) ?? []).length;
  assert.ok(count > 0, locale + ' search fixture should render results');
  const message = locale === 'kk'
    ? `Осы бетте ${count} нәтиже`
    : `На этой странице результатов: ${count}`;
  assert.ok(html.includes(message),
    locale + ' must announce its real current-page result count: ' + message);
}

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
assert.match(professionalHtml, /<main id="main-content" class="shell publicDetail">/);
assert.match(professionalHtml, /<h1>Stage 2 Journey Specialist<\/h1>/);
assert.match(professionalHtml, /Stage 2 Journey Specialist Offer/);
assert.match(professionalHtml, /<title>Stage 2 Journey Specialist — Services<\/title>/);

const companyHref = findHref(searchHtml, '/ru/organizations/10000000-0000-4000-8000-000000000006');
assert.ok(companyHref, 'search result should link to the company profile');
const companyHtml = await fetchPage(new URL(companyHref, webBase), 'company profile');
assert.match(companyHtml, /<html lang="ru">/);
assert.equal((companyHtml.match(/<h1(?:\s|>)/g) ?? []).length, 1, 'company page should have one primary heading');
assert.match(companyHtml, /<main id="main-content" class="shell publicDetail">/);
assert.match(companyHtml, /<h1>Stage 2 Journey Company<\/h1>/);
assert.match(companyHtml, /Stage 2 Journey Company Offer/);
assert.match(companyHtml, /<title>Stage 2 Journey Company — Services<\/title>/);


// Continue the real public journey from a seller profile to its published
// offer. The guest OTP/create wizard must remain disabled in CI by default.
for (const [locale, profileHtml, offerId, title] of [
  ['ru', professionalHtml, '10000000-0000-4000-8000-000000000007', 'Stage 2 Journey Specialist Offer'],
  ['ru', companyHtml, '10000000-0000-4000-8000-000000000008', 'Stage 2 Journey Company Offer'],
]) {
  const offerPath = `/${locale}/services/${offerId}`;
  const offerHref = findHref(profileHtml, offerPath);
  const offerHtml = await fetchPage(new URL(offerHref, webBase), `${locale} published offer`);
  assert.match(offerHtml, new RegExp(`<html lang="${locale}">`));
  assert.ok(offerHtml.includes(`<h1>${title}</h1>`), 'offer must show its published title');
  assert.ok(offerHtml.includes(`<title>${title} — Services</title>`),
    'offer must have a public SEO title');
  assert.doesNotMatch(offerHtml, /<form[^>]*class="[^"]*guest/i,
    'guest request form must not mount without explicitly enabled rollout gates');
}

// Validate the same offer journey in Kazakh, not just the search and
// seller profiles. This catches locale-specific broken offer links.
for (const [profilePath, offerId, title] of [
  ['/kk/professionals/ci-stage2-specialist', '10000000-0000-4000-8000-000000000007', 'Stage 2 Journey Specialist Offer'],
  ['/kk/organizations/10000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000008', 'Stage 2 Journey Company Offer'],
]) {
  const profileHtml = await fetchPage(new URL(profilePath, webBase), 'Kazakh offer-link source');
  const offerHref = findHref(profileHtml, `/kk/services/${offerId}`);
  const offerHtml = await fetchPage(new URL(offerHref, webBase), 'Kazakh published offer');
  assert.match(offerHtml, /<html lang="kk">/);
  assert.ok(offerHtml.includes(`<h1>${title}</h1>`),
    'Kazakh offer must show the real published title');
  assert.doesNotMatch(offerHtml, /<form[^>]*class="[^"]*guest/i,
    'guest form must remain disabled without explicit rollout gates');
}

// A deterministic nonsense term must exercise the real backend empty state.
// Both locales must announce emptiness without claiming a positive page count.
for (const [locale, emptyMessage] of [
  ['kk', 'Бұл сұрауға сәйкес нәтиже табылмады.'],
  ['ru', 'По вашему запросу ничего не найдено.'],
]) {
  const url = new URL('/' + locale, webBase);
  url.searchParams.set('q', 'ci-no-results-987654321012345');
  const html = await fetchPage(url, locale + ' empty search state');
  assert.ok(html.includes(emptyMessage),
    locale + ' empty search must show localized empty feedback');
  assert.doesNotMatch(html, /<li class="resultItem">/,
    locale + ' empty search must not render a result card');
  assert.doesNotMatch(html, locale === 'kk'
    ? /Осы бетте [1-9][0-9]* нәтиже/
    : /На этой странице результатов: [1-9][0-9]*/,
  locale + ' empty search must not announce positive result counts');
}

const kazakhSearchUrl = new URL('/kk', webBase);
kazakhSearchUrl.searchParams.set('q', query);
const kazakhSearchHtml = await fetchPage(kazakhSearchUrl, 'Kazakh localized search page');
assert.match(kazakhSearchHtml, /<html lang="kk">/, 'Kazakh route should declare its language');
assert.match(kazakhSearchHtml, /<select[^>]+id="delivery_mode"[^>]+aria-label="Қызмет көрсету орны"/, 'delivery filter must expose a Kazakh accessible name');
assert.equal((kazakhSearchHtml.match(/<h1(?:\s|>)/g) ?? []).length, 1,
  'Kazakh search page should have one primary heading');
assert.match(kazakhSearchHtml, /Stage 2 Journey Specialist Offer/,
  'Kazakh search should render the specialist result');
assert.match(kazakhSearchHtml, /Stage 2 Journey Company Offer/,
  'Kazakh search should render the company result');
assert.match(kazakhSearchHtml, /<a class="clearFilters" href="\/kk">Іздеуді және сүзгілерді тазарту<\/a>/,
  'Kazakh search reset should navigate to unfiltered localized search');
assertPageResultAnnouncement(kazakhSearchHtml, 'kk');
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
  const html = await response.text();
  // Next.js may return HTTP 200 after streaming has started even when
  // notFound() renders its 404 boundary. Require explicit noindex in that case.
  if (response.status === 200) {
    assert.match(html, /<meta[^>]+name="robots"[^>]+content="noindex"/i,
      `${description} streamed not-found page must be noindex`);
    assert.doesNotMatch(html, /class="publicDetailHero"/,
      `${description} must not expose a published profile`);
  } else {
    assert.equal(response.status, 404,
      `${description} must return 404 or a noindex streaming not-found page`);
  }
}

await expectNotFound('/ru/services/10000000-0000-4000-8000-000000000099', 'unknown Russian offer');
await expectNotFound('/kk/services/10000000-0000-4000-8000-000000000099', 'unknown Kazakh offer');
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
