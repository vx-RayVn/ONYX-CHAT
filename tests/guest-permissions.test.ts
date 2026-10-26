import test from 'node:test';
import assert from 'node:assert/strict';
import {guestPermissions} from '../src/lib/guest.ts';
test('guest rights cannot inherit management, files or reactions from an admin role',()=>{
 const granted=new Set<any>(['administrator','manageServer','manageRoles','attachFiles','addReactions','viewChannel','sendMessages','connect','speak','video','screenShare','futurePrivilege']);
 const guest=guestPermissions(granted,true);
 for(const forbidden of ['administrator','manageServer','manageRoles','attachFiles','addReactions','futurePrivilege'])assert.equal(guest.has(forbidden as any),false);
 for(const allowed of ['viewChannel','sendMessages','connect','speak','video','screenShare'])assert.equal(guest.has(allowed as any),true);
 assert.equal(granted.has('administrator'),true);
});
test('guest filtering never grants a channel right the server withheld',()=>{
 assert.deepEqual([...guestPermissions(new Set(['viewChannel','readHistory']),true)],['viewChannel','readHistory']);
 const ordinary=new Set<any>(['administrator','manageServer']);assert.equal(guestPermissions(ordinary,false),ordinary);
});
