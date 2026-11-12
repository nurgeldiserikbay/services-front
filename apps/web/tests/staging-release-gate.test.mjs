import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const document = readFileSync(new URL('../../../docs/staging-acceptance-evidence.md', import.meta.url), 'utf8');

function tableRows(section) {
  const body = document.split(section)[1]?.split('\n## ')[0] ?? '';
  return body.split('\n').filter((line) => line.startsWith('|')).map((line) =>
    line.split('|').slice(1, -1).map((cell) => cell.trim()));
}

test('release is fail-closed unless every acceptance gate has PASS evidence', () => {
  assert.match(document, /\*\*Default: NO-GO\.\*\*/);
  assert.match(document, /A green CI workflow alone never overrides this decision/);
  assert.match(document, /designated owners approve the release/);
});

test('immutable revision table retains all repository records', () => {
  const rows = tableRows('## Immutable revision record');
  for (const repo of ['Backend', 'Frontend', 'Admin']) {
    const matching = rows.filter((cells) => cells[0] === repo);
    assert.equal(matching.length, 1, 'expected one revision row for ' + repo);
    const [, sha, ciUrl, reviewer, date] = matching[0];
    assert.match(sha, /^(?:TODO|[0-9a-f]{40})$/i);
    assert.ok(ciUrl === 'TODO' || /^https:\/\/github\.com\/[^/]+\/[^/]+\/actions\/runs\/\d+$/.test(ciUrl));
    assert.ok(reviewer?.length > 0 && date?.length > 0);
  }
});

test('critical acceptance gates are present exactly once and use recognized statuses', () => {
  const rows = tableRows('## Required acceptance gates');
  for (const gate of [
    'Authentication', 'Guest-to-seller lifecycle', 'Isolation',
    'Admin moderation', 'PWA and mobile', 'Data safety', 'Operations',
  ]) {
    const matching = rows.filter((cells) => cells[0] === gate);
    assert.equal(matching.length, 1, 'expected one gate row for ' + gate);
    assert.ok(matching[0][1]?.length > 15, 'missing evidence description for ' + gate);
    assert.match(matching[0][2], /^(?:NOT RUN|PASS|FAIL|BLOCKED)$/);
  }
});

test('evidence record template requires reproducible results and accountability', () => {
  for (const field of [
    'Environment and region:', 'Repository SHAs:', 'Executed at (UTC):',
    'Operator/reviewer:', 'Sanitized artifact URL:', 'Expected outcome:',
    'Actual outcome:', 'PASS / FAIL / BLOCKED:', 'Retest SHA and date:',
  ]) {
    assert.ok(document.includes(field), 'missing evidence field: ' + field);
  }
});
