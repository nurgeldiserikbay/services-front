import assert from 'node:assert/strict';
import {test} from 'node:test';
import {isCountry,isCity,parseCountries,parseCities,projectPublicGeographyCatalog} from '../src/lib/geography-catalog.mjs';

const A='10000000-0000-4000-8000-000000000001';
const B='10000000-0000-4000-8000-000000000002';
const C='10000000-0000-4000-8000-000000000003';
const country={id:A,name:'Kazakhstan',iso2:'KZ'};
const city={id:C,country_id:A,area_id:null,name:'Astana',timezone:'Asia/Almaty'};

test('well-formed empty catalog is success, missing or malformed items fail',()=>{
  assert.deepEqual(parseCountries({items:[]}),[]);
  assert.deepEqual(parseCities({items:[]},A),[]);
  for(const value of [null,{},[],{items:null},{items:'no'},{items:[null]}]){
    assert.throws(()=>parseCountries(value),/invalid country catalog/);
    assert.throws(()=>parseCities(value,A),/invalid city catalog/);
  }
});

test('country parser checks each entry, not just the containing array',()=>{
  assert.deepEqual(parseCountries({items:[country]}),[country]);
  for(const entry of [{...country,id:'bad'},{...country,name:'   '},{...country,iso2:'KAZ'},{...country,iso2:'4Z'},{...country,name:null}]){
    assert.equal(isCountry(entry),false);
    assert.throws(()=>parseCountries({items:[country,entry]}),/invalid country catalog/);
  }
});

test('city parser validates fields and filters cross-country entries',()=>{
  assert.equal(isCity(city),true);
  assert.deepEqual(parseCities({items:[city,{...city,id:B,country_id:B}]},A),[city]);
  assert.deepEqual(parseCities({items:[city]},A.toUpperCase()),[city]);
  for(const entry of [{...city,id:'bad'},{...city,country_id:'bad'},{...city,name:' '},{...city,timezone:''},{...city,area_id:'bad'},null]){
    assert.equal(isCity(entry),false);
    assert.throws(()=>parseCities({items:[entry]},A),/invalid city catalog/);
  }
  assert.throws(()=>parseCities({items:[city]},'not-a-uuid'),/invalid city catalog/);
});

test('public country and city responses exclude nested unknown upstream fields',()=>{
  const c={...country,private_email:'internal@example.com',debug:{token:'secret'}};
  const cityWithExtras={...city,internal_notes:'not public',phone:'private'};
  assert.deepEqual(projectPublicGeographyCatalog('countries',{items:[c]}),{items:[country]});
  assert.deepEqual(projectPublicGeographyCatalog('cities',{items:[cityWithExtras]}),{items:[city]});
  assert.deepEqual(projectPublicGeographyCatalog('countries',{items:[]}),{items:[]});
  assert.throws(()=>projectPublicGeographyCatalog('countries',{items:[{...country,id:'invalid'}]}),/invalid country catalog/);
  assert.throws(()=>projectPublicGeographyCatalog('cities',{items:[{...city,timezone:null}]}),/invalid city catalog/);
});

test('area directory enforces the backend DTO and drops unknown fields',()=>{
  const area={id:B,country_id:A,code:'AST',name:'Region'};
  const withExtras={...area,internal_notes:'private',credentials:{token:'secret'}};
  assert.deepEqual(projectPublicGeographyCatalog('areas',{items:[withExtras],debug:'ignore'}),{items:[area]});
  assert.deepEqual(projectPublicGeographyCatalog('areas',{items:[]}),{items:[]});
  for(const invalid of [
    {...area,id:'invalid'},
    {...area,country_id:'invalid'},
    {...area,code:3},
    {...area,name:' '},
    {...area,code:undefined},
    null
  ])assert.throws(()=>projectPublicGeographyCatalog('areas',{items:[invalid]}),/invalid area catalog/);
  assert.deepEqual(projectPublicGeographyCatalog('areas',{items:[{...area,code:null}]}),{items:[{...area,code:null}]});
  assert.throws(()=>projectPublicGeographyCatalog('unknown',{items:[]}),/invalid geography kind/);
});
