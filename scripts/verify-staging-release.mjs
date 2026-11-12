#!/usr/bin/env node
// Run only for release approval, not as a normal CI build gate.
// Usage: node scripts/verify-staging-release.mjs [path-to-staging-evidence.md]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DEFAULT_PATH = fileURLToPath(new URL('../docs/staging-acceptance-evidence.md', import.meta.url));
const EXPECTED_GATES = [
  'Authentication', 'Guest-to-seller lifecycle', 'Isolation',
  'Admin moderation', 'PWA and mobile', 'Data safety', 'Operations',
];
const EXPECTED_REPOS = ['Backend', 'Frontend', 'Admin'];
const SHA = /^[0-9a-f]{40}$/i;
const CI_URL = /^https:\/\/github\.com\/[^/]+\/[^/]+\/actions\/runs\/\d+$/;

function rows(text, heading) {
  const escaped = heading.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp('^## ' + escaped + '\\s*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))', 'm'));
  if (!match) return [];
  return match[1].split('\n').filter(line => line.trim().startsWith('|'))
    .map(line => line.split('|').slice(1, -1).map(cell => cell.trim()))
    .filter(cells => cells[0] && !/^[-:]+$/.test(cells[0]) && cells[0] !== 'Component' && cells[0] !== 'Gate');
}

export function validateStagingRelease(text) {
  const problems = [];
  if (!text.includes('Status: **VERIFIED**')) problems.push('Staging status must be VERIFIED');
  const revisions = rows(text, 'Immutable revision record');
  for (const repo of EXPECTED_REPOS) {
    const matching = revisions.filter(c => c[0] === repo);
    if (matching.length !== 1) { problems.push(repo + ': missing or duplicate revision'); continue; }
    const [, sha, url, reviewer, date] = matching[0];
    if (!SHA.test(sha ?? '')) problems.push(repo + ': missing immutable SHA');
    if (!CI_URL.test(url ?? '')) problems.push(repo + ': missing GitHub Actions run');
    if (!reviewer || reviewer === 'TODO') problems.push(repo + ': missing reviewer');
    if (!/^\d{4}-\d{2}-\d{2}/.test(date ?? '')) problems.push(repo + ': missing UTC date');
  }
  const gates = rows(text, 'Required acceptance gates');
  for (const gate of EXPECTED_GATES) {
    const matching = gates.filter(c => c[0] === gate);
    if (matching.length !== 1) { problems.push(gate + ': missing or duplicate gate'); continue; }
    if (matching[0][2] !== 'PASS') problems.push(gate + ': not PASS');
  }
  // A PASS table alone is insufficient: a reviewer must link a sanitized evidence bundle.
  const evidence = text.match(/^## Signed release evidence\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m)?.[1] ?? '';
  const evidenceUrl = evidence.match(/^- Evidence bundle:\s*(https:\/\/\S+)/m)?.[1];
  if (!evidenceUrl) problems.push('Missing signed evidence bundle URL');
  if (!/^- Approved by:\s*(?!TODO\s*$)\S.+/m.test(evidence)) problems.push('Missing owner approval');
  if (!/^- Approved at \(UTC\):\s*\d{4}-\d{2}-\d{2}/m.test(evidence)) problems.push('Missing approval timestamp');
  return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const problems = validateStagingRelease(readFileSync(process.argv[2] ?? DEFAULT_PATH, 'utf8'));
    if (problems.length) {
      console.error('NO-GO: ' + problems.length + ' release requirement(s) unmet');
      for (const problem of problems) console.error('- ' + problem);
      process.exitCode = 1;
    } else {
      console.log('Release evidence checks passed. Manual security and operations approval still required.');
    }
  } catch (error) {
    console.error('NO-GO: cannot read or validate staging evidence:', error.message);
    process.exitCode = 1;
  }
}
