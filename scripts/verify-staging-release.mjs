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
const REPO_PATH = {
  Backend: 'nurgeldiserikbay/services-back',
  Frontend: 'nurgeldiserikbay/services-front',
  Admin: 'nurgeldiserikbay/services-admin',
};
function validCiRun(url, repo) {
  return typeof url === 'string' &&
    new RegExp('^https://github\\.com/' + REPO_PATH[repo] + '/actions/runs/[1-9][0-9]*$').test(url);
}
function validEvidenceUrl(raw) {
  if (typeof raw !== 'string' || raw.length > 2048 ||
      !/^https:\/\/[^\s|]+$/i.test(raw) || raw.includes('TODO')) return false;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && !!url.hostname &&
      !url.username && !url.password &&
      !url.hash && !url.search &&
      url.port === '' && url.pathname !== '/TODO';
  } catch { return false; }
}
function validUtcDate(raw) {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const parsed = new Date(raw + 'T00:00:00Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === raw;
}

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
  if (!/^Status: \*\*VERIFIED\*\*(?=\\s|[.!?]|$)/m.test(text)) problems.push('Staging status must be VERIFIED');
  const revisions = rows(text, 'Immutable revision record');
  for (const repo of EXPECTED_REPOS) {
    const matching = revisions.filter(c => c[0] === repo);
    if (matching.length !== 1) { problems.push(repo + ': missing or duplicate revision'); continue; }
    if (matching[0].length !== 5) problems.push(repo + ': invalid revision row format');
    const [, sha, url, reviewer, date] = matching[0];
    if (!SHA.test(sha ?? '')) problems.push(repo + ': missing immutable SHA');
    if (!validCiRun(url,repo)) problems.push(repo + ': missing or unrelated GitHub Actions run');
    if (!reviewer || reviewer === 'TODO') problems.push(repo + ': missing reviewer');
    if (!validUtcDate(date)) problems.push(repo + ': missing valid UTC date');
  }
  for (const row of revisions) {
    if (!EXPECTED_REPOS.includes(row[0])) problems.push('Unknown revision component: ' + row[0]);
  }
  const gates = rows(text, 'Required acceptance gates');
  for (const gate of EXPECTED_GATES) {
    const matching = gates.filter(c => c[0] === gate);
    if (matching.length !== 1) { problems.push(gate + ': missing or duplicate gate'); continue; }
    if (matching[0][2] !== 'PASS') problems.push(gate + ': not PASS');
    if (matching[0].length !== 4) problems.push(gate + ': missing HTTPS evidence URL (invalid row format)');
    if (!validEvidenceUrl(matching[0][3])) problems.push(gate + ': missing HTTPS evidence URL');
  }
  for (const row of gates) {
    if (!EXPECTED_GATES.includes(row[0])) problems.push('Unknown acceptance gate: ' + row[0]);
  }
  // A PASS table alone is insufficient: a reviewer must link a sanitized evidence bundle.
  const evidence = text.match(/^## Signed release evidence\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m)?.[1] ?? '';
  const evidenceUrl = evidence.match(/^- Evidence bundle:\s*(https:\/\/\S+)/m)?.[1];
  if (!validEvidenceUrl(evidenceUrl)) problems.push('Missing signed evidence bundle URL');
  const approver = evidence.match(/^- Approved by:[ \t]*(.*)$/m)?.[1]?.trim();
  if (!approver || approver === 'TODO') problems.push('Missing owner approval');
  const approvedAt = evidence.match(/^- Approved at \(UTC\):[ \t]*(.*)$/m)?.[1]?.trim();
  if (!approvedAt || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(approvedAt) || Number.isNaN(Date.parse(approvedAt))) problems.push('Missing valid UTC approval timestamp');
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
