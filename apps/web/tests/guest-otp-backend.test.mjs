import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {issueGuestOtpChallenge,verifyGuestOtpChallenge,GuestOtpUnavailable}
  from '../src/lib/guest-otp-backend.mjs';

const challengeId=randomUUID();
const proof=randomBytes(32).toString('base64url');
const now=Date.parse('2026-11-04T09:00:00.000Z');
const issue=o=>issueGuestOtpChallenge({
  baseUrl:'https://api.example/v1',production:true,channel:'sms',
  contact:'+77001234567',locale:'kk',...o,
});
const verify=o=>verifyGuestOtpChallenge({
  baseUrl:'https://api.example/v1',production:true,
  challengeId,code:'012345',now,...o,
});
function json(value,status=200,headers={}){
  return new Response(JSON.stringify(value),{status,
    headers:{'content-type':'application/json',...headers}});
}
test('issue BFF transport sends bounded OTP input without forwarding browser credentials',async()=>{
  let called=0;
  const actual=await issue({transport:async(url,options)=>{
    called++;
    assert.equal(url,'https://api.example/v1/guest-requests/challenges');
    assert.equal(options.method,'POST');
    assert.equal(options.cache,'no-store');
    assert.equal(options.redirect,'manual');
    assert.equal(options.credentials,'omit');
    assert.deepEqual(JSON.parse(options.body),{
      channel:'sms',contact:'+77001234567',locale:'kk',
    });
    assert.deepEqual(Object.keys(options.headers).sort(),
      ['Accept','Content-Type'].sort());
    assert.ok(options.signal instanceof AbortSignal);
    return json({challenge_id:challengeId},202);
  }});
  assert.deepEqual(actual,{challengeId});
  assert.equal(called,1);
});
test('verify BFF transport returns secret only to server and checks expiry',async()=>{
  const actual=await verify({transport:async(url,options)=>{
    assert.equal(url,'https://api.example/v1/guest-requests/challenges/'+
      challengeId+'/verify');
    assert.deepEqual(JSON.parse(options.body),{code:'012345'});
    assert.equal(options.credentials,'omit');
    return json({guest_capability:proof,
      expires_at:new Date(now+900000).toISOString()});
  }});
  assert.deepEqual(actual,{createCapability:proof,expiresInSeconds:900});
});
test('invalid inputs and insecure URL fail before sending any network request',async()=>{
  let calls=0;
  const transport=async()=>{calls++;return json({challenge_id:challengeId},202);};
  for(const x of [
    {channel:'fax'},{locale:'en'},{contact:'hi\nthere'},
    {contact:'x'.repeat(321)},{baseUrl:'http://api.example/v1'},
    {baseUrl:'https://user:pass@api.example/v1'},
    {baseUrl:'https://api.example/v1?x=1'},
  ])await assert.rejects(issue({...x,transport}),GuestOtpUnavailable);
  for(const x of [
    {challengeId:'bad'},{code:'12345'},{code:'x'.repeat(6)},
    {baseUrl:'http://api.example/v1'},
  ])await assert.rejects(verify({...x,transport}),GuestOtpUnavailable);
  assert.equal(calls,0);
});
test('issue rejects redirect, missing challenge, extra contact, non-JSON and oversized',async()=>{
  for(const [body,status,headers] of [
    [{challenge_id:challengeId},302,{}],
    [{challenge_id:'bad'},202,{}],
    [{challenge_id:challengeId,code:'private'},202,{}],
    [{challenge_id:challengeId},202,{'content-type':'text/html'}],
    [{challenge_id:challengeId},202,{'content-length':'999999'}],
  ])await assert.rejects(issue({transport:async()=>json(body,status,headers)}),
    GuestOtpUnavailable);
});
test('verify rejects extra secrets, bad/missing proof, expired and long-lived proof',async()=>{
  const good={guest_capability:proof,
    expires_at:new Date(now+900000).toISOString()};
  for(const data of [
    {...good,contact:'+77001234567'},
    {...good,guest_capability:'bad'},
    {...good,expires_at:new Date(now-1000).toISOString()},
    {...good,expires_at:new Date(now+1800000).toISOString()},
    {expires_at:good.expires_at},
  ])await assert.rejects(verify({transport:async()=>json(data)}),
    GuestOtpUnavailable);
});
test('provider errors never expose contact, code or bearer secrets',async()=>{
  for(const p of [
    issue({transport:async()=>{throw new Error('secret +77001234567');}}),
    verify({transport:async()=>{throw new Error('secret 012345 '+proof);}}),
  ])await assert.rejects(p,(e)=>{
    assert.ok(e instanceof GuestOtpUnavailable);
    assert.equal(e.message.includes('012345'),false);
    assert.equal(e.message.includes('7700'),false);
    assert.equal(e.message.includes(proof),false);
    return true;
  });
});
test('transport remains disconnected from public Next.js offer route',()=>{
  const read=p=>readFileSync(new URL('../src/'+p,import.meta.url),'utf8');
  assert.doesNotMatch(read('app/[locale]/services/[id]/page.tsx'),
    /guest-otp-backend|issueGuestOtpChallenge|verifyGuestOtpChallenge/);
});
