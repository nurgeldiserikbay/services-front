import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const src=path=>readFileSync(new URL('../src/'+path,import.meta.url),'utf8');

test('guest private status displays existing timeline only after a validated status response',()=>{
 const component=src('components/GuestRequestStatusCheck.tsx');
 assert.match(component,/import \{RequestTimeline\} from '\.\/RequestTimeline'/);
 assert.match(component,/version!==null&&state!==null&&<>/);
 assert.match(component,/<RequestTimeline state=\{state\} locale=\{locale\}\/>/);
 assert.match(component,/readPrivateGuestStatusResponse/);
 assert.match(component,/shouldReplaceGuestStatus\(currentVersion\.current,result\.version\)/);
 assert.match(component,/active\.current\?\.abort\(\)/);
 assert.doesNotMatch(component,/setInterval|setTimeout|localStorage|sessionStorage|document\.cookie|Guest-Capability/);
});
test('shared timeline uses bounded known states and never declares accepted time',()=>{
 const presenter=src('components/RequestTimeline.tsx');
 const rules=src('lib/request-timeline.ts');
 assert.match(presenter,/buildRequestTimeline\(state,locale\)/);
 assert.match(presenter,/timeline\.steps\.map/);
 assert.match(presenter,/<ol/);
 assert.match(rules,/const accepted=\['accepted','completed'\]/);
 assert.match(rules,/const resolved=\['declined','completed','expired'/);
 assert.match(rules,/pending:'Орындаушы жауабын күтуде'/);
 assert.match(rules,/pending:'Ожидает ответа исполнителя'/);
 assert.doesNotMatch(rules,/confirmed_at|scheduled_start_at|setTimeout|Date\.now/);
});

test('guest status ignores superseded in-flight replies and errors',()=>{
 const component=src('components/GuestRequestStatusCheck.tsx');
 assert.match(component,/controller\.signal\.aborted\|\|active\.current!==controller/);
 assert.match(component,/!controller\.signal\.aborted&&active\.current===controller/);
 assert.match(component,/!controller\.signal\.aborted&&active\.current===null\)setPending\(false\)/);
});
