import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { validateStagingRelease } from '../../../scripts/verify-staging-release.mjs';

const draft = readFileSync(new URL('../../../docs/staging-acceptance-evidence.md', import.meta.url), 'utf8');
const sha = 'a'.repeat(40);
const ciFor = repo => 'https://github.com/nurgeldiserikbay/services-' + ({Backend:'back',Frontend:'front',Admin:'admin'})[repo] + '/actions/runs/12345';

function approvedDocument() {
  let text = draft.replace('Status: **NOT VERIFIED**', 'Status: **VERIFIED**');
  for (const repo of ['Backend', 'Frontend', 'Admin']) {
    text = text.replace(
      '| ' + repo + ' | TODO | TODO | TODO | TODO |',
      '| ' + repo + ' | ' + sha + ' | ' + ciFor(repo) + ' | Reviewer | 2026-11-12 |',
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
  assert.ok(validateStagingRelease(valid.replace('Status: **VERIFIED**', 'Status: **NOT VERIFIED**')).some(p => p.includes('status')));
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


test('wrong-repository CI evidence cannot approve frontend, backend or admin revisions', () => {
  const valid=approvedDocument();
  const bad=valid.replace(ciFor('Frontend'),ciFor('Backend'));
  assert.ok(validateStagingRelease(bad).some(problem=>problem.includes('Frontend: missing or unrelated GitHub Actions run')));
  for(const forged of [
    'https://github.com/malicious/services-front/actions/runs/12345',
    'https://github.com/nurgeldiserikbay/services-front/actions/runs/12345?token=secret',
    'https://github.com/nurgeldiserikbay/services-front/actions/runs/0',
    'http://github.com/nurgeldiserikbay/services-front/actions/runs/12345',
  ]){
    const changed=valid.replace(ciFor('Frontend'),forged);
    assert.ok(validateStagingRelease(changed).some(p=>p.includes('Frontend: missing or unrelated GitHub Actions run')),forged);
  }
});

test('malformed or impossible revision dates fail closed', () => {
  const valid=approvedDocument();
  for(const value of ['2026-99-99','2026-02-30','2026-11-12extra','2026-11-12T18:00:00Z','TODO']){
    const tampered=valid.replace(' | Reviewer | 2026-11-12 |',' | Reviewer | '+value+' |');
    assert.ok(validateStagingRelease(tampered).some(p=>p.includes('missing valid UTC date')),value);
  }
});

test('evidence URL cannot carry secrets, credentials or malformed HTTPS', () => {
  const valid=approvedDocument();
  for(const value of [
    'https://user:token@example.com/gate-evidence',
    'https://example.com/gate-evidence?secret=abc',
    'https://example.com/gate-evidence#fragment',
    'https://TODO',
    'https://example.com:444/gate-evidence',
    'https://example.com/gate-evidence|extra',
  ]){
    const tampered=valid.replace('https://example.com/gate-evidence',value);
    assert.ok(validateStagingRelease(tampered).some(p=>p.includes('missing HTTPS evidence URL')),value);
  }
  const forgedBundle=valid.replace('https://example.com/release-evidence',
    'https://admin:token@example.com/release-evidence');
  assert.ok(validateStagingRelease(forgedBundle).some(p=>p.includes('signed evidence bundle')));
});

test('unexpected revision or acceptance gate cannot be smuggled into a verified document',()=>{
  const valid=approvedDocument();
  const extraRevision=valid.replace('| Admin | '+sha,
    '| Unexpected | '+sha+' | '+ciFor('Admin')+' | Reviewer | 2026-11-12 |\n| Admin | '+sha);
  assert.ok(validateStagingRelease(extraRevision).some(p=>p.includes('Unknown revision component')));
  const gate=valid.split('\n').find(line=>line.startsWith('| Authentication |'));
  const extraGate=valid.replace(gate,gate+'\n'+gate.replace('| Authentication |','| Unexpected gate |'));
  assert.ok(validateStagingRelease(extraGate).some(p=>p.includes('Unknown acceptance gate')));
});


test('online staging CI provenance verifies successful runs at exactly the staged SHAs',async()=>{
  const {verifyStagingCiProvenance}=await import('../../../scripts/verify-staging-ci-provenance.mjs');
  const visited=[];
  const fetchImpl=async(url,options)=>{
    visited.push({url,options});
    const repo=url.match(/repos\/(nurgeldiserikbay\/services-(?:back|front|admin))\//)?.[1];
    assert.ok(repo,'unexpected repo API request');
    return Response.json({
      id:12345,head_sha:sha,status:'completed',conclusion:'success',
      repository:{full_name:repo},
    });
  };
  const problems=await verifyStagingCiProvenance(approvedDocument(),{fetchImpl});
  assert.deepEqual(problems,[]);
  assert.equal(visited.length,3);
  for(const call of visited){
    assert.ok(call.url.startsWith('https://api.github.com/repos/nurgeldiserikbay/services-'));
    assert.equal(call.options.method,'GET');
    assert.equal(call.options.credentials,'omit');
    assert.equal(call.options.redirect,'manual');
  }
});

test('online CI provenance does not request network for an unapproved staging draft',async()=>{
  const {verifyStagingCiProvenance}=await import('../../../scripts/verify-staging-ci-provenance.mjs');
  const problems=await verifyStagingCiProvenance(draft,{
    fetchImpl:()=>{throw Error('must not fetch for incomplete evidence');},
  });
  assert.ok(problems.length>0);
});

test('online CI provenance fails on wrong SHA, repo, pending or unsuccessful runs',async()=>{
  const {verifyStagingCiProvenance}=await import('../../../scripts/verify-staging-ci-provenance.mjs');
  for(const mutation of [
    {head_sha:'b'.repeat(40)},
    {repository:{full_name:'nurgeldiserikbay/services-wrong'}},
    {status:'in_progress'},
    {conclusion:'failure'},
    {id:54321},
  ]){
    const fetchImpl=async(url)=>{
      const repo=url.match(/repos\/(nurgeldiserikbay\/services-(?:back|front|admin))\//)?.[1];
      return Response.json({
        id:12345,head_sha:sha,status:'completed',conclusion:'success',
        repository:{full_name:repo},
        ...mutation,
      });
    };
    const problems=await verifyStagingCiProvenance(approvedDocument(),{fetchImpl});
    assert.ok(problems.some(problem=>problem.includes('does not prove successful run')),JSON.stringify(mutation));
  }
});

test('online CI provenance fails closed for rate limits, redirects and oversized reports',async()=>{
  const {verifyStagingCiProvenance}=await import('../../../scripts/verify-staging-ci-provenance.mjs');
  for(const responseFactory of [
    ()=>new Response(null,{status:429}),
    ()=>new Response(null,{status:302,headers:{location:'https://evil.example/test'}}),
    ()=>new Response('x'.repeat(130*1024),{status:200}),
  ]){
    const problems=await verifyStagingCiProvenance(approvedDocument(),{fetchImpl:async()=>responseFactory()});
    assert.ok(problems.length>=1);
  }
});
