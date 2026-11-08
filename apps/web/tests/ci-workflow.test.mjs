import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

test('frontend CI protects the cross-repository integration journey',()=>{
 const workflow=readFileSync(new URL('../../../.github/workflows/ci.yml',import.meta.url),'utf8');
 assert.match(workflow,/^permissions:\n  contents: read$/m);
 assert.match(workflow,/^    timeout-minutes: 30$/m);
 assert.match(workflow,/repository: nurgeldiserikbay\/services-back\n\s+ref: main\n\s+path: services-back\n\s+persist-credentials: false/);
 const gates=['npm run db:migrate','npm run db:seed:geo','pnpm typecheck','pnpm test','pnpm build','Verify live search-to-profile journey'];
 let previous=-1;
 for(const gate of gates){
  const index=workflow.indexOf(gate);
  assert.notEqual(index,-1,`Missing integration gate: ${gate}`);
  assert.ok(index>previous,`Integration gate out of order: ${gate}`);
  previous=index;
 }
 assert.match(workflow,/node apps\/web\/tests\/public-profile-journey\.e2e\.mjs/);
 assert.ok(workflow.includes('curl --connect-timeout 2 --max-time 5 --cacert "$RUNNER_TEMP/api.crt" --fail --silent https://localhost:8443/v1/professions'));
 assert.doesNotMatch(workflow,/curl\s+--insecure\b/);
 assert.equal((workflow.match(/curl --connect-timeout 2 --max-time 5/g) ?? []).length,3,'all readiness probes must have a request deadline');
});
