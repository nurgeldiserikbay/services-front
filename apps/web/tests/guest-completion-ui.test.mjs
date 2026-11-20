import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {guestCompletionUrl,readGuestCompletionUiResponse,
 shouldResetGuestCompletionAfterVerifiedRefresh}
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
 for(const malformed of [
  '00000000-0000-0000-0000-000000000000',
  'ffffffff-ffff-ffff-ffff-ffffffffffff',
  '12345678-1234-1234-1234-123456789abc',
  'not-a-uuid-0000-0000-000000000000',
 ])assert.throws(()=>guestCompletionUrl(id,'/challenges/'+malformed+'/verify'));
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
 const contradictory=response({csrf_token:csrf},200);
 contradictory.headers.set('cache-control','public, no-store, s-maxage=3600');
 await assert.rejects(readGuestCompletionUiResponse(contradictory,'bootstrap'));
 const malformed=response({csrf_token:csrf},200);
 malformed.headers.set('content-length','999999999999999999999');
 await assert.rejects(readGuestCompletionUiResponse(malformed,'bootstrap'));
});
test('guest completion response reader rejects malformed streams and cancels oversized bodies',async()=>{
 let canceled=0;
 const make=(stream)=>({
  status:200,headers:new Headers({
   'content-type':'application/json','cache-control':'private, no-store',
  }),body:stream,
 });
 const oversized=new ReadableStream({
  start(controller){controller.enqueue(new Uint8Array(1100));},
  cancel(){canceled++;}
 });
 await assert.rejects(readGuestCompletionUiResponse(make(oversized),'bootstrap'),
  /guest_completion_unavailable/);
 assert.equal(canceled,1,'rejected stream must be cancelled');
 const broken=new ReadableStream({
  start(controller){controller.enqueue(new Uint8Array([0xff]));controller.close();}
 });
 await assert.rejects(readGuestCompletionUiResponse(make(broken),'bootstrap'),
  /guest_completion_unavailable/);
 const foreignChunk=new ReadableStream({
  start(controller){controller.enqueue(new Uint8Array([123]));controller.close();}
 });
 // A valid stream with malformed JSON cannot masquerade as a successful response.
 await assert.rejects(readGuestCompletionUiResponse(make(foreignChunk),'bootstrap'),
  /guest_completion_unavailable/);
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

test('ambiguous completion unlock needs a verified same-version accepted status',()=>{
 assert.equal(shouldResetGuestCompletionAfterVerifiedRefresh(2,2,'accepted'),true);
 for(const [oldVersion,newVersion,state] of [
  [null,2,'accepted'],[2,1,'accepted'],[2,3,'accepted'],
  [2,2,'completed'],[2,2,'pending'],[2,2,'declined'],
  [2,2,'cancelled_by_provider'],[0,0,'accepted'],
 ]){
  assert.equal(shouldResetGuestCompletionAfterVerifiedRefresh(
   oldVersion,newVersion,state),false);
 }
 const status=readFileSync(new URL('../src/components/GuestRequestStatusCheck.tsx',
  import.meta.url),'utf8');
 const completion=readFileSync(new URL('../src/components/GuestRequestCompletion.tsx',
  import.meta.url),'utf8');
 assert.match(status,/shouldResetGuestCompletionAfterVerifiedRefresh\(/);
 assert.match(status,/setCompletionRefreshEpoch\(value=>value\+1\)/);
 assert.match(status,/completionRefreshEpoch\} locale=\{locale\}/);
 assert.match(completion,/if\(action==='confirm'\)setPhase\('uncertain'\)/);
 assert.doesNotMatch(completion,/setTimeout|setInterval|localStorage|sessionStorage/);
});
