import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/api.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022},
}).outputText;
const {searchPublicMarketplace} = await import(
  'data:text/javascript;base64,' + Buffer.from(compiled).toString('base64')
);

test('public search always uses a bounded abort signal', async () => {
  const previousBase = process.env.SERVICES_API_BASE_URL;
  const previousFetch = globalThis.fetch;
  process.env.SERVICES_API_BASE_URL = 'https://api.example.test/v1';
  let observed;
  try {
    globalThis.fetch = async (_url, options) => {
      observed = options.signal;
      return {ok: true, json: async () => ({items: [], next_cursor: null})};
    };
    const result = await searchPublicMarketplace('plumber', 'global');
    assert.deepEqual(result, {items: [], next_cursor: null});
    assert.ok(observed instanceof AbortSignal);
    assert.equal(observed.aborted, false);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousBase === undefined) delete process.env.SERVICES_API_BASE_URL;
    else process.env.SERVICES_API_BASE_URL = previousBase;
  }
});

test('public search propagates caller cancellation to its network signal', async () => {
  const previousBase = process.env.SERVICES_API_BASE_URL;
  const previousFetch = globalThis.fetch;
  process.env.SERVICES_API_BASE_URL = 'https://api.example.test/v1';
  const controller = new AbortController();
  let observed;
  try {
    globalThis.fetch = async (_url, options) => {
      observed = options.signal;
      return {ok: true, json: async () => ({items: [], next_cursor: null})};
    };
    await searchPublicMarketplace('plumber', 'global', {}, controller.signal);
    controller.abort();
    assert.equal(observed.aborted, true);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousBase === undefined) delete process.env.SERVICES_API_BASE_URL;
    else process.env.SERVICES_API_BASE_URL = previousBase;
  }
});

test('public search rejects upstream HTTP errors without returning fake results', async () => {
  const previousBase = process.env.SERVICES_API_BASE_URL;
  const previousFetch = globalThis.fetch;
  process.env.SERVICES_API_BASE_URL = 'https://api.example.test/v1';
  try {
    globalThis.fetch = async () => ({ok: false, status: 503});
    await assert.rejects(
      searchPublicMarketplace('plumber', 'global'),
      /Public search unavailable/,
    );
  } finally {
    globalThis.fetch = previousFetch;
    if (previousBase === undefined) delete process.env.SERVICES_API_BASE_URL;
    else process.env.SERVICES_API_BASE_URL = previousBase;
  }
});

test('public search rejects malformed API responses', async () => {
  const previousBase = process.env.SERVICES_API_BASE_URL;
  const previousFetch = globalThis.fetch;
  process.env.SERVICES_API_BASE_URL = 'https://api.example.test/v1';
  try {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({items: [{kind: 'offer', id: 'id', title: 'Title'}], next_cursor: null}),
    });
    await assert.rejects(
      searchPublicMarketplace('plumber', 'global'),
      /Unexpected search response/,
    );
  } finally {
    globalThis.fetch = previousFetch;
    if (previousBase === undefined) delete process.env.SERVICES_API_BASE_URL;
    else process.env.SERVICES_API_BASE_URL = previousBase;
  }
});

test('public search enforces a five-second timeout budget', async () => {
  const previousBase = process.env.SERVICES_API_BASE_URL;
  const previousFetch = globalThis.fetch;
  const originalTimeout = AbortSignal.timeout;
  process.env.SERVICES_API_BASE_URL = 'https://api.example.test/v1';
  const durations = [];
  try {
    AbortSignal.timeout = (milliseconds) => {
      durations.push(milliseconds);
      return originalTimeout(milliseconds);
    };
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({items: [], next_cursor: null}),
    });
    await searchPublicMarketplace('plumber', 'global');
    assert.deepEqual(durations, [5000]);
  } finally {
    AbortSignal.timeout = originalTimeout;
    globalThis.fetch = previousFetch;
    if (previousBase === undefined) delete process.env.SERVICES_API_BASE_URL;
    else process.env.SERVICES_API_BASE_URL = previousBase;
  }
});
