import assert from 'node:assert/strict';
import {test} from 'node:test';
import {isGuestCreateJsonContentType} from '../src/lib/guest-create-route-core.mjs';

test('guest creation accepts only JSON with an optional UTF-8 charset',()=>{
  for(const value of [
    'application/json', 'APPLICATION/JSON',
    'application/json; charset=utf-8',
    'application/json; charset="utf-8"',
  ])assert.equal(isGuestCreateJsonContentType(value),true,value);
  for(const value of [
    null,undefined,'', 'text/plain', 'application/json;evil',
    'application/json; charset=iso-8859-1',
    'application/json; charset=utf-8; debug=true',
    'application/json; charset=',
    'application/json; charset=utf-8 garbage',
  ])assert.equal(isGuestCreateJsonContentType(value),false,String(value));
});
