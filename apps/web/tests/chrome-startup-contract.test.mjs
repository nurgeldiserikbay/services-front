import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const source=readFileSync(new URL('./live-chrome-accessibility.e2e.mjs',import.meta.url),'utf8');

test('Chrome startup retry uses two separate profiles and fails closed',()=>{
  assert.match(source,/for\(let attempt=0;attempt<2&&!port;attempt\+\+\)/);
  assert.match(source,/dir=await mkdtemp\(join\(tmpdir\(\),'services-chrome-'\)\)/);
  assert.match(source,/const candidate=Number\(data\.split\('\\n'\)\[0\]\)/);
  assert.match(source,/if\(!port\)\{[\s\S]*?proc\.kill\('SIGTERM'\)[\s\S]*?rm\(dir/);
  assert.match(source,/assert\.ok\(port,'Chrome DevTools endpoint was not available after two startup attempts'\)/);
});

test('Chrome page assertions are not retried or silently skipped',()=>{
  const startupEnd=source.indexOf('after two startup attempts');
  const pageStart=source.indexOf('const targets=await');
  assert.ok(pageStart>startupEnd);
  assert.match(source.slice(pageStart),/assert\.equal\(result\.main,true/);
  assert.match(source.slice(pageStart),/Accessibility\.getFullAXTree/);
  assert.match(source.slice(pageStart),/keyboard clear-all did not reach pristine search/);
});
