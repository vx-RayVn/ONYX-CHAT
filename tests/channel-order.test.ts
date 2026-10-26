import test from 'node:test';
import assert from 'node:assert/strict';
import {channelOrder} from '../src/lib/channelOrder.ts';
import type {Channel} from '../src/types.ts';
const channel=(id:string,position:number,categoryId:string|null=null,serverId='s')=>({id,position,categoryId,serverId,name:id,type:'text'}) as Channel;
test('channel drag preserves every channel and compacts source and destination categories',()=>{
 const channels={a:channel('a',0),b:channel('b',1),c:channel('c',2),d:channel('d',0,'group')};
 const changes=channelOrder(channels,'b','group','d');
 assert.deepEqual(changes,[{id:'b',categoryId:'group',position:0},{id:'d',categoryId:'group',position:1},{id:'c',categoryId:null,position:1}]);
 assert.equal(channels.b.categoryId,null);assert.equal(channels.c.position,2);
});
test('channel drag rejects foreign server/category targets and self-drops',()=>{
 const channels={a:channel('a',0),b:channel('b',1,'group'),c:channel('c',0,null,'other')};
 assert.deepEqual(channelOrder(channels,'a',null,'b'),[]);assert.deepEqual(channelOrder(channels,'a',null,'c'),[]);assert.deepEqual(channelOrder(channels,'a',null,'a'),[]);assert.deepEqual(channelOrder(channels,'missing',null,null),[]);
});
