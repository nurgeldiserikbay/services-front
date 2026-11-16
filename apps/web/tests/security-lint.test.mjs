import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
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
