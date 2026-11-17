#!/usr/bin/env node
// Optional online provenance gate. A matching URL alone is not proof a run
// succeeded or tested the staged SHA. Never treats CI as release approval.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {validateStagingRelease} from './verify-staging-release.mjs';

const components={
  Backend:'nurgeldiserikbay/services-back',
  Frontend:'nurgeldiserikbay/services-front',
  Admin:'nurgeldiserikbay/services-admin',
};
const MAX_BYTES=128*1024;

function revisionRows(document){
  const section=document.split('## Immutable revision record\n')[1]?.split('\n## ')[0]??'';
  return section.split('\n').filter(line=>/^\| (?:Backend|Frontend|Admin) \|/.test(line))
    .map(line=>line.split('|').slice(1,-1).map(part=>part.trim()));
}

async function readJsonBounded(response){
  if(Number(response.headers?.get('content-length')??0)>MAX_BYTES)throw Error('GitHub CI response oversized');
  if(!response.body?.getReader)throw Error('GitHub CI response body unavailable');
  const reader=response.body.getReader();
  const chunks=[];
  let total=0;
  try {
    while(true){
      const {value,done}=await reader.read();
      if(done)break;
      total+=value.byteLength;
      if(total>MAX_BYTES)throw Error('GitHub CI response oversized');
      chunks.push(Buffer.from(value));
    }
  }finally{await reader.cancel().catch(()=>{});}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function verifyStagingCiProvenance(document,{fetchImpl=fetch}={}){
  const problems=validateStagingRelease(document);
  // Do not perform network requests for incomplete/unapproved evidence.
  if(problems.length)return problems;
  for(const [component,sha,ciUrl] of revisionRows(document)){
    const repo=components[component];
    if(!repo){problems.push('Unknown CI component');continue;}
    const match=ciUrl.match(/\/actions\/runs\/([1-9]\d*)$/);
    if(!match){problems.push(component+': invalid CI run URL');continue;}
    const apiUrl='https://api.github.com/repos/'+repo+'/actions/runs/'+match[1];
    try{
      const response=await fetchImpl(apiUrl,{
        method:'GET',redirect:'manual',credentials:'omit',
        headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},
        signal:AbortSignal.timeout(10000),
      });
      if(response.status!==200){
        problems.push(component+': CI status unavailable or not HTTP 200');
        continue;
      }
      const run=await readJsonBounded(response);
      if(run.repository?.full_name!==repo||
        String(run.id)!==match[1]||
        String(run.head_sha??'').toLowerCase()!==sha.toLowerCase()||
        run.status!=='completed'||run.conclusion!=='success'){
        problems.push(component+': CI does not prove successful run for staged SHA');
      }
    }catch{
      problems.push(component+': CI provenance could not be verified');
    }
  }
  return problems;
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  const path=process.argv[2]??fileURLToPath(new URL('../docs/staging-acceptance-evidence.md',import.meta.url));
  try{
    const problems=await verifyStagingCiProvenance(readFileSync(path,'utf8'));
    if(problems.length){
      console.error('NO-GO: '+problems.length+' staging CI provenance requirement(s) unmet');
      for(const problem of problems)console.error('- '+problem);
      process.exitCode=1;
    }else{
      console.log('CI revision provenance verified; manual staging, security and release approvals still required.');
    }
  }catch(error){
    console.error('NO-GO: staging CI provenance check could not run: '+error.message);
    process.exitCode=1;
  }
}
