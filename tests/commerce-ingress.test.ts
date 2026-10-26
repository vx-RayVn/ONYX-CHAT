import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommerceNoticeHandler, declarationClientIp, noticeInput } from '../supabase/functions/_shared/commerce-notices.ts';

const input = { id: '00000000-0039-4000-8000-000000000001', kind: 'withdraw', name: 'Synthetic consumer', email: 'synthetic@example.invalid', reference: 'Synthetic order' };
function fixture() {
  const calls: { name: string; args: any }[] = [];
  const handler = createCommerceNoticeHandler({ env: name => name === 'SUPABASE_SERVICE_ROLE_KEY' ? 'synthetic_server_key' : '', now: () => Date.parse('2026-10-26T01:00:00Z'), rpc: async (name, args) => { calls.push({ name, args }); return { data: name === 'commerce_notice_accept' ? { received_at: '2026-10-26T01:00:00Z', receipt: args.p_text } : true, error: null }; } });
  const send = (extra: Record<string, string>, body: unknown = input) => handler(new Request('https://local.invalid/', { method: 'POST', headers: { 'content-type': 'application/json', ...extra }, body: JSON.stringify(body) }));
  return { calls, send };
}
test('forwarding headers never choose or rotate the declaration rate-limit identity', async () => {
  const f = fixture();
  for (const forwarded of ['192.0.2.1', '192.0.2.2, 192.0.2.3', 'malformed']) {
    assert.equal((await f.send({ 'cf-connecting-ip': '203.0.113.20', 'x-forwarded-for': forwarded, 'x-real-ip': forwarded })).status, 201);
  }
  const hashes = f.calls.filter(c => c.name === 'commerce_notice_accept').map(c => c.args.p_ip);
  assert.equal(hashes.length, 3);
  assert.equal(new Set(hashes).size, 1);
  assert.match(hashes[0], /^[a-f0-9]{64}$/);
  assert(!JSON.stringify(f.calls).includes('203.0.113.20'));
});
test('missing, multiple or malformed ingress addresses fail closed before SQL or mail', async () => {
  const f = fixture();
  for (const cf of [undefined, '', '203.0.113.1, 203.0.113.2', 'not-an-ip', '203.0.113.999', '127.1', '2001:db8::1%eth0', 'https://example.invalid', '2001:::1']) {
    assert.equal((await f.send({ 'x-forwarded-for': '203.0.113.1', 'x-real-ip': '203.0.113.1', ...(cf === undefined ? {} : { 'cf-connecting-ip': cf }) })).status, 503);
  }
  assert.equal(f.calls.length, 0);
});
test('equivalent IPv6 representations cannot rotate the declaration identity', async () => {
  const f = fixture();
  for (const cf of ['2001:DB8:0:0:0:0:0:1', '2001:db8::1']) assert.equal((await f.send({ 'cf-connecting-ip': cf })).status, 201);
  assert.equal(f.calls[0].args.p_ip, f.calls[2].args.p_ip);
});

test('IPv6 host rotation shares one declaration quota per canonical /64', async () => {
  const f = fixture();
  for (const cf of ['2001:db8::1', '2001:DB8:0:0:abcd:1234:5678:ffff', '2001:db8::2', '2001:db8:0:1::1']) {
    assert.equal((await f.send({ 'cf-connecting-ip': cf })).status, 201);
  }
  const hashes = f.calls.filter(c => c.name === 'commerce_notice_accept').map(c => c.args.p_ip);
  assert.equal(new Set(hashes.slice(0, 3)).size, 1);
  assert.notEqual(hashes[0], hashes[3]);
  assert.equal(declarationClientIp(new Headers({ 'cf-connecting-ip': '2001:DB8::2' })), '2001:0db8:0000:0000::/64');
  assert.equal(declarationClientIp(new Headers({ 'cf-connecting-ip': '::1' })), '0000:0000:0000:0000::/64');
  assert(!JSON.stringify(f.calls).includes('2001:'));
});

test('IPv4-mapped representations share the ordinary IPv4 declaration quota', async () => {
  const f = fixture();
  for (const cf of ['192.0.2.1', '::ffff:192.0.2.1', '::FFFF:c000:201', '0:0:0:0:0:ffff:c000:0201', '192.0.2.2', '::ffff:192.0.2.2']) {
    assert.equal((await f.send({ 'cf-connecting-ip': cf })).status, 201);
  }
  const hashes = f.calls.filter(c => c.name === 'commerce_notice_accept').map(c => c.args.p_ip);
  assert.equal(new Set(hashes.slice(0, 4)).size, 1);
  assert.notEqual(hashes[0], hashes[4]);
  assert.equal(hashes[4], hashes[5]);
  for (const cf of ['::ffff:192.0.2.1', '::ffff:c000:201']) assert.equal(declarationClientIp(new Headers({ 'cf-connecting-ip': cf })), '192.0.2.1');
  assert.notEqual(declarationClientIp(new Headers({ 'cf-connecting-ip': '::192.0.2.1' })), '192.0.2.1');
});

test('bare domain paths in declaration names are rejected without restricting contract references or natural names', () => {
  for (const name of ['example.invalid/path', 'See sub.example.invalid/offer', 'ｅｘａｍｐｌｅ．ｉｎｖａｌｉｄ／offer', '例子.测试/offer']) {
    assert.throws(() => noticeInput({ ...input, name }), /invalid_notice/);
  }
  for (const name of ['Dr. Synthetic Person', 'J.Smith', 'Synthetic O’Name', '山田 太郎', 'Test / Example']) assert.equal(noticeInput({ ...input, name }).name, name);
  assert.equal(noticeInput({ ...input, reference: 'contract.invalid/reference' }).reference, 'contract.invalid/reference');
});
test('URLs in echoed declaration name and contract reference are rejected', () => {
  for (const key of ['name', 'reference']) for (const value of ['See https://example.invalid', 'WWW.example.invalid', 'ftp://example.invalid', 'ｗｗｗ．example.invalid']) assert.throws(() => noticeInput({ ...input, [key]: value }), /invalid_notice/);
  assert.equal(noticeInput(input).reference, input.reference);
  assert.throws(() => noticeInput({ ...input, kind: 'cancel', termination: 'extraordinary', end: 'earliest', reason: 'See https://example.invalid' }), /invalid_notice/);
});
test('wakeup delivery remains independent from visitor IP headers', async () => {
  const f = fixture();
  assert.equal((await f.send({}, { action: 'deliver' })).status, 202);
  assert(!f.calls.some(c => c.name === 'commerce_notice_accept'));
});
