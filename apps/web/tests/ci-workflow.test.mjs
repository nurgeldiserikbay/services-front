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
 assert.match(workflow,/node apps\/web\/tests\/private-bff-enabled-denial\.e2e\.mjs/);
 assert.ok(workflow.indexOf('Verify enabled private BFF still rejects missing and forged sessions')>
  workflow.indexOf('Start isolated feature-enabled private BFF without real login'));
 assert.ok(workflow.includes('steps.enabled_private_denial_e2e.outcome'));
 assert.ok(workflow.includes('Enabled private BFF unauthorized proof rejection'));
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
 const readinessProbes=workflow.split('\n').filter(line=>line.trimStart().startsWith('if curl '));
 assert.ok(readinessProbes.length>=5,'expected public, private, TLS and isolated-failure readiness probes');
 assert.ok(readinessProbes.every(line=>line.includes('curl --connect-timeout 2 --max-time 5')),
  'every readiness probe must have connection and total request deadlines');
 assert.match(workflow,/node apps\/web\/tests\/public-search-retry-failure\.e2e\.mjs/);
 assert.ok(workflow.includes('steps.search_failure_e2e.outcome'),
  'the real upstream outage gate must be reported');
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

test('CI proves signed temporary seller web session reaches backend and is revoked',()=>{
 const workflow=readFileSync(new URL('../../../.github/workflows/ci.yml',import.meta.url),'utf8');
 assert.match(workflow,/openssl rand -base64 32 > "\$RUNNER_TEMP\/services-private-bff-account-key"/);
 assert.match(workflow,/SERVICES_WEB_ACCOUNT_SESSION_KEY="\$\(cat "\$RUNNER_TEMP\/services-private-bff-account-key"\)"/);
 assert.match(workflow,/node apps\/web\/tests\/private-bff-signed-session\.e2e\.mjs/);
 assert.ok(workflow.indexOf('Verify signed web session reaches backend and revocation invalidates access')>
  workflow.indexOf('Start isolated feature-enabled private BFF without real login'));
 assert.ok(workflow.includes('steps.signed_seller_session_e2e.outcome'));
});

test('CI exercises real guest status capability allowlist and expiry against backend',()=>{
 const workflow=readFileSync(new URL('../../../.github/workflows/ci.yml',import.meta.url),'utf8');
 assert.match(workflow,/SERVICES_ENABLE_GUEST_STATUS_HTTP=enabled/);
 assert.match(workflow,/GUEST_REQUEST_HMAC_KEY="\$\(cat "\$RUNNER_TEMP\/services-guest-capability-hmac-key"\)"/);
 assert.match(workflow,/SERVICES_WEB_GUEST_SESSION_KEY="\$\(cat "\$RUNNER_TEMP\/services-private-bff-guest-key"\)"/);
 assert.match(workflow,/node apps\/web\/tests\/private-bff-guest-status\.e2e\.mjs/);
 assert.ok(workflow.includes('steps.guest_status_proof_e2e.outcome'));
});

test('CI requires OTP bootstrap with provider disabled and no public verification',()=>{
 const workflow=readFileSync(new URL('../../../.github/workflows/ci.yml',import.meta.url),'utf8');
 assert.match(workflow,/SERVICES_WEB_ENABLE_GUEST_OTP_START_HTTP=enabled/);
 assert.match(workflow,/SERVICES_WEB_ENABLE_GUEST_OTP_BFF=enabled/);
 assert.match(workflow,/node apps\/web\/tests\/private-bff-otp-bootstrap\.e2e\.mjs/);
 assert.ok(workflow.indexOf('Verify guest OTP bootstrap CSRF and unavailable-provider isolation')>
  workflow.indexOf('Start isolated feature-enabled private BFF without real login'));
 assert.ok(workflow.includes('steps.otp_bootstrap_e2e.outcome'));
 assert.ok(!workflow.includes('SERVICES_ENABLE_GUEST_OTP_HTTP=enabled'));
 assert.ok(!workflow.includes('SERVICES_WEB_ENABLE_GUEST_OTP_VERIFY_HTTP=enabled'));
});

test('guest creation and request-bound status are tested only with ephemeral CI secrets',()=>{
 const workflow=readFileSync(new URL('../../../.github/workflows/ci.yml',import.meta.url),'utf8');
 assert.match(workflow,/SERVICES_ENABLE_GUEST_CREATE_HTTP=enabled/);
 assert.match(workflow,/SERVICES_WEB_ENABLE_GUEST_CREATE_HTTP=enabled/);
 assert.match(workflow,/services-guest-contact-encryption-key/);
 assert.match(workflow,/node apps\/web\/tests\/private-bff-guest-create-journey\.e2e\.mjs/);
 assert.ok(workflow.includes('steps.guest_create_status_e2e.outcome'));
 assert.ok(workflow.indexOf('Verify verified-test guest creation returns scoped status cookie')>
  workflow.indexOf('Start isolated feature-enabled private BFF without real login'));
});
