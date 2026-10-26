import test from 'node:test';
import assert from 'node:assert/strict';
import {birthDateIssue} from '../src/lib/signupPolicy.ts';
test('registration admits the exact sixteenth birthday using UTC, but not tomorrow’s birthday',()=>{
 const now=new Date('2026-10-23T00:01:00Z');
 assert.equal(birthDateIssue('2010-10-23',now),null);
 assert.equal(birthDateIssue('2010-10-24',now),'minimum_age');
 assert.equal(birthDateIssue('2010-10-22',now),null);
});
test('the age declaration requires a real, past calendar date',()=>{
 const now=new Date('2026-10-23T23:59:00Z');
 assert.equal(birthDateIssue('',now),'date_required');
 for(const value of ['2010-02-30','2001-02-29','2026-10-24','1899-01-01','2000-13-01','2000-00-01','2000-01-00','2000-1-01','anything'])assert.equal(birthDateIssue(value,now),'date_invalid',value);
 assert.equal(birthDateIssue('2000-02-29',now),null);
});
test('a leap-day birthday reaches the minimum on its actual sixteenth anniversary',()=>{
 assert.equal(birthDateIssue('2012-02-29',new Date('2028-02-28T23:59:59Z')),'minimum_age');
 assert.equal(birthDateIssue('2012-02-29',new Date('2028-02-29T00:00:00Z')),null);
});
