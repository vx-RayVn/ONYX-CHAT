/**
 * LiveKit helpers of the Edge Functions (supabase/functions/_shared/livekit.ts):
 * tokens and webhook signatures are checked against an independent HS256 /
 * SHA-256 implementation from node:crypto, the RoomService calls against a
 * fake fetch.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import {
  accessToken,
  apiHost,
  isStandardParticipant,
  publishSources,
  receiveWebhook,
  roomService,
  signJwt,
  timingSafeEqual,
  toVoiceEvent,
  verifyJwt,
  type LiveKitConfig,
} from '../supabase/functions/_shared/livekit.ts';

const cfg: LiveKitConfig = { url: 'wss://onyx-test.livekit.cloud', apiKey: 'APItestkey', apiSecret: 'test-secret-with-enough-length-0123456789' };

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

/** HS256 JWT signed with node:crypto (independent of the code under test). */
function nodeJwt(payload: Record<string, unknown>, secret = cfg.apiSecret, header: Record<string, unknown> = { alg: 'HS256', typ: 'JWT' }) {
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  return `${data}.${createHmac('sha256', secret).update(data).digest('base64url')}`;
}

function decode(token: string) {
  const [h, p, s] = token.split('.');
  return { header: JSON.parse(Buffer.from(h, 'base64url').toString()), payload: JSON.parse(Buffer.from(p, 'base64url').toString()), data: `${h}.${p}`, sig: s };
}

test('access token: HS256 signature verifies with node:crypto, claims as LiveKit expects', async () => {
  const now = 1_800_000_000;
  const token = await accessToken(cfg, 'user-1', { roomJoin: true, room: 'channel:abc', canPublish: true, canPublishSources: ['microphone'], canSubscribe: true }, 1800, now);
  const { header, payload, data, sig } = decode(token);
  assert.deepEqual(header, { alg: 'HS256', typ: 'JWT' });
  assert.equal(createHmac('sha256', cfg.apiSecret).update(data).digest('base64url'), sig);
  assert.equal(payload.iss, cfg.apiKey);
  assert.equal(payload.sub, 'user-1');
  assert.equal(payload.nbf, now);
  assert.equal(payload.exp, now + 1800);
  assert.deepEqual(payload.video, { roomJoin: true, room: 'channel:abc', canPublish: true, canPublishSources: ['microphone'], canSubscribe: true });
});

test('verifyJwt: accepts a valid token, rejects wrong secret, issuer, expiry, algorithm and tampering', async () => {
  const now = 1_800_000_000;
  const good = nodeJwt({ iss: cfg.apiKey, exp: now + 60, nbf: now });
  assert.equal((await verifyJwt(good, cfg.apiSecret, { issuer: cfg.apiKey, now })).iss, cfg.apiKey);
  await assert.rejects(verifyJwt(good, 'other-secret', { issuer: cfg.apiKey, now }), /invalid signature/);
  await assert.rejects(verifyJwt(good, cfg.apiSecret, { issuer: 'someone-else', now }), /wrong issuer/);
  await assert.rejects(verifyJwt(nodeJwt({ iss: cfg.apiKey, exp: now - 60 }), cfg.apiSecret, { issuer: cfg.apiKey, now }), /expired/);
  await assert.rejects(verifyJwt(nodeJwt({ iss: cfg.apiKey }), cfg.apiSecret, { issuer: cfg.apiKey, now }), /missing exp/);
  await assert.rejects(verifyJwt(nodeJwt({ iss: cfg.apiKey, exp: now + 60, nbf: now + 600 }), cfg.apiSecret, { issuer: cfg.apiKey, now }), /not yet valid/);
  await assert.rejects(verifyJwt(nodeJwt({ iss: cfg.apiKey, exp: now + 60 }, cfg.apiSecret, { alg: 'none' }), cfg.apiSecret, { issuer: cfg.apiKey, now }), /unsupported/);
  const [h, , s] = good.split('.');
  const forged = `${h}.${b64url(JSON.stringify({ iss: cfg.apiKey, exp: now + 99999 }))}.${s}`;
  await assert.rejects(verifyJwt(forged, cfg.apiSecret, { issuer: cfg.apiKey, now }), /invalid signature/);
  await assert.rejects(verifyJwt('abc', cfg.apiSecret, { issuer: cfg.apiKey, now }), /malformed/);
  // Clock tolerance of 10 s
  assert.ok(await verifyJwt(nodeJwt({ iss: cfg.apiKey, exp: now - 5 }), cfg.apiSecret, { issuer: cfg.apiKey, now }));
});

test('signJwt round trip', async () => {
  const t = await signJwt({ iss: 'k', exp: 2_000_000_000, x: [1, 2] }, 's');
  assert.deepEqual(await verifyJwt(t, 's', { issuer: 'k', now: 1_900_000_000 }), { iss: 'k', exp: 2_000_000_000, x: [1, 2] });
});

test('webhook: body hash in the token must match (as LiveKit signs it)', async () => {
  const body = JSON.stringify({ event: 'participant_joined', room: { name: 'channel:x' }, participant: { identity: 'u', sid: 'PA_1', joinedAtMs: '1800000000500' }, createdAt: '1800000000' });
  const sha = createHash('sha256').update(body).digest('base64');
  const now = Math.floor(Date.now() / 1000);
  const token = nodeJwt({ iss: cfg.apiKey, exp: now + 300, nbf: now, sha256: sha });
  const event = await receiveWebhook(cfg, body, token);
  assert.equal(event.event, 'participant_joined');
  // With "Bearer " prefix as well
  assert.equal((await receiveWebhook(cfg, body, `Bearer ${token}`)).event, 'participant_joined');
  await assert.rejects(receiveWebhook(cfg, body.replace('channel:x', 'channel:y'), token), /sha256/);
  await assert.rejects(receiveWebhook(cfg, body, null), /empty/);
  await assert.rejects(receiveWebhook(cfg, body, nodeJwt({ iss: cfg.apiKey, exp: now + 300, sha256: sha }, 'wrong-secret')), /invalid signature/);
});

test('webhook event → voice_event arguments', () => {
  assert.deepEqual(toVoiceEvent({ event: 'participant_joined', room: { name: 'channel:x' }, participant: { identity: 'u', sid: 'PA_1', joinedAtMs: '1800000000500' }, createdAt: '1800000000' }), {
    event: 'participant_joined',
    room: 'channel:x',
    identity: 'u',
    sid: 'PA_1',
    at: 1_800_000_000.5,
    source: null,
  });
  assert.deepEqual(toVoiceEvent({ event: 'participant_left', room: { name: 'dm:y' }, participant: { identity: 'u', sid: 'PA_1' }, createdAt: 1_800_000_007 }), {
    event: 'participant_left',
    room: 'dm:y',
    identity: 'u',
    sid: 'PA_1',
    at: 1_800_000_007,
    source: null,
  });
  assert.equal(toVoiceEvent({ event: 'track_published', room: { name: 'channel:x' }, participant: { identity: 'u', sid: 'PA_1' }, track: { source: 'SCREEN_SHARE' } }).source, 'SCREEN_SHARE');
  assert.deepEqual(toVoiceEvent({ event: 'room_finished', room: { name: 'dm:y' }, createdAt: '5' }), { event: 'room_finished', room: 'dm:y', identity: null, sid: null, at: 5, source: null });
  assert.equal(isStandardParticipant({ event: 'x', participant: {} }), true);
  assert.equal(isStandardParticipant({ event: 'x', participant: { kind: 'STANDARD' } }), true);
  assert.equal(isStandardParticipant({ event: 'x', participant: { kind: 'AGENT' } }), false);
  assert.equal(isStandardParticipant({ event: 'x', participant: { kind: 'EGRESS' } }), false);
  assert.equal(isStandardParticipant({ event: 'x', participant: { kind: 0 } }), true);
  assert.equal(isStandardParticipant({ event: 'x', participant: { kind: '0' } }), true);
  assert.equal(isStandardParticipant({ event: 'x', participant: { kind: 4 } }), false);
  assert.equal(toVoiceEvent({ event: 'participant_joined', participant: { joinedAt: '1800000000' } }).at, 1800000000);
  for (const [source, name] of [[1, 'CAMERA'], [2, 'MICROPHONE'], [3, 'SCREEN_SHARE'], [4, 'SCREEN_SHARE_AUDIO']] as const) {
    assert.equal(toVoiceEvent({ track: { source } }).source, name);
    assert.equal(toVoiceEvent({ track: { source: String(source) } }).source, name);
  }
});

test('grants from the database checks', () => {
  assert.deepEqual(publishSources({ can_speak: true, can_video: true, can_screen: true }), ['microphone', 'camera', 'screen_share', 'screen_share_audio']);
  assert.deepEqual(publishSources({ can_speak: false, can_video: true, can_screen: false }), ['camera']);
  assert.deepEqual(publishSources({}), []);
});

test('RoomService: Twirp URL, admin token, proto enum names, not_found handling', async () => {
  const calls: { url: string; auth: string; body: Record<string, unknown> }[] = [];
  let reply: { status: number; body: unknown } = { status: 200, body: {} };
  const fake = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), auth: String((init?.headers as Record<string, string>).Authorization), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify(reply.body), { status: reply.status });
  }) as typeof fetch;
  const rs = roomService(cfg, fake);

  assert.equal(apiHost('wss://a.livekit.cloud/'), 'https://a.livekit.cloud');
  assert.equal(apiHost('ws://localhost:7880'), 'http://localhost:7880');

  reply = { status: 200, body: { participants: [{ sid: 'PA_1', identity: 'u1' }] } };
  assert.deepEqual(await rs.listParticipants('channel:x'), [{ sid: 'PA_1', identity: 'u1' }]);
  assert.equal(calls[0].url, 'https://onyx-test.livekit.cloud/twirp/livekit.RoomService/ListParticipants');
  const { payload, data, sig } = decode(calls[0].auth.replace('Bearer ', ''));
  assert.equal(createHmac('sha256', cfg.apiSecret).update(data).digest('base64url'), sig);
  assert.deepEqual(payload.video, { roomAdmin: true, room: 'channel:x' });
  assert.equal(payload.iss, cfg.apiKey);

  reply = { status: 404, body: { code: 'not_found', msg: 'room not found' } };
  assert.deepEqual(await rs.listParticipants('channel:none'), []);
  await rs.removeParticipant('channel:none', 'u1');
  await rs.deleteRoom('channel:none');
  assert.equal(await rs.getParticipant('channel:none', 'u1'), null);
  reply = { status: 404, body: { code: 'bad_route', msg: 'unknown route' } };
  await assert.rejects(rs.listParticipants('channel:x'), /unknown route/);

  reply = { status: 500, body: { code: 'internal', msg: 'boom' } };
  await assert.rejects(rs.listParticipants('channel:x'), /boom/);

  reply = { status: 200, body: {} };
  await rs.updatePermission('channel:x', 'u1', { canSubscribe: false, canPublishSources: ['camera', 'screen_share', 'screen_share_audio'] });
  const last = calls[calls.length - 1];
  assert.ok(last.url.endsWith('/UpdateParticipant'));
  assert.deepEqual(last.body, {
    room: 'channel:x',
    identity: 'u1',
    permission: { canSubscribe: false, canPublish: true, canPublishData: false, canPublishSources: ['CAMERA', 'SCREEN_SHARE', 'SCREEN_SHARE_AUDIO'], canUpdateMetadata: false },
  });
  await rs.updatePermission('channel:x', 'u1', { canSubscribe: true, canPublishSources: [] });
  assert.equal((calls[calls.length - 1].body.permission as { canPublish: boolean }).canPublish, false);

  await rs.createRoom('dm:y', { emptyTimeout: 60, departureTimeout: 20 });
  const created = calls[calls.length - 1];
  assert.ok(created.url.endsWith('/CreateRoom'));
  assert.deepEqual(created.body, { name: 'dm:y', emptyTimeout: 60, departureTimeout: 20 });
  assert.deepEqual(decode(created.auth.replace('Bearer ', '')).payload.video, { roomCreate: true });
});

test('timingSafeEqual', () => {
  assert.equal(timingSafeEqual('abc', 'abc'), true);
  assert.equal(timingSafeEqual('abc', 'abd'), false);
  assert.equal(timingSafeEqual('abc', 'abcd'), false);
  assert.equal(timingSafeEqual('', ''), true);
});
