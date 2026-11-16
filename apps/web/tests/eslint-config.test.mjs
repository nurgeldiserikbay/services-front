import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const config=readFileSync(new URL('../eslint.config.mjs',import.meta.url),'utf8');
const manifest=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));

test('Next.js ESLint flat config includes React, web vitals and TypeScript',()=>{
  assert.match(config,/eslint-config-next\/core-web-vitals/);
  assert.match(config,/eslint-config-next\/typescript/);
  assert.match(config,/\.\.\.nextVitals/);
  assert.match(config,/\.\.\.nextTypeScript/);
  assert.match(config,/globalIgnores\(/);
});

test('CI lint invokes ESLint and retains both existing security gates',()=>{
  assert.match(manifest.scripts.lint,/lint-security\.mjs/);
  assert.match(manifest.scripts.lint,/lint-ast\.mjs/);
  assert.match(manifest.scripts.lint,/eslint src/);
  assert.ok(manifest.devDependencies.eslint);
  assert.ok(manifest.devDependencies['eslint-config-next']);
});

test('legacy React hook exceptions remain scoped to named components',()=>{
  assert.match(config,/react-hooks\/set-state-in-effect/);
  assert.doesNotMatch(config,/react-hooks\/refs/);
  for(const file of ['AccountDeviceSessions','AccountNotificationsInbox','GeographyPicker','GuestRequestStatusCheck','SellerWorkspace'])
    assert.ok(config.includes(`src/components/${file}.tsx`),file);
  assert.doesNotMatch(config,/files:\s*\['src\/\*\*/);
});

test('seller decision render does not read pending ref and keeps submit guard',()=>{
  const component=readFileSync(new URL('../src/components/SellerDecisionActions.tsx',import.meta.url),'utf8');
  const render=component.slice(component.lastIndexOf('  return <div>'));
  assert.doesNotMatch(render,/pendingKey\.current/);
  assert.match(component,/if\(!canStartSellerDecision\(pendingKey\.current,requestId,version,action\)\)return/);
  assert.match(render,/uncertainAction!==null&&uncertainAction!=='accept'/);
  assert.match(render,/uncertainAction!==null&&uncertainAction!=='decline'/);
});
