import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

test('frontend CI protects the cross-repository integration journey',()=>{
 const workflow=readFileSync(new URL('../../../.github/workflows/ci.yml',import.meta.url),'utf8');
 assert.match(workflow,/^permissions:\n  contents: read$/m);
 assert.equal((workflow.match(/persist-credentials: false/g) ?? []).length,2,'both checkouts must avoid persisted credentials');
 assert.match(workflow,/^    timeout-minutes: 30$/m);
 assert.match(workflow,/^concurrency:\n  group: .*github\.workflow.*github\.ref.*github\.event_name.*inputs\.backend_sha.*\n  cancel-in-progress: true$/m);
 // The full immutable checkout SHA is validated in backend-ci-pin.test.mjs.
 assert.match(workflow,/repository: nurgeldiserikbay\/services-back/);
 assert.match(workflow,/\s+path: services-back\n\s+persist-credentials: false/);
 const gates=['pnpm lint','pnpm test','npm run db:migrate','npm run db:seed:geo','Verify pinned backend admin HTTP boundary stays private','Verify guest and seller lifecycle HTTP boundaries deny anonymous calls','pnpm typecheck','pnpm build','Verify live search-to-profile journey'];
 // Unit tests run early to fail fast; PostgreSQL-backed checks precede build/E2E.
 assert.ok(workflow.indexOf('pnpm install --frozen-lockfile')<workflow.indexOf('pnpm lint'));
 assert.ok(workflow.indexOf('pnpm lint')<workflow.indexOf('pnpm test'));
 assert.match(workflow,/Frontend security lint/);
 assert.ok(workflow.indexOf('pnpm typecheck')<workflow.indexOf('pnpm build'));

 let previous=-1;
 for(const gate of gates){
  const index=workflow.indexOf(gate);
  assert.notEqual(index,-1,`Missing integration gate: ${gate}`);
  assert.ok(index>previous,`Integration gate out of order: ${gate}`);
  previous=index;
 }
 assert.match(workflow,/node apps\/web\/tests\/admin-api-boundary\.e2e\.mjs/);
 assert.match(workflow,/node apps\/web\/tests\/request-lifecycle-boundary\.e2e\.mjs/);
 assert.match(workflow,/node apps\/web\/tests\/public-profile-journey\.e2e\.mjs/);
 assert.match(workflow,/node apps\/web\/tests\/private-bff-default-off\.e2e\.mjs/);
 assert.match(workflow,/node apps\/web\/tests\/live-pwa-worker-isolation\.e2e\.mjs/);
 assert.match(workflow,/node apps\/web\/tests\/live-chrome-accessibility\.e2e\.mjs/);
 assert.match(workflow,/node apps\/web\/tests\/live-chrome-sw-offline\.e2e\.mjs/);
 assert.ok(workflow.indexOf('Verify real Chrome PWA worker offline and private cache isolation')>
  workflow.indexOf('Start frontend production server'));
 assert.ok(workflow.indexOf('Verify real Chrome PWA worker offline and private cache isolation')<
  workflow.indexOf('Verify live search-to-profile journey'));
 assert.ok(workflow.indexOf('Verify mobile keyboard and landmarks in headless Chrome')>
  workflow.indexOf('Start frontend production server'));
 assert.ok(workflow.indexOf('Verify mobile keyboard and landmarks in headless Chrome')<
  workflow.indexOf('Verify live search-to-profile journey'));
 assert.ok(workflow.indexOf('Verify production service worker never intercepts private routes')>
  workflow.indexOf('Start frontend production server'));
 assert.ok(workflow.indexOf('Verify production service worker never intercepts private routes')<
  workflow.indexOf('Verify live search-to-profile journey'));
 assert.ok(workflow.indexOf('Start frontend production server')<
  workflow.indexOf('Verify private frontend BFF routes remain default-off over live HTTP'));
 assert.ok(workflow.indexOf('Verify private frontend BFF routes remain default-off over live HTTP')<
  workflow.indexOf('Verify live search-to-profile journey'));
 assert.ok(workflow.includes('curl --connect-timeout 2 --max-time 5 --cacert "$RUNNER_TEMP/api.crt" --fail --silent https://localhost:8443/v1/professions'));
 assert.doesNotMatch(workflow,/curl\s+--insecure\b/);
 assert.equal((workflow.match(/curl --connect-timeout 2 --max-time 5/g) ?? []).length,3,'all readiness probes must have a request deadline');
});

test('CI summary includes all production private and browser acceptance smoke outcomes',()=>{
 const workflow=readFileSync(new URL('../../../.github/workflows/ci.yml',import.meta.url),'utf8');
 for(const [id,label] of [
  ['private_bff_e2e','Private frontend BFF live HTTP E2E'],
  ['worker_isolation_e2e','Served worker isolation E2E'],
  ['chrome_mobile_e2e','Chrome mobile and keyboard smoke'],
  ['chrome_offline_e2e','Chrome service worker offline E2E'],
 ]){
  assert.ok(workflow.includes('id: '+id),'missing gate id '+id);
  assert.ok(workflow.includes('steps.'+id+'.outcome'),'unreported gate '+id);
  assert.ok(workflow.includes(label),'missing summary label '+label);
 }
 assert.match(workflow,/if: always\(\)/);
});
