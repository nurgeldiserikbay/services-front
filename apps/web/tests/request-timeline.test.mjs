import{test}from'node:test';
import assert from'node:assert/strict';
import{readFileSync}from'node:fs';
const read=p=>readFileSync(new URL('../src/'+p,import.meta.url),'utf8');
test('timeline is backend state driven and never fabricates schedule',()=>{
 const source=read('lib/request-timeline.ts');
 assert.match(source,/state==='pending'/);
 assert.match(source,/state==='accepted'/);
 assert.match(source,/state==='declined'/);
 assert.doesNotMatch(source,/setTimeout|fetch\(|localStorage|Date\.now/);
});
test('timeline component is reusable and not mounted without authoritative request',()=>{
 const source=read('components/RequestTimeline.tsx');
 assert.match(source,/buildRequestTimeline\(state,locale\)/);
 assert.doesNotMatch(source,/fetch\(|onClick/);
 const page=read('app/[locale]/services/[id]/page.tsx');
 assert.doesNotMatch(page,/<RequestTimeline/);
});
