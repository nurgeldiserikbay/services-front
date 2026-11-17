#!/usr/bin/env node
// Read-only, credential-free staging readiness smoke. This is NOT a release
// approval and must never operate on production or an unapproved host.
// Usage: STAGING_ALLOWED_HOST=staging.example.kz node scripts/check-staging-public.mjs https://staging.example.kz
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const MAX_BODY_BYTES=256*1024;
const PUBLIC_PATHS=['/kk','/ru','/manifest.webmanifest','/icon.svg','/offline.html','/sw.js'];
const isPublicHostname=host=>/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(host)&&
  !host.endsWith('.local')&&!host.endsWith('.internal')&&!host.endsWith('.localhost');

export function validateStagingOrigin(raw,allowHost){
  assert.ok(typeof raw==='string'&&raw.length<1024,'Explicit staging HTTPS URL required');
  assert.ok(typeof allowHost==='string'&&isPublicHostname(allowHost),'Explicit DNS staging host allowlist required');
  const url=new URL(raw);
  assert.equal(url.protocol,'https:','Staging must use verified HTTPS');
  assert.equal(url.hostname,allowHost.toLowerCase(),'Staging host must match explicit allowlist');
  assert.equal(url.username,'','Credentials in staging URL are prohibited');
  assert.equal(url.password,'','Credentials in staging URL are prohibited');
  assert.equal(url.port,'','Staging must use standard HTTPS port');
  assert.equal(url.pathname,'/','Staging URL must be an origin (no path)');
  assert.equal(url.search,'','Staging query parameters prohibited');
  assert.equal(url.hash,'','Staging fragments prohibited');
  assert.ok(isPublicHostname(url.hostname),'Nonpublic staging hostname prohibited');
  return url.origin;
}

async function readLimited(response){
  const size=Number(response.headers.get('content-length'));
  if(Number.isFinite(size)&&size>MAX_BODY_BYTES)throw Error('Public staging response exceeded size limit');
  const reader=response.body?.getReader();
  if(!reader)throw Error('Staging response has no body');
  const chunks=[];
  let total=0;
  try{
    while(true){
      const {value,done}=await reader.read();
      if(done)break;
      total+=value.byteLength;
      if(total>MAX_BODY_BYTES)throw Error('Public staging response exceeded size limit');
      chunks.push(value);
    }
  }finally{
    await reader.cancel().catch(()=>{});
  }
  return new TextDecoder().decode(Buffer.concat(chunks.map(x=>Buffer.from(x))));
}

export async function checkPublicStaging(origin,{fetchImpl=fetch}={}){
  const results=[];
  for(const path of PUBLIC_PATHS){
    const url=new URL(path,origin);
    const response=await fetchImpl(url,{
      method:'GET',redirect:'manual',credentials:'omit',
      headers:{accept:path.endsWith('.webmanifest')?'application/manifest+json':'*/*'},
      signal:AbortSignal.timeout(10000),
    });
    assert.equal(response.status,200,path+' must return HTTP 200 with no redirects');
    // Verify headers delivered over real staging HTTPS, not only checked in
    // Next.js source tests. A CDN/proxy can silently drop these protections.
    assert.equal(response.headers.get('x-content-type-options')?.toLowerCase(),'nosniff',
      path+' must disable MIME sniffing');
    assert.equal(response.headers.get('x-frame-options')?.toUpperCase(),'DENY',
      path+' must prevent framing');
    assert.equal(response.headers.get('cross-origin-opener-policy')?.toLowerCase(),'same-origin',
      path+' must isolate the top-level browsing context');
    assert.equal(response.headers.get('referrer-policy')?.toLowerCase(),'strict-origin-when-cross-origin',
      path+' must enforce public referrer policy');
    const permissions=response.headers.get('permissions-policy')??'';
    for(const feature of ['camera','microphone','geolocation']){
      assert.match(permissions,new RegExp('(?:^|,)\\s*'+feature+'=\\(\\)'),
        path+' must disable '+feature+' permissions');
    }
    if(path==='/kk'||path==='/ru'){
      const csp=response.headers.get('content-security-policy')??'';
      for(const directive of ["default-src 'self'","object-src 'none'",
        "base-uri 'self'","form-action 'self'","frame-ancestors 'none'",
        "upgrade-insecure-requests"]){
        assert.ok(csp.split(';').some(part=>part.trim()===directive),
          path+' missing production CSP directive '+directive);
      }
    }
    const body=await readLimited(response);
    const contentType=response.headers.get('content-type')??'';
    if(path==='/kk'||path==='/ru'){
      assert.match(contentType,/text\/html/i);
      assert.match(body,new RegExp('<html lang="'+path.slice(1)+'"'));
      assert.match(body,/<main[^>]+id="main-content"/);
      assert.match(body,/<h1\b/);
    }else if(path==='/manifest.webmanifest'){
      assert.match(contentType,/(?:application\/(?:manifest\+json|json))/i);
      const manifest=JSON.parse(body);
      assert.equal(manifest.start_url,'/kk');
      assert.equal(manifest.scope,'/');
      assert.equal(manifest.display,'standalone');
      assert.ok(manifest.icons?.some(icon=>icon.src==='/icon.svg'));
    }else if(path==='/icon.svg'){
      assert.match(contentType,/image\/svg\+xml/i);
      assert.match(body,/<svg\b/);
    }else if(path==='/offline.html'){
      assert.match(contentType,/text\/html/i);
      assert.match(response.headers.get('cache-control')??'',/no-store/i);
      assert.match(response.headers.get('x-robots-tag')??'',/noindex/i);
      assert.match(body,/<a href="\/kk">/);
      assert.match(body,/<a href="\/ru"/);
    }else if(path==='/sw.js'){
      assert.match(contentType,/(?:javascript|ecmascript)/i);
      assert.match(response.headers.get('cache-control')??'',/no-store/i);
      assert.equal(response.headers.get('service-worker-allowed'),'/');
    }
    results.push({path,status:response.status,contentType:contentType.split(';')[0]});
  }
  return {kind:'public-staging-readiness-only',checked:results,
    disclaimer:'Read-only public HTTP smoke. NOT authentication, mobile device, performance, data residency or release acceptance.'};
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  try{
    const origin=validateStagingOrigin(process.argv[2],process.env.STAGING_ALLOWED_HOST);
    const report=await checkPublicStaging(origin);
    console.log(JSON.stringify(report,null,2));
  }catch(error){
    console.error('STAGING PUBLIC SMOKE FAILED:',error.message);
    process.exitCode=1;
  }
}
