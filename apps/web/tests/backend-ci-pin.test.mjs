import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

// A floating backend main checkout makes an unchanged frontend revision
// nondeterministic and can silently change the API contract under test.
test('frontend integration CI pins a reviewed backend commit rather than a moving branch',()=>{
  const workflow=readFileSync(new URL('../../../.github/workflows/ci.yml',import.meta.url),'utf8');
  const checkout=workflow.match(/repository: nurgeldiserikbay\/services-back[\s\S]*?ref: \$\{\{ inputs\.backend_sha \|\| '([0-9a-f]{40})' \}\}/);
  assert.ok(checkout,'backend integration checkout must declare an immutable default SHA');
  assert.match(workflow,/EXPECTED_BACKEND_SHA:/);
  assert.match(workflow,/git -C services-back rev-parse HEAD/);
  const guidance=readFileSync(new URL('../../../docs/integration-release-gates.md',import.meta.url),'utf8');
  assert.ok(guidance.includes(checkout[1]),'document the exact integration baseline being tested');
});
