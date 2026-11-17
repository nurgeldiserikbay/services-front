import assert from 'node:assert/strict';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {validateStagingOrigin,checkPublicStaging} from '../../../scripts/check-staging-public.mjs';

const allowed='staging.example.kz';
const origin='https://'+allowed;
const templates={
  '/kk':['text/html; charset=utf-8','<html lang="kk"><main id="main-content"><h1>Қызметтер</h1></main></html>'],
  '/ru':['text/html; charset=utf-8','<html lang="ru"><main id="main-content"><h1>Услуги</h1></main></html>'],
  '/manifest.webmanifest':['application/manifest+json',JSON.stringify({
    start_url:'/kk',scope:'/',display:'standalone',icons:[{src:'/icon.svg'}],
  })],
  '/icon.svg':['image/svg+xml','<svg viewBox="0 0 192 192"></svg>'],
  '/offline.html':['text/html','<a href="/kk">Қазақша</a><a href="/ru">Русский</a>'],
  '/sw.js':['application/javascript','self.addEventListener("fetch",()=>{})'],
};

function mockedFetch(overrides={}){
  const visited=[];
  const fetchImpl=async(url,opts)=>{
    visited.push({path:url.pathname,opts});
    const [type,body]=templates[url.pathname];
    const data=overrides[url.pathname]??{};
    return new Response(data.body??body,{
      status:data.status??200,
      headers:{'content-type':data.type??type,
        ...(url.pathname==='/offline.html'?{'cache-control':'no-store','x-robots-tag':'noindex'}:{}),
        ...(url.pathname==='/sw.js'?{'cache-control':'no-store','service-worker-allowed':'/'}:{}),
        'x-content-type-options':'nosniff',
        'x-frame-options':'DENY',
        'cross-origin-opener-policy':'same-origin',
        'referrer-policy':'strict-origin-when-cross-origin',
        'permissions-policy':'camera=(), microphone=(), geolocation=()',
        'content-security-policy':[
          "default-src 'self'","object-src 'none'","base-uri 'self'",
          "form-action 'self'","frame-ancestors 'none'",
          "upgrade-insecure-requests",
        ].join('; '),
        ...data.headers,
      },
    });
  };
  return {fetchImpl,visited};
}

test('staging origin requires exact approved public HTTPS hostname and no user info',()=>{
  assert.equal(validateStagingOrigin(origin,allowed),origin);
  for(const candidate of [
    'http://staging.example.kz','https://localhost','https://127.0.0.1',
    'https://staging.example.kz.evil.com','https://user:pw@staging.example.kz',
    'https://staging.example.kz/kk','https://staging.example.kz/?token=abc',
    'https://staging.example.kz/#anchor','https://staging.example.kz:444',
  ]){
    assert.throws(()=>validateStagingOrigin(candidate,allowed),candidate);
  }
  assert.throws(()=>validateStagingOrigin(origin,undefined));
  assert.throws(()=>validateStagingOrigin('https://internal.local','internal.local'));
});

test('read-only staging smoke verifies both locales and public install/offline assets',async()=>{
  const {fetchImpl,visited}=mockedFetch();
  const result=await checkPublicStaging(origin,{fetchImpl});
  assert.equal(result.kind,'public-staging-readiness-only');
  assert.equal(result.checked.length,6);
  assert.deepEqual(visited.map(x=>x.path),[
    '/kk','/ru','/manifest.webmanifest','/icon.svg','/offline.html','/sw.js',
  ]);
  for(const {opts} of visited){
    assert.equal(opts.method,'GET');
    assert.equal(opts.redirect,'manual');
    assert.equal(opts.credentials,'omit');
    assert.equal(opts.signal.aborted,false);
  }
  assert.match(result.disclaimer,/NOT authentication/);
});

test('staging smoke refuses redirects, broken localization and missing privacy headers',async()=>{
  for(const overrides of [
    {'/kk':{status:302}},
    {'/ru':{body:'<html lang="kk"><main id="main-content"><h1>wrong</h1></main></html>'}},
    {'/manifest.webmanifest':{body:JSON.stringify({start_url:'/ru',scope:'/',display:'standalone',icons:[]})}},
    {'/offline.html':{headers:{'cache-control':'public, max-age=120'}}},
    {'/sw.js':{headers:{'service-worker-allowed':'/nested/'}}},
    {'/kk':{headers:{'content-security-policy':"default-src 'self'; object-src 'none'"}}},
    {'/ru':{headers:{'x-frame-options':'SAMEORIGIN'}}},
    {'/manifest.webmanifest':{headers:{'x-content-type-options':'off'}}},
    {'/icon.svg':{headers:{'cross-origin-opener-policy':'unsafe-none'}}},
    {'/offline.html':{headers:{'referrer-policy':'unsafe-url'}}},
    {'/sw.js':{headers:{'permissions-policy':'camera=(self), microphone=(), geolocation=()'}}},
  ]){
    await assert.rejects(checkPublicStaging(origin,{fetchImpl:mockedFetch(overrides).fetchImpl}));
  }
});

test('large public response is rejected without reading unlimited bytes',async()=>{
  const {fetchImpl}=mockedFetch({'/kk':{body:'x'.repeat(300*1024)}});
  await assert.rejects(checkPublicStaging(origin,{fetchImpl}),/size limit/);
});

test('staging CLI fails closed if no approved hostname or HTTPS origin is provided',()=>{
  const script=fileURLToPath(new URL('../../../scripts/check-staging-public.mjs',import.meta.url));
  const result=spawnSync(process.execPath,[script],{
    encoding:'utf8',env:{...process.env,STAGING_ALLOWED_HOST:''},
  });
  assert.equal(result.status,1);
  assert.match(result.stderr,/STAGING PUBLIC SMOKE FAILED/);
});
