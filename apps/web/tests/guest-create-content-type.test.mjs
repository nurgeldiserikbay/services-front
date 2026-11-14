import assert from 'node:assert/strict';
import {test} from 'node:test';
import {isGuestCreateJsonContentType,isGuestCreateContentLengthAllowed,GUEST_CREATE_MAX_BODY_BYTES} from '../src/lib/guest-create-route-core.mjs';

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

test('guest creation rejects invalid and oversized declared body lengths',()=>{
  for(const value of [null,'0','1',String(GUEST_CREATE_MAX_BODY_BYTES)])
    assert.equal(isGuestCreateContentLengthAllowed(value),true,String(value));
  for(const value of [
    '', '-1', '+1', '1.0', ' 1', '1 ', 'NaN',
    String(GUEST_CREATE_MAX_BODY_BYTES+1),
    '9007199254740993', '999999999999999999999999999999',
    undefined, 42,
  ])assert.equal(isGuestCreateContentLengthAllowed(value),false,String(value));
});
