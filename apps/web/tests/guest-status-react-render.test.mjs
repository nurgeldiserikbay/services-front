import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const require=createRequire(import.meta.url);
const filename=fileURLToPath(new URL('../src/components/GuestRequestStatusCheck.tsx',import.meta.url));
const source=readFileSync(filename,'utf8');
// Run the actual TSX component through the project's existing TypeScript
// transpiler, not a fake reimplementation of its receipt-switch logic.
const compiled=ts.transpileModule(source,{
  fileName:filename,
  compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022},
});
assert.equal(compiled.diagnostics?.length??0,0);
const Module=require('node:module');
const instance=new Module(filename);
instance.filename=filename;
instance.paths=Module._nodeModulePaths(dirname(filename));
instance.require=(id)=>{
  if(id==='@/lib/guest-status-ui-core.mjs')
    return {
      privateGuestStatusUrl:()=>'/private',
      readPrivateGuestStatusResponse:()=>Promise.reject(new Error('not invoked')),
      shouldReplaceGuestStatus:()=>false,
      withGuestStatusAbort:()=>Promise.reject(new Error('not invoked')),
    };
  if(id==='./GuestRequestStatusCheck.module.css')return {default:{panel:'test-panel',error:'test-error'}};
  if(id==='./RequestTimeline')return {RequestTimeline:()=>React.createElement('span',null,'timeline')};
  return require(id);
};
instance._compile(compiled.outputText,filename);
const {GuestRequestStatusCheck}=instance.exports;
const requestA='11111111-1111-4111-8111-111111111111';
const requestB='22222222-2222-4222-8222-222222222222';
const offerA='33333333-3333-4333-8333-333333333333';
const offerB='44444444-4444-4444-8444-444444444444';
const props=(requestId,serviceOfferId,locale='kk')=>({requestId,serviceOfferId,locale});

test('actual React receipt subtree identity changes with either request or offer',()=>{
  const a=GuestRequestStatusCheck(props(requestA,offerA));
  const repeat=GuestRequestStatusCheck(props(requestA,offerA));
  const changedRequest=GuestRequestStatusCheck(props(requestB,offerA));
  const changedOffer=GuestRequestStatusCheck(props(requestA,offerB));
  assert.equal(a.key,repeat.key);
  assert.notEqual(a.key,changedRequest.key);
  assert.notEqual(a.key,changedOffer.key);
  assert.equal(a.type,repeat.type);
});

test('real server render starts unverified, without another receipt status or network calls',()=>{
  for(const locale of ['kk','ru']){
    for(const receipt of [props(requestA,offerA,locale),props(requestB,offerB,locale)]){
      const output=renderToStaticMarkup(React.createElement(GuestRequestStatusCheck,receipt));
      assert.match(output,/<button type="button"/);
      assert.match(output,/role="status"/);
      assert.doesNotMatch(output,/Орындаушы қабылдады|Исполнитель принял заявку/);
      assert.doesNotMatch(output,/timeline|11111111-1111-4111|22222222-2222-4222/);
      assert.match(output,locale==='kk'?/Күйін жаңарту/:/Обновить статус/);
    }
  }
});
