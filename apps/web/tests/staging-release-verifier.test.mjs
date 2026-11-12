import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
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
  text = text.replaceAll('| NOT RUN | TODO |', '| PASS | https://example.com/gate-evidence |');
  text = text.replace('- Evidence bundle: TODO', '- Evidence bundle: https://example.com/release-evidence')
    .replace('- Approved by: TODO', '- Approved by: Release owner')
    .replace('- Approved at (UTC): TODO', '- Approved at (UTC): 2026-11-12T18:00:00Z');
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

test('duplicate gate rows cannot approve release', () => {
  const valid = approvedDocument();
  const row = valid.split('\n').find(line => line.startsWith('| Authentication |'));
  assert.ok(row);
  const tampered = valid.replace(row, row + '\n' + row);
  assert.ok(validateStagingRelease(tampered).some(p => p.includes('duplicate gate')));
});

test('missing release status cannot approve release', () => {
  const valid = approvedDocument();
  assert.ok(validateStagingRelease(valid.replace('Status: **VERIFIED**', 'Status: **NOT VERIFIED**')).some(p => p.includes('Status')));
});

test('release verifier CLI fails closed for the committed staging draft', async () => {
  const { spawnSync } = await import('node:child_process');
  const script = new URL('../../../scripts/verify-staging-release.mjs', import.meta.url);
  const result = spawnSync(process.execPath, [fileURLToPath(script)], { encoding: 'utf8' });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /NO-GO/);
});

test('gate PASS without its own HTTPS evidence remains NO-GO', () => {
  const valid = approvedDocument();
  assert.ok(validateStagingRelease(valid.replace('| PASS | https://example.com/gate-evidence |', '| PASS | TODO |'))
    .some(p => p.includes('missing HTTPS evidence URL')));
  assert.ok(validateStagingRelease(valid.replace('| PASS | https://example.com/gate-evidence |', '| PASS | http://example.com/evidence |'))
    .some(p => p.includes('missing HTTPS evidence URL')));
});

test('approval cannot be forged with placeholder reviewer or malformed UTC time', () => {
  const valid = approvedDocument();
  for (const bad of ['TODO', ' ', '']) {
    assert.ok(validateStagingRelease(valid.replace('- Approved by: Release owner', '- Approved by: ' + bad))
      .some(p => p.includes('owner approval')));
  }
  for (const bad of ['TODO', '2026-11-12', '2026-11-12T18:00:00+05:00', '2026-99-99T18:00:00Z']) {
    assert.ok(validateStagingRelease(valid.replace('2026-11-12T18:00:00Z', bad))
      .some(p => p.includes('UTC approval timestamp')), bad);
  }
});
