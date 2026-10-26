import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeFolders,moveToFolder} from '../src/lib/serverFolders.ts';

test('folder preferences cannot hide unknown servers or duplicate membership',()=>{
  const result=normalizeFolders([
    {id:'one',name:' Games ',color:'bad',serverIds:['a','a','missing','b']},
    {id:'one',name:'duplicate',serverIds:['c']},
    {id:'two',name:'x'.repeat(100),color:'#6478ec',serverIds:['a','c']},
    {id:'empty',serverIds:['missing']},null,
  ],['a','b','c']);
  assert.deepEqual(result.map(f=>f.serverIds),[['a','b'],['c']]);assert.equal(result[0].name,'Games');assert.equal(result[1].name.length,40);
  assert.equal(result[0].color,'#10b981');assert.deepEqual(normalizeFolders({unexpected:true},['a']),[]);
});
test('moving servers, removing the last item and dissolving preserve the server order independently',()=>{
  const order=['a','b','c'],folders=normalizeFolders([{id:'one',serverIds:['a','b']},{id:'two',serverIds:['c']}],order);
  const moved=moveToFolder(folders,'a','two');assert.deepEqual(moved.map(f=>f.serverIds),[['b'],['c','a']]);
  assert.deepEqual(moveToFolder(moved,'b',null).map(f=>f.id),['two']);
  assert.equal(moveToFolder(folders,'a','missing'),folders);assert.deepEqual(order,['a','b','c']);
  assert.deepEqual(normalizeFolders(folders,['b']).map(f=>f.serverIds),[['b']]);
});
