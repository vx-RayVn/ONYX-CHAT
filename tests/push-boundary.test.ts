import test from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, randomBytes } from 'node:crypto';
import { b64url, generateVapidKeys, sendPush } from '../supabase/functions/push/webpush.ts';

test('push delivery rejects untrusted destinations before cryptography or network access', async () => {
  const original = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; return new Response(null, { status: 201 }); };
  try {
    for (const endpoint of [
      'https://127.0.0.1/private', 'https://[::1]/private', 'https://169.254.169.254/latest/meta-data/',
      'https://localhost/', 'https://attacker.invalid/', 'https://fcm.googleapis.com.attacker.invalid/wp/a',
      'https://fcm.googleapis.com@attacker.invalid/wp/a', 'https://user@fcm.googleapis.com/wp/a',
      'https://fcm.googleapis.com:8443/wp/a', 'http://fcm.googleapis.com/wp/a',
      'https://fcm.googleapis.com/wp/a#fragment', 'https://fcm.googleapis.com./wp/a',
      'https://notnotify.windows.com/w/a', 'https://notify.windows.com.attacker.invalid/w/a',
      'https://fcm.googleapis.com/wp/' + 'a'.repeat(4096), 'not a URL',
    ]) {
      await assert.rejects(sendPush(endpoint, { p256dh: '', auth: '' }, {}, { publicKey: '', privateJwk: {} }, 'https://example.invalid'), /untrusted push endpoint/, endpoint);
    }
    assert.equal(requests, 0);
  } finally { globalThis.fetch = original; }
});

test('push delivery keeps browser service URLs opaque, forbids redirects and bounds requests', async () => {
  const original = globalThis.fetch;
  const ua = createECDH('prime256v1'); ua.generateKeys();
  const target = { p256dh: b64url(ua.getPublicKey()), auth: b64url(randomBytes(16)) };
  const keys = await generateVapidKeys();
  const requests: string[] = [];
  globalThis.fetch = async (address, init) => {
    requests.push(String(address));
    assert.equal(init?.redirect, 'error');
    assert.ok(init?.signal instanceof AbortSignal);
    assert.equal(init.signal.aborted, false);
    assert.equal(init.method, 'POST');
    assert.ok(init.body instanceof Uint8Array);
    return new Response(null, { status: requests.length === 1 ? 410 : 201 });
  };
  try {
    for (const endpoint of [
      'https://fcm.googleapis.com/fcm/send/a', 'https://fcm.googleapis.com/wp/a',
      'https://updates.push.services.mozilla.com/wpush/v2/a', 'https://web.push.apple.com/a',
      'https://wns2-example.notify.windows.com/w/?token=opaque',
    ]) {
      const result = await sendPush(endpoint, target, { title: 'Synthetic' }, keys, 'https://example.invalid');
      assert.equal(result.gone, requests.length === 1);
    }
    assert.equal(requests.length, 5);
  } finally { globalThis.fetch = original; }
});
