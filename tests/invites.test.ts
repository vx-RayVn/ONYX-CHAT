import test from 'node:test';
import assert from 'node:assert/strict';
import {parseInvite,locationInvite,inviteUrl} from '../src/lib/invites.ts';

test('invites use the real domain and support current and legacy paths',()=>{
  assert.equal(inviteUrl('4ezzkn94xm'),'https://onyxchat.site/4ezzkn94xm');
  for(const input of ['4ezzkn94xm','https://onyxchat.site/4ezzkn94xm','https://onyxchat.site/invite/4ezzkn94xm','https://https//onyxchat.site/invite/4ezzkn94xm','https://https://onyxchat.site/4ezzkn94xm','https://onyx.gg/4ezzkn94xm','https://onyxchat.site/?invite=4ezzkn94xm'])assert.equal(parseInvite(input),'4ezzkn94xm');
  assert.equal(locationInvite('/invite/4ezzkn94xm',''),'4ezzkn94xm');
  assert.equal(locationInvite('/developers',''),null);
  assert.equal(locationInvite('/','?invite=%22%3E%3Cscript%3E'),null);
});
test('invites reject lookalike hosts and unsafe codes',()=>{
  for(const input of ['https://https//evil.invalid/abc','https://onyxchat.site.evil.invalid/abc','https://evil.invalid/?invite=abc','https://onyxchat.site/invite/a/b','<script>','https://onyxchat.site/%22'])assert.equal(parseInvite(input),null);
});
