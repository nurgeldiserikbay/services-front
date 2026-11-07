import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildRequestTimeline} from '../src/lib/request-timeline.ts';

const src=path=>readFileSync(new URL('../src/'+path,import.meta.url),'utf8');

test('guest timeline represents pending, accepted and resolved without claiming a booking',()=>{
 for(const locale of ['kk','ru']){
  const pending=buildRequestTimeline('pending',locale);
  assert.deepEqual(pending.steps.map(s=>s.complete),[true,false,false]);
  const accepted=buildRequestTimeline('accepted',locale);
  assert.deepEqual(accepted.steps.map(s=>s.complete),[true,true,false]);
  const completed=buildRequestTimeline('completed',locale);
  assert.deepEqual(completed.steps.map(s=>s.complete),[true,true,true]);
  for(const state of ['declined','expired','cancelled_by_customer',
   'cancelled_by_provider','cancelled_mutual']){
   const timeline=buildRequestTimeline(state,locale);
   assert.equal(timeline.steps[2].complete,true);
   assert.equal(timeline.steps[1].complete,false,
    'cancellation alone cannot prove an appointment was accepted');
  }
  assert.equal(typeof pending.status,'string');
  assert.notEqual(accepted.status,completed.status);
 }
});
test('private status UI renders timeline only after a validated backend response',()=>{
 const component=src('components/GuestRequestStatusCheck.tsx');
 assert.match(component,/buildRequestTimeline\(state,locale\)/);
 assert.match(component,/version!==null&&<>/);
 assert.match(component,/<ol className=\{styles\.timeline\}/);
 assert.match(component,/timeline\.steps\.map/);
 assert.match(component,/timeline\.status/);
 assert.match(component,/aria-current/);
 assert.match(component,/readPrivateGuestStatusResponse/);
 assert.match(component,/result\.version>=currentVersion\.current/);
 assert.match(component,/active\.current\?\.abort\(\)/);
 assert.doesNotMatch(component,/setInterval|setTimeout|localStorage|sessionStorage|document\.cookie|Guest-Capability/);
});
test('timeline styling remains lightweight for narrow screens',()=>{
 const css=src('components/GuestRequestStatusCheck.module.css');
 assert.match(css,/\.timeline\{/);
 assert.match(css,/\.complete/);
 assert.match(css,/\.waiting/);
 assert.match(css,/@media\(max-width:480px\)/);
});
