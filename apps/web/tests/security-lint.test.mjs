import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';

test('security lint scans frontend source and rejects unsafe browser primitives',()=>{
  const path=new URL('../scripts/lint-security.mjs',import.meta.url);
  const source=readFileSync(path,'utf8');
  for(const token of ['eval','dangerouslySetInnerHTML','innerHTML','localStorage','sessionStorage','NODE_TLS_REJECT_UNAUTHORIZED']){
    assert.ok(source.includes(token),`Missing guard for ${token}`);
  }
  const result=spawnSync(process.execPath,[path.pathname],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/Security lint passed for \d+ source files/);
});

test('security lint rejects dangerous constructs with location and nonzero exit',()=>{
  const dir=mkdtempSync(join(tmpdir(),'services-security-lint-'));
  try {
    mkdirSync(join(dir,'nested'));
    const cases=[
      ['eval.ts','eval(userInput);','dynamic JavaScript execution'],
      ['html.tsx','<div dangerouslySetInnerHTML={value} />','unsafe HTML injection'],
      ['mutation.js','element.innerHTML = response;','direct DOM HTML mutation'],
      ['storage.jsx','localStorage.setItem("token", secret);','client-side storage of credentials'],
      ['tls.mjs','NODE_TLS_REJECT_UNAUTHORIZED=0','disabled TLS verification'],
    ];
    for(const [file,source] of cases)writeFileSync(join(dir,'nested',file),source+'\\n');
    const script=fileURLToPath(new URL('../scripts/lint-security.mjs',import.meta.url));
    const result=spawnSync(process.execPath,[script,dir],{encoding:'utf8'});
    assert.equal(result.status,1,'unsafe code must fail the lint gate');
    for(const [file,,description] of cases){
      assert.ok(result.stderr.includes(file+':1: '+description),result.stderr);
    }
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('security lint permits normal React text content and safe browser usage',()=>{
  const dir=mkdtempSync(join(tmpdir(),'services-safe-lint-'));
  try {
    writeFileSync(join(dir,'component.tsx'),'export const Element=()=> <div>{message}</div>;\\n');
    writeFileSync(join(dir,'client.ts'),'const item=sessionStorage.getItem("theme");\\n');
    const script=fileURLToPath(new URL('../scripts/lint-security.mjs',import.meta.url));
    const result=spawnSync(process.execPath,[script,dir],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    assert.match(result.stdout,/Security lint passed for 2 source files/);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
