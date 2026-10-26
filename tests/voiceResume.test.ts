import test from 'node:test';
import assert from 'node:assert/strict';
import { saveVoiceResume, readVoiceResume, forgetVoiceResume } from '../src/voice/resume.ts';

test('voice resume is scoped to the account and contains no media or credentials', () => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } });
  const destination = { userId: 'a', channelId: 'channel-1', muted: true, deafened: false };
  saveVoiceResume(destination);
  assert.deepEqual(readVoiceResume('a'), destination);
  assert.equal(readVoiceResume('b'), null);
  values.set('onyx-voice-resume', '{broken'); assert.equal(readVoiceResume('a'), null);
  values.set('onyx-voice-resume', JSON.stringify({ ...destination, muted: 'false' })); assert.equal(readVoiceResume('a'), null);
  forgetVoiceResume(); assert.equal(values.size, 0);
});

test('blocked browser storage does not prevent joining or leaving', () => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
  assert.doesNotThrow(() => saveVoiceResume({ userId: 'a', channelId: 'c', muted: false, deafened: false }));
  assert.equal(readVoiceResume('a'), null);
  assert.doesNotThrow(forgetVoiceResume);
});
