/**
 * Web Push crypto of the Edge Function, checked against an independent
 * receiver written with node:crypto (as a browser would decrypt it) and the
 * example from RFC 8291, appendix A.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDecipheriv, createECDH, createPublicKey, hkdfSync, randomBytes, verify } from 'node:crypto';
import { b64url, encryptPayload, fromB64url, generateVapidKeys, timingSafeEqual, vapidAuthorization } from '../supabase/functions/push/webpush.ts';

/** Decrypts an aes128gcm push body the way the browser does (RFC 8291 / 8188). */
function decrypt(body: Uint8Array, uaPrivate: Buffer, uaPublic: Buffer, authSecret: Buffer): string {
  const buf = Buffer.from(body);
  const salt = buf.subarray(0, 16);
  const rs = buf.readUInt32BE(16);
  const idlen = buf[20];
  const asPublic = buf.subarray(21, 21 + idlen);
  const cipher = buf.subarray(21 + idlen);
  assert.ok(cipher.length <= rs, 'single record');
  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(uaPrivate);
  const secret = ecdh.computeSecret(asPublic);
  const info = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = Buffer.from(hkdfSync('sha256', secret, authSecret, info, 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const decipher = createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(cipher.subarray(cipher.length - 16));
  const plain = Buffer.concat([decipher.update(cipher.subarray(0, cipher.length - 16)), decipher.final()]);
  assert.equal(plain[plain.length - 1], 2, 'last-record delimiter');
  return plain.subarray(0, plain.length - 1).toString('utf8');
}

test('base64url round trip', () => {
  const bytes = randomBytes(65);
  assert.deepEqual(Buffer.from(fromB64url(b64url(bytes))), bytes);
  assert.ok(!/[+/=]/.test(b64url(bytes)));
});

test('a browser can decrypt what the server encrypts', async () => {
  const ua = createECDH('prime256v1');
  ua.generateKeys();
  const auth = randomBytes(16);
  const message = JSON.stringify({ title: 'Nova (#general · ONYX)', body: 'gg, das war knapp! 🎮' });
  const body = await encryptPayload({ p256dh: b64url(ua.getPublicKey()), auth: b64url(auth) }, new TextEncoder().encode(message));
  assert.equal(decrypt(body, ua.getPrivateKey(), ua.getPublicKey(), auth), message);
});

test('every push uses a fresh key and salt', async () => {
  const ua = createECDH('prime256v1');
  ua.generateKeys();
  const target = { p256dh: b64url(ua.getPublicKey()), auth: b64url(randomBytes(16)) };
  const a = await encryptPayload(target, new TextEncoder().encode('x'));
  const b = await encryptPayload(target, new TextEncoder().encode('x'));
  assert.notDeepEqual(Buffer.from(a.subarray(0, 86)), Buffer.from(b.subarray(0, 86)));
});

test('RFC 8291 appendix A example', async () => {
  const uaPrivate = fromB64url('q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94');
  const uaPublic = fromB64url('BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4');
  const asPublic = fromB64url('BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8');
  const auth = fromB64url('BTBZMqHH6r4Tts7J_aSIgg');
  const expected =
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN';
  // The example decrypts with our independent receiver …
  assert.equal(decrypt(fromB64url(expected), Buffer.from(uaPrivate), Buffer.from(uaPublic), Buffer.from(auth)), 'When I grow up, I want to be a watermelon');
  // … and our sender produces it byte for byte with the same sender key and salt.
  const body = await encryptPayload({ p256dh: b64url(uaPublic), auth: b64url(auth) }, new TextEncoder().encode('When I grow up, I want to be a watermelon'), {
    salt: fromB64url('DGv6ra1nlYgDCS1FRnbzlw'),
    senderJwk: { kty: 'EC', crv: 'P-256', d: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw', x: b64url(asPublic.subarray(1, 33)), y: b64url(asPublic.subarray(33)) },
  });
  // RFC 8291 uses a record size of 4096 as well.
  assert.equal(b64url(body), expected);
});

test('VAPID: a valid ES256 JWT for the push service origin', async () => {
  const keys = await generateVapidKeys();
  assert.equal(fromB64url(keys.publicKey).length, 65);
  const now = 1_800_000_000_000;
  const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', keys, 'https://onyx.example', now);
  const m = header.match(/^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/);
  assert.ok(m, header);
  const [, h, c, sig, k] = m!;
  assert.equal(k, keys.publicKey);
  assert.deepEqual(JSON.parse(Buffer.from(fromB64url(h)).toString()), { typ: 'JWT', alg: 'ES256' });
  const claims = JSON.parse(Buffer.from(fromB64url(c)).toString());
  assert.equal(claims.aud, 'https://fcm.googleapis.com');
  assert.equal(claims.sub, 'https://onyx.example');
  assert.equal(claims.exp, now / 1000 + 12 * 3600);
  const pub = fromB64url(keys.publicKey);
  const key = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64url(pub.subarray(1, 33)), y: b64url(pub.subarray(33)) }, format: 'jwk' });
  assert.ok(verify('sha256', Buffer.from(`${h}.${c}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(fromB64url(sig))));
});

test('secret comparison', () => {
  assert.equal(timingSafeEqual('abc', 'abc'), true);
  assert.equal(timingSafeEqual('abc', 'abd'), false);
  assert.equal(timingSafeEqual('abc', 'abcd'), false);
  assert.equal(timingSafeEqual('', 'x'), false);
});
