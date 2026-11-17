#!/usr/bin/env node
// Opt-in, read-only and credential-free verification of deployed private
// workspace HTTP denial. No login or mutation is performed.
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {validateStagingOrigin} from './check-staging-public.mjs';

const accountPaths=['/kk/account/requests','/ru/account/requests',
  '/kk/account/notifications','/ru/account/notifications',
  '/kk/account/devices','/ru/account/devices'];
const sellerPaths=['/kk/seller/requests','/ru/seller/requests'];
const privateApiPaths=['/api/account/notifications','/api/seller/requests?limit=1',
  '/api/guest-requests/00000000-0000-4000-8000-000000000000/status'];
const notFound=['NEXT_HTTP_ERROR_FALLBACK;404','NEXT_NOT_FOUND',
  'This page could not be found','404: This page could not be found'];
const privateMarkers=['SERVICES / WORKSPACE','Сессияларды басқару',
  'Управление сеансами','Өтінімдерге өту','К заявкам'];

async function readBounded(response){
  const max=256*1024;
  const length=response.headers.get('content-length');
  if(length!==null&&Number(length)>max)throw Error('Oversized staging private response');
  const reader=response.body?.getReader();
  if(!reader)throw Error('Missing staging private response body');
  const chunks=[];let size=0;
  try{
    while(true){
      const {value,done}=await reader.read();
      if(done)break;
      size+=value.byteLength;
      if(size>max)throw Error('Oversized staging private response');
      chunks.push(value);
    }
  }finally{await reader.cancel().catch(()=>{});}
  return new TextDecoder().decode(Buffer.concat(chunks.map(v=>Buffer.from(v))));
}

export async function checkPrivateStaging(origin,{fetchImpl=fetch}={}){
  const checked=[];
  for(const path of [...accountPaths,...sellerPaths]){
    const response=await fetchImpl(new URL(path,origin),{
      method:'GET',redirect:'manual',credentials:'omit',
      headers:{Accept:'text/html'},signal:AbortSignal.timeout(10000),
    });
    const seller=sellerPaths.includes(path);
    assert.ok(seller?response.status===200:
      response.status===404||response.status===200,
      path+' unexpected anonymous response status');
    assert.match(response.headers.get('cache-control')??'',/\bprivate\b/i,
      path+' must be private');
    assert.match(response.headers.get('cache-control')??'',/\bno-store\b/i,
      path+' must not be cached');
    assert.match(response.headers.get('x-robots-tag')??'',/\bnoindex\b/i,
      path+' must not be indexed');
    assert.equal(response.headers.get('set-cookie'),null,
      path+' must not mint an account session for an anonymous request');
    assert.match(response.headers.get('content-type')??'',/text\/html/i,
      path+' must respond with HTML');
    const html=await readBounded(response);
    if(seller){
      assert.ok(html.includes(path.startsWith('/kk')?'Менің өтінімдерім':'Мои заявки'),
        path+' must be a localized, data-free public shell');
    }else if(response.status===200){
      assert.ok(notFound.some(value=>html.includes(value)),
        path+' streamed HTTP 200 must still represent a denied workspace');
    }
    for(const marker of [...privateMarkers,'csrf_token','idempotency_key',
      'serviceOfferId','desiredStartAt','__Host-services_account_web=']){
      assert.ok(!html.includes(marker),path+' leaked a private workspace marker');
    }
    checked.push({path,status:response.status});
  }
  for(const path of privateApiPaths){
    const response=await fetchImpl(new URL(path,origin),{
      method:'GET',redirect:'manual',credentials:'omit',
      headers:{Accept:'application/json','Sec-Fetch-Site':'same-origin'},
      signal:AbortSignal.timeout(10000),
    });
    assert.ok(response.status===401||response.status===404,
      path+' must reject anonymous API access without relying on a network error');
    assert.match(response.headers.get('cache-control')??'',/\bprivate\b/i);
    assert.match(response.headers.get('cache-control')??'',/\bno-store\b/i);
    assert.match(response.headers.get('x-robots-tag')??'',/\bnoindex\b/i);
    assert.equal(response.headers.get('referrer-policy'),'no-referrer',
      path+' must not expose private URLs through referrers');
    assert.equal(response.headers.get('set-cookie'),null,
      path+' denied anonymous API must not issue cookies');
    assert.match(response.headers.get('content-type')??'',/application\/json/i);
    const body=await readBounded(response);
    assert.ok(Buffer.byteLength(body,'utf8')<=2048,path+' error body too large');
    const parsed=JSON.parse(body);
    assert.ok(parsed&&typeof parsed==='object'&&!Array.isArray(parsed),
      path+' requires a sanitized JSON error');
    assert.ok(typeof parsed.code==='string'&&parsed.code.length<=64,
      path+' missing bounded error code');
    assert.ok(Object.keys(parsed).every(key=>key==='code'||key==='message'),
      path+' exposed a non-allowlisted private field');
    if('message' in parsed)assert.ok(typeof parsed.message==='string'&&
      parsed.message.length<=256,path+' unexpected error message');
    checked.push({path,status:response.status});
  }
  return {kind:'anonymous-private-staging-http-only',checked,
    disclaimer:'No authenticated login, cross-account isolation, device or release approval is proved.'};
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  try{
    const origin=validateStagingOrigin(process.argv[2],process.env.STAGING_ALLOWED_HOST);
    const result=await checkPrivateStaging(origin);
    console.log(JSON.stringify(result,null,2));
  }catch{
    // Never print an untrusted response body, URL or authentication proof.
    console.error('STAGING PRIVATE HTTP SMOKE FAILED');
    process.exitCode=1;
  }
}
