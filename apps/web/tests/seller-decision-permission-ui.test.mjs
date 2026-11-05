import{test}from'node:test';
import assert from'node:assert/strict';
import{readFileSync}from'node:fs';
const src=readFileSync(new URL('../src/components/SellerRequestList.tsx',import.meta.url),'utf8');
test('seller denial locks stale action and displays localized permission error',()=>{
 assert.match(src,/result==='ok'\|\|result==='conflict'\|\|result==='forbidden'/);
 assert.match(src,/result==='forbidden'\?t\.forbidden:t\.error/);
 assert.match(src,/forbidden:'Бұл өтінімді өзгертуге рұқсатыңыз жоқ\.'/);
 assert.match(src,/forbidden:'Недостаточно прав для изменения этой заявки\.'/);
 assert.match(src,/settled\[req\.id\]===req\.version/);
});
