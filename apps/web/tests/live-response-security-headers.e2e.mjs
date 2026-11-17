import assert from 'node:assert/strict';

// Real production-built Next.js HTTP headers, exercising the Next.js runtime
// rather than asserting strings in next.config.ts. The loopback CI transport
// is HTTP: browsers only enforce HSTS when delivered via real HTTPS. This is
// NOT deployed staging TLS or browser HSTS acceptance evidence.
const base=process.env.WEB_BASE_URL??'http://127.0.0.1:3000';
const paths=['/kk','/ru','/manifest.webmanifest','/icon.svg','/offline.html','/sw.js'];
const requiredPolicy=["default-src 'self'","object-src 'none'","base-uri 'self'",
  "form-action 'self'","frame-ancestors 'none'","upgrade-insecure-requests"];

for(const path of paths){
  const url=new URL(path,base);
  const response=await fetch(url,{redirect:'manual',credentials:'omit',
    signal:AbortSignal.timeout(10000)});
  assert.equal(response.status,200,path+' public production-built response must be HTTP 200');
  const h=response.headers;
  assert.equal(h.get('x-content-type-options'),'nosniff',path+' MIME sniffing');
  assert.equal(h.get('x-frame-options'),'DENY',path+' frame policy');
  assert.equal(h.get('cross-origin-opener-policy'),'same-origin',path+' COOP');
  assert.equal(h.get('referrer-policy'),'strict-origin-when-cross-origin',path+' referrer policy');
  const permissions=h.get('permissions-policy')??'';
  for(const feature of ['camera','microphone','geolocation']){
    assert.match(permissions,new RegExp('(?:^|,)\\s*'+feature+'=\\(\\)'),
      path+' disabled browser feature '+feature);
  }
  const hsts=h.get('strict-transport-security')??'';
  assert.match(hsts,/(?:^|;)\s*max-age=31536000(?:\s*;|\s*$)/i,path+' HSTS header');
  assert.doesNotMatch(hsts,/includeSubDomains|preload/i,
    path+' HSTS domain expansion not approved');
  if(path==='/kk'||path==='/ru'){
    const directives=(h.get('content-security-policy')??'')
      .split(';').map(part=>part.trim());
    for(const directive of requiredPolicy){
      assert.ok(directives.includes(directive),path+' missing production CSP '+directive);
    }
  }
  if(path==='/offline.html'){
    assert.match(h.get('cache-control')??'',/no-store/i);
    assert.match(h.get('x-robots-tag')??'',/noindex/i);
  }
  if(path==='/sw.js'){
    assert.match(h.get('cache-control')??'',/no-store/i);
    assert.equal(h.get('service-worker-allowed'),'/');
  }
  if(response.body)void response.body.cancel().catch(()=>{});
  console.log('[live-response-headers] '+path+' OK');
}
console.log('Live Next.js runtime header gate PASS; deployed HTTPS/HSTS browser enforcement remains untested.');
