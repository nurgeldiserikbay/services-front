import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const worker=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
const offline=readFileSync(new URL('../public/offline.html',import.meta.url),'utf8');
const register=readFileSync(new URL('../src/components/OfflineRegistration.tsx',import.meta.url),'utf8');

test('offline shell does not cache private API or authenticated responses',()=>{
  assert.match(worker,/request\.mode!=='navigate'/);
  assert.match(worker,/request\.method!=='GET'/);
  assert.match(worker,/parts\[1\]==='professionals'/);
  assert.match(worker,/parts\[1\]==='organizations'/);
  assert.match(worker,/parts\[1\]==='services'/);
  assert.doesNotMatch(worker,/cache\.put\(/);
  assert.doesNotMatch(worker,/cache\.addAll\(/);
  assert.match(worker,/cache\.add\(FALLBACK\)/);
  assert.match(worker,/fetch\(request\)\.catch/);
  assert.match(register,/window\.isSecureContext/);
  assert.match(register,/updateViaCache:'none'/);
});

test('offline page contains no personalized data or indexable content',()=>{
  assert.match(offline,/name="robots" content="noindex,nofollow"/);
  assert.match(offline,/lang="kk"/);
  assert.match(offline,/Нет подключения/);
  assert.doesNotMatch(offline,/<script|localStorage|indexedDB|\/api\//i);
});


test('offline shell offers accessible Kazakh and Russian retry routes',()=>{
  assert.match(offline,/<main id="main-content">/);
  assert.match(offline,/<a href="\/kk">/);
  assert.match(offline,/<a href="\/ru" lang="ru">/);
  assert.match(offline,/<p lang="ru">/);
  assert.match(offline,/a:focus-visible/);
  assert.match(offline,/@media\(forced-colors:active\)/);
  assert.doesNotMatch(offline,/href="https?:/);
});
