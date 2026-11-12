import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const document = readFileSync(new URL('../../../docs/staging-acceptance-evidence.md', import.meta.url), 'utf8');

test('staging acceptance is explicitly not verified by default', () => {
  assert.match(document, /Status:\s*\*\*NOT VERIFIED\*\*/);
  assert.match(document, /\*\*Default: NO-GO\.\*\*/);
  assert.match(document, /A green CI workflow alone never overrides this decision/);
});

test('staging release requires immutable revisions and evidence for each critical gate', () => {
  for (const repository of ['Backend', 'Frontend', 'Admin']) {
    assert.match(document, new RegExp('\\| ' + repository + ' \\| TODO \\| TODO \\|'));
  }
  for (const gate of [
    'Authentication', 'Guest-to-seller lifecycle', 'Isolation',
    'Admin moderation', 'PWA and mobile', 'Data safety', 'Operations',
  ]) {
    assert.ok(document.includes('| ' + gate + ' |'), 'missing staging gate: ' + gate);
  }
  assert.equal((document.match(/\| NOT RUN \|/g) || []).length, 7);
});

test('evidence template demands reproducible results and owner approval', () => {
  for (const field of [
    'Environment and region:', 'Repository SHAs:', 'Executed at (UTC):',
    'Operator/reviewer:', 'Sanitized artifact URL:', 'Expected outcome:',
    'Actual outcome:', 'PASS / FAIL / BLOCKED:', 'Retest SHA and date:',
  ]) {
    assert.ok(document.includes(field), 'missing evidence field: ' + field);
  }
  assert.match(document, /designated owners approve the release/);
});
