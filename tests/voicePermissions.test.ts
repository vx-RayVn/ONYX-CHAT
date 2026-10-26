import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyLivePermissions, type PermissionSnapshot } from '../supabase/functions/_shared/voicePermissions.ts';
import { roomService } from '../supabase/functions/_shared/livekit.ts';

const target = { identity: 'user', room: 'channel:room', sid: 'PA_current' };
const snapshot = (version: string, speak: boolean): PermissionSnapshot => ({ ...target, action: 'permissions', version, can_speak: speak, can_video: false, can_screen: false, can_subscribe: true });
const fakeRooms = (overrides: object) => ({ getParticipant: async () => ({ sid: target.sid }), ...overrides }) as ReturnType<typeof roomService>;

test('permission job: changed revision converges on fresh grants, never trusts queued grants', async () => {
  let reads = 0;
  const sources: string[][] = [];
  await applyLivePermissions([target], async () => [snapshot(++reads === 1 ? '1' : '2', reads === 1)], fakeRooms({
    updatePermission: async (_r: string, _u: string, p: { canPublishSources: string[] }) => sources.push(p.canPublishSources),
  }));
  assert.deepEqual(sources, [['microphone'], []]);
});

test('permission job: old SID cannot change a reconnected participant', async () => {
  let touched = false;
  await applyLivePermissions([target], async () => [snapshot('1', false)], fakeRooms({
    getParticipant: async () => ({ sid: 'PA_new' }), updatePermission: async () => { touched = true; }, removeParticipant: async () => { touched = true; },
  }));
  assert.equal(touched, false);
});

test('permission job: a transient eviction failure retries rather than forgetting revocation', async () => {
  let attempts = 0;
  await applyLivePermissions([target], async () => [{ ...target, action: 'evict' }], fakeRooms({
    removeParticipant: async () => { if (++attempts === 1) throw new Error('temporary network failure'); },
  }));
  assert.equal(attempts, 2);
});

test('permission job: constant revision churn fails closed', async () => {
  let version = 0, removed = 0;
  await applyLivePermissions([target], async () => [snapshot(String(++version), true)], fakeRooms({
    updatePermission: async () => {}, removeParticipant: async () => { removed++; },
  }));
  assert.equal(removed, 1);
});
