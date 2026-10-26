import test from 'node:test';
import assert from 'node:assert/strict';
import {plusActive} from '../src/lib/plus-entitlement.ts';

test('Plus identity stops exactly at the paid deadline, including after device sleep',()=>{
  const since=1700000000000,until=since+60000;
  assert.equal(plusActive(since,until,until-1),true);
  assert.equal(plusActive(since,until,until),false);
  assert.equal(plusActive(since,until,until+86400000),false);
});
test('a deadline alone and invalid deadlines never grant a Plus identity',()=>{
  assert.equal(plusActive(undefined,2000,1000),false);
  assert.equal(plusActive(100,NaN,1000),false);
  assert.equal(plusActive(100,Infinity,1000),false);
});
test('existing lifetime supporters retain their explicit legacy entitlement',()=>{
  assert.equal(plusActive(100,undefined,2000),true);
  assert.equal(plusActive(undefined,undefined,2000),false);
});
