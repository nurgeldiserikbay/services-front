import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {confirmedProfileMutation} from '../src/lib/profile-mutation-ack.mjs';

const receipt=(code,status=200,headers={})=>new Response(JSON.stringify({code}),{
 status,headers:{'content-type':'application/json','cache-control':'private, no-store, max-age=0',...headers},
});

test('edit, publish and appeal require exact private BFF success acknowledgement',async()=>{
 assert.equal(await confirmedProfileMutation(receipt('UPDATED'),'edit'),true);
 assert.equal(await confirmedProfileMutation(receipt('PUBLISHED',201),'publish'),true);
 assert.equal(await confirmedProfileMutation(receipt('SUBMITTED',201),'appeal'),true);
 for(const [operation,status,code] of [
  ['edit',200,'UPDATED'],['publish',201,'PUBLISHED'],['appeal',201,'SUBMITTED'],
 ]){
  assert.equal(await confirmedProfileMutation(receipt(code,status),operation),true);
  for(const res of [
   receipt(code,status===200?201:200),receipt('OTHER',status),
   receipt(code,status,{'cache-control':'public, max-age=30'}),
   receipt(code,status,{'cache-control':'public, no-store'}),
   receipt(code,status,{'content-range':'bytes 0-10/20'}),
   receipt(code,status,{'content-type':'text/plain'}),
   receipt(code,status,{'content-type':'application/json; profile=debug'}),
   receipt(code,status,{'content-length':'10000'}),
   new Response(JSON.stringify({code,secret:'private'}),{status,
    headers:{'content-type':'application/json','cache-control':'no-store'}}),
   new Response('not-json',{status,headers:{
    'content-type':'application/json','cache-control':'no-store'}}),
  ]){
   assert.equal(await confirmedProfileMutation(res,operation),false);
  }
 }
 assert.equal(await confirmedProfileMutation(receipt('UPDATED'),'unknown'),false);
});

test('oversized or invalid UTF-8 BFF acknowledgement fails closed and cancels stream',async()=>{
 let cancelled=false;
 const response={status:200,headers:new Headers({
  'content-type':'application/json','cache-control':'no-store',
 }),body:new ReadableStream({
  start(controller){controller.enqueue(new Uint8Array(129));},
  cancel(){cancelled=true;},
 })};
 assert.equal(await confirmedProfileMutation(response,'edit'),false);
 assert.equal(cancelled,true);
 assert.equal(await confirmedProfileMutation(new Response(new Uint8Array([0xff]),{
  status:200,headers:{'content-type':'application/json','cache-control':'no-store'},
 }),'edit'),false);
});

test('profile mutation UI never resends a possible commit without server refresh',()=>{
 const root='../src/app/[locale]/account/profiles/';
 for(const [file,op,freeze] of [
  ['EditProfileForm.tsx','edit','setStale(true)'],
  ['PublishProfileButton.tsx','publish','setStale(true)'],
  ['AppealProfileButton.tsx','appeal','setFinished(true)'],
 ]){
  const source=readFileSync(new URL(root+file,import.meta.url),'utf8');
  assert.ok(source.includes("confirmedProfileMutation(response,'"+op+"')"),file);
  assert.equal(source.includes('if(response.status===200)'),false,file);
  assert.equal(source.includes('if(response.status===201)'),false,file);
  assert.ok(source.includes(freeze),file);
  assert.ok(source.includes("window.location.reload()"),file);
  assert.match(source,/inFlight\.current/,file);
  assert.match(source,/AbortSignal\.timeout\(10000\)/,file);
  assert.doesNotMatch(source,/Authorization|Bearer|localStorage|sessionStorage/,file);
 }
});
