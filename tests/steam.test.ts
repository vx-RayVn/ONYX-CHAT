import test from 'node:test';
import assert from 'node:assert/strict';
import { hashState, steamLoginURL, verifySteam, STEAM_OPENID } from '../supabase/functions/_shared/steam.ts';

const callback = 'https://example.invalid/functions/v1/connections?state=abc';
function response() {
  return new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0', 'openid.mode': 'id_res', 'openid.op_endpoint': STEAM_OPENID,
    'openid.return_to': callback, 'openid.claimed_id': 'https://steamcommunity.com/openid/id/76561198000000000',
    'openid.identity': 'https://steamcommunity.com/openid/id/76561198000000000',
    'openid.response_nonce': '2026-10-20T16:00:00Znonce', 'openid.assoc_handle': 'test',
    'openid.signed': 'op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle', 'openid.sig': 'synthetic',
  });
}
const now = Date.parse('2026-10-20T16:00:05Z');
test('Steam redirect uses the official provider and preserves the exact state callback', () => {
  const url = new URL(steamLoginURL(callback));
  assert.equal(url.origin + url.pathname, STEAM_OPENID);
  assert.equal(url.searchParams.get('openid.return_to'), callback);
});
test('Steam proof is checked server to server and only the verified identity is returned', async () => {
  let called = false;
  const result = await verifySteam(response(), callback, async (url, opts) => {
    called = true; assert.equal(url, STEAM_OPENID);
    assert.equal((opts?.body as URLSearchParams).get('openid.mode'), 'check_authentication');
    return new Response('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n');
  }, now);
  assert.equal(result, '76561198000000000'); assert.ok(called);
});
test('Steam rejects forged signatures and provider failures', async () => {
  for (const res of [new Response('is_valid:false\n'), new Response('is_valid:true\n', { status: 500 })])
    await assert.rejects(verifySteam(response(), callback, async () => res, now), /invalid signature/);
});
test('Steam rejects callback, endpoint, identity, unsigned and expired proofs before any request', async () => {
  for (const [key, value] of [
    ['return_to', 'https://attacker.invalid/'], ['op_endpoint', 'https://attacker.invalid/'],
    ['claimed_id', 'https://attacker.invalid/openid/id/76561198000000000'], ['identity', 'other'],
    ['signed', 'identity'], ['response_nonce', '2026-10-19T16:00:00Zold'], ['ns', 'other'], ['mode', 'cancel'],
  ]) {
    const params = response(); params.set(`openid.${key}`, value);
    await assert.rejects(verifySteam(params, callback, async () => { throw new Error('must not fetch'); }, now), (e: Error) => e.message !== 'must not fetch');
  }
  const duplicate = response(); duplicate.append('openid.identity', 'other');
  await assert.rejects(verifySteam(duplicate, callback, async () => new Response('is_valid:true'), now), /duplicate/);
});
test('only a one-way state digest is stored', async () => {
  const hash = await hashState('synthetic-state');
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.notEqual(hash, await hashState('different-state'));
});
