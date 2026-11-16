import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const source=readFileSync(new URL('../src/components/GeographyPicker.tsx',import.meta.url),'utf8');

test('city options are cleared while a new country or city query loads',()=>{
  assert.match(source,/setCitiesBusy\(true\);\s*setCities\(\[\]\);/);
  assert.match(source,/return \(\)=>controller\.abort\(\);\s*},\[countryId,cityQuery\]\);/);
  assert.match(source,/\.finally\(\(\)=>\{if\(!controller\.signal\.aborted\)setCitiesBusy\(false\)\}\)/);
});

test('a previously selected city remains a valid form option during refresh',()=>{
  assert.match(source,/cityId&&!cities\.some\(c=>c\.id===cityId\)&&<option value=\{cityId\}>/);
  assert.match(source,/<select name="city_id" value=\{cityId\} onChange=/);
  assert.doesNotMatch(source,/<select name="city_id"[^>]*disabled=/);
});


test('geography retry clears city error and preserves a selected country',()=>{
  assert.match(source,/setCitiesBusy\(true\);\s*setCities\(\[\]\);\s*setCityError\(false\);/);
  assert.match(source,/countryId&&!countries\.some\(c=>c\.id===countryId\)&&<option value=\{countryId\}>/);
});


test('country and city lookup errors are tracked separately',()=>{
  assert.match(source,/const \[cityError,setCityError\]=useState\(false\)/);
  assert.match(source,/setCitiesBusy\(true\);\s*setCities\(\[\]\);\s*setCityError\(false\)/);
  assert.match(source,/\.catch\(\(\)=>\{if\(!controller\.signal\.aborted\)setCityError\(true\)\}\)/);
  assert.match(source,/\(error\|\|cityError\)&&<p role="status"/);
});
