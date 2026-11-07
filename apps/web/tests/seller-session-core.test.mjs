import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {test} from 'node:test';
import {sealSellerSession,openSellerSession,verifySellerCsrf}
  from '../src/lib/seller-session-core.mjs';

const key=randomBytes(32),bearer=randomBytes(32).toString('base64url');
test('seller session is encrypted, scoped, expiring and CSRF-bound',()=>{
  const now=Date.parse('2026-11-07T10:00:00.000Z');
  const issued=sealSellerSession(key,bearer,600,now);
  assert.equal(issued.cookie.includes(bearer),false);
  const opened=openSellerSession(key,issued.cookie,now+1000);
  assert.equal(opened?.bearer,bearer);
  assert.equal(verifySellerCsrf(opened,issued.csrf),true);
  assert.equal(verifySellerCsrf(opened,randomBytes(32).toString('base64url')),false);
  assert.equal(openSellerSession(key,issued.cookie,now+600000),null);
  assert.equal(openSellerSession(randomBytes(32),issued.cookie,now+1000),null);
  assert.equal(openSellerSession(key,issued.cookie.slice(0,-1)+'!',now+1000),null);
});
test('seller session rejects invalid bearer and excessive lifetime',()=>{
  assert.throws(()=>sealSellerSession(key,'bad',600));
  assert.throws(()=>sealSellerSession(key,bearer,86401));
});
