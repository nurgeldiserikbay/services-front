import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const component=readFileSync(new URL('../src/components/SellerDecisionActions.tsx',import.meta.url),'utf8');

test('both seller decision buttons fail closed on invalid request context',()=>{
 assert.match(component,/disabled=\{busy\|\|committed\|\|!validContext\} onClick=\{\(\)=>void submit\('accept'\)\}/);
 assert.match(component,/disabled=\{busy\|\|committed\|\|!validContext\} onClick=\{\(\)=>void submit\('decline'\)\}/);
 assert.match(component,/if\(locked\.current\|\|committedRef\.current\|\|!validContext\)return/);
 assert.match(component,/committedRef\.current=true/);
 assert.match(component,/committedRef\.current=false/);
});

test('committed decision feedback is localized and reset with request context',()=>{
 assert.match(component,/setCommittedState\(action\)/);
 assert.match(component,/setCommittedState\(null\)/);
 assert.match(component,/Өтінім қабылданды/);
 assert.match(component,/Заявка принята/);
 assert.match(component,/Өтінім қабылданбады/);
 assert.match(component,/Заявка отклонена/);
 assert.match(component,/committedState&&<p role="status" aria-live="polite">/);
});

test('invalid request context gives actionable bilingual error feedback',()=>{
 assert.match(component,/!validContext&&<p role="alert">/);
 assert.match(component,/Өтінім деректері жарамсыз/);
 assert.match(component,/Данные заявки недействительны/);
});
