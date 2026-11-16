import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateGeographyQuery} from '../src/lib/geography-query.mjs';

const id='10000000-0000-4000-8000-000000000001';

test('accepts a valid single value for each allowed geographic filter',()=>{
  const result=validateGeographyQuery(new URLSearchParams({q:'Astana',country_id:id,area_id:id}));
  assert.equal(result.get('q'),'Astana');
  assert.equal(result.get('country_id'),id);
  assert.equal(result.get('area_id'),id);
});

test('rejects duplicate query filters, even when values match',()=>{
  for(const query of ['q=one&q=two','q=one&q=one','country_id='+id+'&country_id='+id,'area_id='+id+'&area_id='+id]){
    assert.throws(()=>validateGeographyQuery(new URLSearchParams(query)),/invalid_query/);
  }
});

test('rejects unknown filters, oversized terms and malformed UUID values',()=>{
  for(const query of ['token=secret','page=1','q='+encodeURIComponent('a'.repeat(141)),'country_id=invalid','area_id=']){
    assert.throws(()=>validateGeographyQuery(new URLSearchParams(query)),/invalid_query/);
  }
  assert.throws(()=>validateGeographyQuery({get:()=>null}),/invalid_query/);
});

test('does not mutate the original query while validating',()=>{
  const original=new URLSearchParams('q=hello%20world');
  const validated=validateGeographyQuery(original);
  validated.set('q','changed');
  assert.equal(original.get('q'),'hello world');
});
