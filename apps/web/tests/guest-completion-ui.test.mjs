import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {guestCompletionUrl,readGuestCompletionUiResponse}
 from '../src/lib/guest-completion-ui-core.mjs';

const id=randomUUID(),other=randomUUID();
const csrf=randomBytes(32).toString('base64url');
const challenge=randomUUID();
const response=(value,status)=>new Response(JSON.stringify(value),{
 status,headers:{'content-type':'application/json',
 'cache-control':'private, no-store, max-age=0'},
});
const read=(value,kind,status,requestId=id,version=2)=>
 readGuestCompletionUiResponse(response(value,status),kind,requestId,version);

test('completion UI routes are request scoped and reject path injection',()=>{
 assert.equal(guestCompletionUrl(id,'/bootstrap'),
  '/api/guest-requests/'+id+'/completion/bootstrap');
 assert.equal(guestCompletionUrl(id,'/challenges/'+challenge+'/verify'),
  '/api/guest-requests/'+id+'/completion/challenges/'+challenge+'/verify');
 for(const bad of ['','../admin',other+'/confirm','/x?csrf=token'])
  assert.throws(()=>guestCompletionUrl(bad,'/bootstrap'));
 assert.throws(()=>guestCompletionUrl(id,'/../account'));
});

test('guest completion UI parses only bounded allowlisted private responses',async()=>{
 assert.deepEqual(await read({csrf_token:csrf},'bootstrap',200),{csrfToken:csrf});
 assert.deepEqual(await read({challenge_id:challenge},'challenge',202),
  {challengeId:challenge});
 assert.deepEqual(await read({verified:true},'verify',200),{verified:true});
 assert.deepEqual(await read({code:'COMPLETED',id,version:3},'confirm',200),
  {completed:true,version:3});
 for(const args of [
  [{csrf_token:csrf,guest_capability:'secret'},'bootstrap',200],
  [{challenge_id:challenge,secret:'token'},'challenge',202],
  [{verified:false},'verify',200],
  [{code:'COMPLETED',id:other,version:3},'confirm',200],
  [{code:'COMPLETED',id,version:2},'confirm',200],
  [{code:'COMPLETED',id,version:3},'confirm',503],
  [{csrf_token:csrf},'bootstrap',404],
 ]){
  await assert.rejects(read(args[0],args[1],args[2]));
 }
 const oversized=response({csrf_token:csrf},200);
 oversized.headers.set('content-length','9999');
 await assert.rejects(readGuestCompletionUiResponse(oversized,'bootstrap'));
 const publicCache=response({csrf_token:csrf},200);
 publicCache.headers.set('cache-control','public,max-age=120');
 await assert.rejects(readGuestCompletionUiResponse(publicCache,'bootstrap'));
});

test('completion UI stays feature-gated, state-verified and secret-free',()=>{
 const readSource=path=>readFileSync(new URL('../src/'+path,import.meta.url),'utf8');
 const page=readSource('app/[locale]/services/[id]/page.tsx');
 const status=readSource('components/GuestRequestStatusCheck.tsx');
 const receipt=readSource('components/GuestRequestReceipt.tsx');
 const component=readSource('components/GuestRequestCompletion.tsx');
 const wizard=readSource('components/GuestRequestWizard.tsx');
 const connected=readSource('components/ConnectedGuestRequestWizard.tsx');
 assert.match(page,/SERVICES_WEB_ENABLE_GUEST_COMPLETION_UI/);
 assert.match(page,/SERVICES_WEB_ENABLE_GUEST_COMPLETION_BFF/);
 assert.match(page,/completionEnabled=statusEnabled/);
 assert.match(status,/completionEnabled&&state==='accepted'/);
 assert.match(status,/GuestRequestCompletion/);
 for(const s of [receipt,wizard,connected])assert.match(s,/completionEnabled/);
 assert.match(component,/\/bootstrap/);
 assert.match(component,/\/challenges/);
 assert.match(component,/\/confirm/);
 assert.match(component,/one-time-code/);
 assert.match(component,/If-Match/);
 assert.match(component,/uncertain/);
 assert.doesNotMatch(component,/localStorage|sessionStorage|document\.cookie|Guest-Capability|createHmac|networkProof|setInterval/);
 assert.match(component,/credentials:'same-origin'/);
 assert.match(component,/cache:'no-store'/);
});
