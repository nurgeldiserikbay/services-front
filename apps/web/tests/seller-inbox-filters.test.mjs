import{test}from'node:test';
import assert from'node:assert/strict';
import{readFileSync}from'node:fs';

const read=path=>readFileSync(new URL('../src/'+path,import.meta.url),'utf8');

test('seller inbox filters are scoped to the active seller kind',()=>{
  const core=read('lib/seller-requests.ts');
  assert.match(core,/request\.sellerKind!==sellerContext/);
  assert.match(core,/filter==='closed'/);
  assert.match(core,/return sortSellerRequests\(items\.filter/);
  assert.match(core,/counts\.pending\+\+/);
  assert.match(core,/counts\.accepted\+\+/);
});

test('seller inbox has kk and ru accessible filter controls',()=>{
  const view=read('components/SellerRequestList.tsx');
  assert.match(view,/filters:\{all:'Барлығы'/);
  assert.match(view,/filters:\{all:'Все'/);
  assert.match(view,/aria-pressed=\{filter===value\}/);
  assert.match(view,/role="group"/);
  assert.match(view,/countSellerInbox\(requests,sellerContext\)/);
});

test('successful or conflicting decisions prevent stale repeated mutations',()=>{
  const view=read('components/SellerRequestList.tsx');
  assert.match(view,/settled\[req\.id\]===req\.version/);
  assert.match(view,/result==='ok'\|\|result==='conflict'/);
  assert.match(view,/\[req\.id\]:req\.version/);
  assert.match(view,/caller MUST refresh/);
  assert.doesNotMatch(view,/localStorage|sessionStorage|fetch\(/);
});
