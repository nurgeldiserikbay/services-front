import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { validateStagingRelease } from '../../../scripts/verify-staging-release.mjs';

const draft = readFileSync(new URL('../../../docs/staging-acceptance-evidence.md', import.meta.url), 'utf8');
const sha = 'a'.repeat(40);
const ci = 'https://github.com/example/services-front/actions/runs/12345';

function approvedDocument() {
  let text = draft.replace('Status: **NOT VERIFIED**', 'Status: **VERIFIED**');
  for (const repo of ['Backend', 'Frontend', 'Admin']) {
    text = text.replace(
      '| ' + repo + ' | TODO | TODO | TODO | TODO |',
      '| ' + repo + ' | ' + sha + ' | ' + ci + ' | Reviewer | 2026-11-12 |',
    );
  }
  text = text.replaceAll('| NOT RUN |', '| PASS |');
  text += '\n## Signed release evidence\n\n- Evidence bundle: https://example.com/release-evidence\n- Approved by: Release owner\n- Approved at (UTC): 2026-11-12T18:00:00Z\n';
  return text;
}

test('draft staging release is NO-GO', () => {
  const problems = validateStagingRelease(draft);
  assert.ok(problems.length > 0);
  assert.ok(problems.some(p => p.includes('not PASS')));
});

test('complete evidence can pass the mechanical gate', () => {
  assert.deepEqual(validateStagingRelease(approvedDocument()), []);
});

test('missing evidence, stale gate and unreviewed revisions fail closed', () => {
  const valid = approvedDocument();
  assert.ok(validateStagingRelease(valid.replace('| PASS |', '| BLOCKED |')).some(p => p.includes('not PASS')));
  assert.ok(validateStagingRelease(valid.replace('- Evidence bundle: https://example.com/release-evidence', '- Evidence bundle: TODO')).some(p => p.includes('evidence bundle')));
  assert.ok(validateStagingRelease(valid.replace(' | Reviewer | ', ' | TODO | ')).some(p => p.includes('reviewer')));
  assert.ok(validateStagingRelease(valid.replace(sha, 'main')).some(p => p.includes('immutable SHA')));
  assert.ok(validateStagingRelease(valid.replace('- Approved by: Release owner', '- Approved by: TODO')).some(p => p.includes('owner approval')));
});
