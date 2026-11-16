import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';

const script=fileURLToPath(new URL('../scripts/lint-ast.mjs',import.meta.url));
function runFixture(source,filename='fixture.ts'){
  const dir=mkdtempSync(join(tmpdir(),'services-ast-lint-'));
  try{
    writeFileSync(join(dir,filename),source);
    return spawnSync(process.execPath,[script,dir],{encoding:'utf8'});
  }finally{rmSync(dir,{recursive:true,force:true});}
}
test('AST lint accepts valid TypeScript and TSX',()=>{
  const ts=runFixture('export const sum=(a:number,b:number):number=>a+b;\n');
  assert.equal(ts.status,0,ts.stderr);
  const tsx=runFixture('export const Button=()=> <button type="button">OK</button>;\n','component.tsx');
  assert.equal(tsx.status,0,tsx.stderr);
});
test('AST lint rejects debugger statements with file and line',()=>{
  const r=runFixture('const x=1;\ndebugger;\n');
  assert.equal(r.status,1);
  assert.match(r.stderr,/fixture\.ts:2: debugger statement is not permitted/);
});
test('AST lint rejects dangerous TypeScript suppression directives',()=>{
  for(const directive of ['// @ts-ignore','// @ts-nocheck']){
    const r=runFixture(directive+'\nconst value=1;\n');
    assert.equal(r.status,1);
    assert.match(r.stderr,/suppression directive is forbidden/);
  }
});
test('AST lint rejects syntax errors',()=>{
  const r=runFixture('const x = ;\n');
  assert.equal(r.status,1);
  assert.match(r.stderr,/invalid JavaScript\/TypeScript syntax/);
});

test('AST lint rejects computed-property access bypasses',()=>{
  const cases=[
    ["localStorage['setItem']('token', secret);",'client-side storage writes'],
    ['window["localStorage"]["setItem"]("token",secret);','client-side storage writes'],
    ["element['innerHTML'] = dangerous;",'direct DOM HTML mutation'],
    ["window['eval']('1+1');",'dynamic JavaScript execution'],
    ["globalThis['Function']('return 1');",'dynamic JavaScript execution']
  ];
  for(const [source,rule] of cases){
    const result=runFixture(source+'\n');
    assert.equal(result.status,1,`${source}: ${result.stderr}`);
    assert.ok(result.stderr.includes(rule),result.stderr);
  }
});
test('AST lint permits safe computed-property reads',()=>{
  const result=runFixture("const theme=localStorage['getItem']('theme');\nconst current=element['textContent'];\n");
  assert.equal(result.status,0,result.stderr);
});
