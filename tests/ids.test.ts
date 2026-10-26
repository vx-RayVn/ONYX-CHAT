import test from 'node:test';
import assert from 'node:assert/strict';
import {isUuid,uniqueUuids} from '../src/lib/ids.ts';

test('database UUID filters exclude local tombstones without discarding real UUIDs',()=>{
 const id='00000000-0000-4000-8000-0000000000f1';
 assert.equal(isUuid(id),true);
 assert.deepEqual(uniqueUuids(['deleted-user','',id,'alice',id,id.toUpperCase(),'s_onyx','<'+id+'>']),[id,id.toUpperCase()]);
 assert.equal(isUuid(id+'\n'),false);
});
