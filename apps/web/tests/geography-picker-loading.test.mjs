import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const source=readFileSync(new URL('../src/components/GeographyPicker.tsx',import.meta.url),'utf8');

test('city options are cleared while a new country or city query loads',()=>{
  assert.match(source,/setCitiesBusy\(true\);\s*setCityResultsReady\(false\);\s*setCities\(\[\]\);/);
  assert.match(source,/return \(\)=>controller\.abort\(\);\s*},\[countryId,debouncedCityQuery,cityRequestVersion\]\);/);
  assert.match(source,/\.finally\(\(\)=>\{if\(!controller\.signal\.aborted\)setCitiesBusy\(false\)\}\)/);
});

test('a previously selected city remains a valid form option during refresh',()=>{
  assert.match(source,/cityId&&!cities\.some\(c=>c\.id===cityId\)&&<option value=\{cityId\}>/);
  assert.match(source,/<select name="city_id" value=\{cityId\} onChange=/);
  assert.doesNotMatch(source,/<select name="city_id"[^>]*disabled=/);
});


test('geography retry clears city error and preserves a selected country',()=>{
  assert.match(source,/setCitiesBusy\(true\);\s*setCityResultsReady\(false\);\s*setCities\(\[\]\);\s*setCityError\(false\);/);
  assert.match(source,/countryId&&!countries\.some\(c=>c\.id===countryId\)&&<option value=\{countryId\}>/);
});


test('country and city lookup errors are tracked separately',()=>{
  assert.match(source,/const \[cityError,setCityError\]=useState\(false\)/);
  assert.match(source,/setCitiesBusy\(true\);\s*setCityResultsReady\(false\);\s*setCities\(\[\]\);\s*setCityError\(false\)/);
  assert.match(source,/\.catch\(\(\)=>\{if\(!controller\.signal\.aborted\)setCityError\(true\)\}\)/);
  assert.match(source,/!queryPending&&cityError&&<p role="status"/);
});


test('failed city lookup can be retried without changing filters',()=>{
  assert.match(source,/const \[cityRequestVersion,setCityRequestVersion\]=useState\(0\)/);
  assert.match(source,/onClick=\{\(\)=>setCityRequestVersion\(v=>v\+1\)\}/);
  assert.match(source,/\[countryId,debouncedCityQuery,cityRequestVersion\]/);
});


test('failed country lookup can be retried without resetting the geography form',()=>{
  assert.match(source,/const \[countryRequestVersion,setCountryRequestVersion\]=useState\(0\)/);
  assert.match(source,/onClick=\{\(\)=>setCountryRequestVersion\(v=>v\+1\)\}/);
  assert.match(source,/\[countryRequestVersion\]/);
});


test('empty city search is announced only after a successful lookup',()=>{
  assert.match(source,/const \[cityResultsReady,setCityResultsReady\]=useState\(false\)/);
  assert.match(source,/setCityResultsReady\(false\)/);
  assert.match(source,/setCityResultsReady\(true\)/);
  assert.match(source,/countryId&&cityResultsReady&&!citiesBusy&&!queryPending&&!cityError&&cities\.length===0&&<p role="status"/);
});


test('city autocomplete requests are debounced and previous timer is cancelled',()=>{
  assert.match(source,/setTimeout\(\(\)=>\{setDebouncedCityQuery\(cityQuery\);setQueryPending\(false\)\},250\)/);
  assert.match(source,/return \(\)=>clearTimeout\(timer\)/);
  assert.match(source,/\[countryId,debouncedCityQuery,cityRequestVersion\]/);
});


test('pending debounced city input suppresses stale empty feedback',()=>{
  assert.match(source,/const \[queryPending,setQueryPending\]=useState\(false\)/);
  assert.match(source,/setCityQuery\(e\.target\.value\);setQueryPending\(true\)/);
  assert.match(source,/cityResultsReady&&!citiesBusy&&!queryPending&&!cityError&&cities\.length===0/);
});


test('stale city options and lookup errors stay hidden during pending input',()=>{
  assert.match(source,/!queryPending&&cities\.map\(c=><option/);
  assert.match(source,/!queryPending&&cityError&&<p role="status"/);
});
