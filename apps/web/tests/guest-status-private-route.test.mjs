import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {randomBytes,randomUUID} from 'node:crypto';
import {readGuestRequestStatus,GuestStatusUnavailable}
  from '../src/lib/guest-status-backend.mjs';
import {
  sealGuestRequestAccess,openGuestRequestAccess,verifyGuestRequestAccess,
} from '../src/lib/guest-request-access-core.mjs';

const route=readFileSync(
  new URL('../src/app/api/guest-requests/[id]/status/route.ts',import.meta.url),
  'utf8',
);

test('mounted guest status route is default-off and requires server cookie use case',()=>{
  assert.match(route,/SERVICES_WEB_ENABLE_GUEST_STATUS_HTTP/);
  assert.match(route,/!=='enabled'/);
  assert.match(route,/getPrivateGuestStatus/);
  assert.match(route,/request\.cookies\.get\(GUEST_REQUEST_COOKIE\)/);
  assert.match(route,/sec-fetch-site/);
  assert.match(route,/dynamic='force-dynamic'/);
  assert.match(route,/revalidate=0/);
  assert.match(route,/runtime='nodejs'/);
  assert.doesNotMatch(route,/Guest-Capability['":]|requestCapability:|Authorization:/);
});

test('private route explicitly whitelists status, suppresses shared caching and indexes',()=>{
  for(const field of ['id','service_offer_id','state','version','created_at']){
    assert.ok(route.includes(field+':status.'),field);
  }
  for(const snippet of [
    'private, no-store','noindex, nofollow','no-referrer',
    'Cookie, Sec-Fetch-Site',"{status:404,headers:PRIVATE_HEADERS}",
  ])assert.ok(route.includes(snippet),snippet);
  assert.doesNotMatch(route,/NextResponse\.json\(status\)/);
  assert.doesNotMatch(route,/JSON\.stringify\(status\)/);
});

test('one request cookie cannot authorize another request',()=>{
  const key=randomBytes(32),cap=randomBytes(32).toString('base64url');
  const id=randomUUID(),anotherId=randomUUID(),now=Date.now();
  const issued=sealGuestRequestAccess(key,id,cap,now+3600000,now);
  const session=openGuestRequestAccess(key,issued.cookie,now);
  assert.ok(session);
  assert.equal(session.requestId,id);
  assert.equal(verifyGuestRequestAccess(session,id,issued.csrf),true);
  assert.equal(verifyGuestRequestAccess(session,anotherId,issued.csrf),false);
  assert.equal(openGuestRequestAccess(randomBytes(32),issued.cookie,now),null);
});

test('status backend never exposes a capability or unlisted contact fields',async()=>{
  const requestId=randomUUID(),serviceOffer=randomUUID();
  const capability=randomBytes(32).toString('base64url');
  const raw={
    id:requestId,service_offer_id:serviceOffer,state:'pending',
    version:1,created_at:new Date().toISOString(),
  };
  const result=await readGuestRequestStatus({
    baseUrl:'https://api.example/v1',production:true,requestId,
    requestCapability:capability,
    transport:async(url,options)=>{
      assert.equal(options.headers['Guest-Capability'],capability);
      assert.equal(options.cache,'no-store');
      assert.equal(options.credentials,'omit');
      assert.equal(options.redirect,'manual');
      assert.equal(url,'https://api.example/v1/requests/'+requestId);
      return new Response(JSON.stringify(raw),{
        headers:{'content-type':'application/json'},
      });
    },
  });
  assert.equal(result.id,requestId);
  assert.equal(JSON.stringify(result).includes(capability),false);
  await assert.rejects(readGuestRequestStatus({
    baseUrl:'https://api.example/v1',production:true,
    requestId,requestCapability:capability,
    transport:async()=>new Response(JSON.stringify({...raw,guest_contact:'private'}),{
      headers:{'content-type':'application/json'},
    }),
  }),GuestStatusUnavailable);
});
