import assert from 'node:assert/strict';

// Intentionally isolated production Next.js server with an unreachable HTTPS
// backend. Run this test only against that dedicated instance (port 3002).
const base = process.env.FAILURE_WEB_BASE_URL ?? 'http://127.0.0.1:3002';
const professionId = '10000000-0000-4000-8000-000000000003';
for(const [locale,label] of [
  ['kk','Қайта іздеу'],
  ['ru','Повторить поиск'],
]){
  const url = new URL('/'+locale,base);
  url.searchParams.set('q','Stage 2 Journey');
  url.searchParams.set('scope','global');
  url.searchParams.set('delivery_mode','online');
  url.searchParams.set('profession_id',professionId);
  const response=await fetch(url,{signal:AbortSignal.timeout(15000)});
  assert.equal(response.status,200,locale+' must render a public error state');
  const html=await response.text();
  assert.match(html,new RegExp('<html lang="'+locale+'">'));
  assert.doesNotMatch(html,/<li class="resultItem">/,
    locale+' backend failure must not fabricate search cards');
  const retry=html.match(/<a class="retrySearch" href="([^"]+)">([^<]+)<\/a>/);
  assert.ok(retry,locale+' must provide a native retry link on search failure');
  assert.equal(retry[2],label,locale+' must localize the retry action');
  const retryUrl=new URL(retry[1].replaceAll('&amp;','&'),base);
  assert.equal(retryUrl.pathname,'/'+locale);
  assert.equal(retryUrl.searchParams.get('q'),'Stage 2 Journey');
  assert.equal(retryUrl.searchParams.get('scope'),'global');
  assert.equal(retryUrl.searchParams.get('delivery_mode'),'online');
  assert.equal(retryUrl.searchParams.get('profession_id'),professionId);
  assert.equal(retryUrl.searchParams.get('cursor'),null);
  assert.match(html, /role="status" class="message"/,
    locale+' backend error should be exposed as a status announcement');
  console.log('[retry-e2e] '+locale+' isolated upstream failure and retry verified');
}
