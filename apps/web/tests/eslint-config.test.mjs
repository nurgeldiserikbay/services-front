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

test('React hook rules are not disabled for any component',()=>{
  assert.doesNotMatch(config,/react-hooks\/set-state-in-effect/);
  assert.doesNotMatch(config,/react-hooks\/refs/);
  assert.doesNotMatch(config,/rules:\s*\{[^}]*react-hooks\//);
});

test('seller decision render does not read pending ref and keeps submit guard',()=>{
  const component=readFileSync(new URL('../src/components/SellerDecisionActions.tsx',import.meta.url),'utf8');
  const render=component.slice(component.lastIndexOf('  return <div>'));
  assert.doesNotMatch(render,/pendingKey\.current/);
  assert.match(component,/if\(!canStartSellerDecision\(pendingKey\.current,requestId,version,action\)\)return/);
  assert.match(render,/uncertainAction!==null&&uncertainAction!=='accept'/);
  assert.match(render,/uncertainAction!==null&&uncertainAction!=='decline'/);
});

test('notification inbox initial load is scheduled outside React effect and cancelled on cleanup',()=>{
  const inbox=readFileSync(new URL('../src/components/AccountNotificationsInbox.tsx',import.meta.url),'utf8');
  assert.ok(!config.includes('src/components/AccountNotificationsInbox.tsx'));
  assert.match(inbox,/useEffect\(\(\)=>\{\s*const timer=setTimeout\(\(\)=>\{void load\(\);\},0\)/);
  assert.match(inbox,/return \(\)=>\{\s*clearTimeout\(timer\);generation\.current\+\+;\s*const previous=active\.current;\s*active\.current=null;\s*previous\?\.abort\(\);\s*\}/);
  assert.match(inbox,/if\(current===generation\.current\)setItems\(result\.items\)/);
  assert.match(inbox,/if\(active\.current\)return/);
});

test('device sessions initial fetch is deferred and cancelled on discarded mounts',()=>{
  const component=readFileSync(new URL('../src/components/AccountDeviceSessions.tsx',import.meta.url),'utf8');
  assert.ok(!config.includes('src/components/AccountDeviceSessions.tsx'));
  assert.match(component,/useEffect\(\(\)=>\{\s*alive\.current=true;/);
  assert.match(component,/const timer=setTimeout\(\(\)=>\{void refresh\(\);\},0\)/);
  assert.match(component,/return \(\)=>\{clearTimeout\(timer\);alive\.current=false;requestId\.current\+\+;mutation\.current=null;\}/);
  assert.match(component,/if\(!alive\.current\|\|seq!==requestId\.current\)return/);
  assert.match(component,/await revokeOtherAccountDevice\(\{sessionId:item\.id,csrf\}\)/);
  assert.match(component,/await refresh\(\)/);
});

test('seller workspace initial load is deferred and cleanup invalidates stale requests',()=>{
  const workspace=readFileSync(new URL('../src/components/SellerWorkspace.tsx',import.meta.url),'utf8');
  assert.ok(!config.includes('src/components/SellerWorkspace.tsx'));
  assert.match(workspace,/const timer=setTimeout\(\(\)=>\{void load\(\)\.catch\(\(\)=>\{\}\);\},0\)/);
  assert.match(workspace,/return \(\)=>\{clearTimeout\(timer\);generation\.current\+\+;\}/);
  assert.match(workspace,/if\(current!==generation\.current\)return/);
  assert.match(workspace,/if\(current===generation\.current\)/);
  assert.match(workspace,/if\(refreshLock\.current\)return/);
  assert.match(workspace,/setStatus\('unauthorized'\)/);
});

test('geography picker defers effects but still aborts stale country and city requests',()=>{
  const component=readFileSync(new URL('../src/components/GeographyPicker.tsx',import.meta.url),'utf8');
  assert.ok(!config.includes('src/components/GeographyPicker.tsx'));
  const effects=component.match(/const timer=setTimeout\(\(\)=>\{/g)??[];
  assert.equal(effects.length,2);
  const cleanup=component.match(/return \(\)=>\{clearTimeout\(timer\);controller\.abort\(\);\}/g)??[];
  assert.equal(cleanup.length,2);
  assert.match(component,/generation===cityInputGeneration\.current/);
  assert.match(component,/if\(!countryId\)\{setCities\(\[\]\)/);
  assert.match(component,/parseCountries\(data\)/);
  assert.match(component,/parseCities\(data,countryId\)/);
});

test('guest status receipt switches reset state at render, with abort-only cleanup',()=>{
  const component=readFileSync(new URL('../src/components/GuestRequestStatusCheck.tsx',import.meta.url),'utf8');
  assert.match(component,/return <ReceiptStatusView key=\{props\.requestId\+'\|'\+props\.serviceOfferId\} \{\.\.\.props\}\/>/);
  assert.match(component,/function ReceiptStatusView\(\{locale,requestId,serviceOfferId,completionEnabled=false\}:Props\)/);
  assert.match(component,/useLayoutEffect\(\(\)=>\(\)=>\{\s*active\.current\?\.abort\(\)/);
  const cleanup=component.slice(component.indexOf('useLayoutEffect('),component.indexOf('async function refresh()'));
  assert.doesNotMatch(cleanup,/setState\(null\)|setVersion\(null\)|setPending\(false\)|setError\(false\)/);
  assert.match(component,/if\(active\.current!==controller\|\|controller\.signal\.aborted\)return/);
  assert.match(component,/shouldReplaceGuestStatus\(currentVersion\.current,result\.version\)/);
  assert.match(component,/setVersion\(null\);setState\(null\);setError\(true\)/);
});
