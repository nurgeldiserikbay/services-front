import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const source=readFileSync(new URL('../src/components/GeographyPicker.tsx',import.meta.url),'utf8');

test('city options are cleared while a new country or city query loads',()=>{
  assert.match(source,/setCitiesBusy\(true\);\s*setCityResultsReady\(false\);\s*setCities\(\[\]\);/);
  assert.match(source,/return \(\)=>controller\.abort\(\);\s*},\[countryId,debouncedCityQuery,cityRequestVersion\]\);/);
  assert.match(source,/\.finally\(\(\)=>\{if\(isCurrent\(\)\)setCitiesBusy\(false\)\}\)/);
});

test('a previously selected city remains a valid form option during refresh',()=>{
  assert.match(source,/cityId&&!cities\.some\(c=>c\.id===cityId\)&&<option value=\{cityId\}>/);
  assert.match(source,/<select id="geography-city-select" name="city_id" value=\{cityId\}/);
  assert.doesNotMatch(source,/<select id="geography-city-select"[^>]*\sdisabled=/);
});


test('geography retry clears city error and preserves a selected country',()=>{
  assert.match(source,/setCitiesBusy\(true\);\s*setCityResultsReady\(false\);\s*setCities\(\[\]\);\s*setCityError\(false\);/);
  assert.match(source,/countryId&&!countries\.some\(c=>c\.id===countryId\)&&<option value=\{countryId\}>/);
});


test('country and city lookup errors are tracked separately',()=>{
  assert.match(source,/const \[cityError,setCityError\]=useState\(false\)/);
  assert.match(source,/setCitiesBusy\(true\);\s*setCityResultsReady\(false\);\s*setCities\(\[\]\);\s*setCityError\(false\)/);
  assert.match(source,/\.catch\(\(\)=>\{if\(isCurrent\(\)\)\{setCityError\(true\);setQueryPending\(false\)\}\}\)/);
  assert.match(source,/!queryPending&&cityError&&<p id="geography-city-error" role="status"/);
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
  assert.match(source,/setTimeout\(\(\)=>setDebouncedCityQuery\(cityQuery\),250\)/);
  assert.match(source,/return \(\)=>clearTimeout\(timer\)/);
  assert.match(source,/\[countryId,debouncedCityQuery,cityRequestVersion\]/);
});


test('pending debounced city input suppresses stale empty feedback',()=>{
  assert.match(source,/const \[queryPending,setQueryPending\]=useState\(false\)/);
  assert.match(source,/setCityQuery\(e\.target\.value\);setQueryPending\(true\)/);
  assert.match(source,/cityResultsReady&&!citiesBusy&&!queryPending&&!cityError&&cities\.length===0/);
});


test('stale city options and lookup errors stay hidden during pending input',()=>{
  assert.match(source,/!queryPending&&!cityError&&cities\.map\(c=><option/);
  assert.match(source,/!queryPending&&cityError&&<p id="geography-city-error" role="status"/);
});


test('late city responses cannot overwrite new input during debounce',()=>{
  assert.match(source,/const cityInputGeneration=useRef\(0\)/);
  assert.match(source,/const generation=cityInputGeneration\.current/);
  assert.match(source,/generation===cityInputGeneration\.current/);
  assert.match(source,/if\(isCurrent\(\)\)\{setCities\(/);
  assert.match(source,/cityInputGeneration\.current\+\+;setCityQuery\(e\.target\.value\)/);
});


test('retrying country lookup restores loading state until request settles',()=>{
  assert.match(source,/setError\(false\);\s*setBusy\(true\);\s*setCountryResultsReady\(false\);\s*setCountries\(\[\]\);\s*fetch\('\/api\/geography\/countries'/);
  assert.match(source,/\.finally\(\(\)=>\{if\(!controller\.signal\.aborted\)setBusy\(false\)\}\)/);
});


test('city search exposes a busy relationship and prevents edits without omitting form value',()=>{
  assert.match(source,/aria-controls="geography-city-select"/);
  assert.match(source,/aria-busy=\{citiesBusy\|\|queryPending\}/);
  assert.match(source,/aria-disabled=\{citiesBusy\|\|queryPending\|\|cityError\}/);
  assert.match(source,/if\(citiesBusy\|\|queryPending\|\|cityError\)return/);
});


test('pending city input remains pending until the latest lookup resolves',()=>{
  assert.match(source,/setTimeout\(\(\)=>setDebouncedCityQuery\(cityQuery\),250\)/);
  assert.match(source,/setCityResultsReady\(true\);setQueryPending\(false\)/);
  assert.match(source,/setCityError\(true\);setQueryPending\(false\)/);
});


test('geography loading is announced to screen readers',()=>{
  assert.match(source,/<p role="status" aria-live="polite" aria-atomic="true" className="sr-only">/);
  assert.match(source,/busy\?t\.loading:countryId&&\(citiesBusy\|\|queryPending\)\?t\.loading:""/);
});


test('failed city lookup cannot expose stale choices or accept a selection',()=>{
  assert.match(source,/aria-disabled=\{citiesBusy\|\|queryPending\|\|cityError\}/);
  assert.match(source,/if\(citiesBusy\|\|queryPending\|\|cityError\)return/);
  assert.match(source,/!queryPending&&!cityError&&cities\.map/);
});


test('empty country directory is distinct from a request failure',()=>{
  assert.match(source,/const \[countryResultsReady,setCountryResultsReady\]=useState\(false\)/);
  assert.match(source,/setCountryResultsReady\(true\)/);
  assert.match(source,/countryResultsReady&&!busy&&!error&&countries\.length===0&&<p role="status"/);
});


test('country directory retry does not expose stale country choices',()=>{
  assert.match(source,/setCountryResultsReady\(false\);\s*setCountries\(\[\]\);\s*fetch\('\/api\/geography\/countries'/);
  assert.match(source,/!error&&countries\.map\(c=><option/);
});


test('empty country and city catalogs can be retried without refreshing page',()=>{
  assert.match(source,/countries\.length===0&&<p role="status"[^\n]*setCountryRequestVersion\(v=>v\+1\)/);
  assert.match(source,/cities\.length===0&&<p role="status"[^\n]*setCityRequestVersion\(v=>v\+1\)/);
});


test('country and city lookup errors are associated with their form controls',()=>{
  assert.match(source,/aria-invalid=\{error\} aria-describedby=\{error\?"geography-country-error":undefined\}/);
  assert.match(source,/id="geography-country-error" role="status"/);
  assert.match(source,/aria-invalid=\{cityError&&!queryPending\} aria-describedby=\{cityError&&!queryPending\?"geography-city-error":undefined\}/);
  assert.match(source,/id="geography-city-error" role="status"/);
});

test('country and city inputs expose accurate assistive busy and error states',()=>{
  assert.match(source,/name="country_id" value=\{countryId\} disabled=\{busy\} aria-busy=\{busy\} aria-invalid=\{error\}/);
  assert.match(source,/value=\{cityQuery\} aria-controls="geography-city-select" aria-busy=\{citiesBusy\|\|queryPending\} aria-invalid=\{cityError&&!queryPending\}/);
  assert.match(source,/aria-describedby=\{cityError&&!queryPending\?"geography-city-error":undefined\} onChange=/);
  assert.match(source,/name="city_id" value=\{cityId\} aria-busy=\{citiesBusy\|\|queryPending\}/);
  assert.match(source,/aria-invalid=\{cityError&&!queryPending\} aria-describedby=\{cityError&&!queryPending\?"geography-city-error":undefined\}/);
});
