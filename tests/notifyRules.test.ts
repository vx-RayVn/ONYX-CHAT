/**
 * Tests for the notification rules (node:test, no extra dependencies).
 * Run with `npm test` – Node strips the TypeScript types itself.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  attachmentLabel,
  countedMentions,
  decide,
  effectiveLevel,
  findMentions,
  isEmptyPref,
  isMuted,
  mentionText,
  previewText,
  truncatePreview,
  type MessageFacts,
  type NotifyContext,
} from '../src/lib/notifyRules.ts';

const NOW = 1_800_000_000_000;

function ctx(over: Partial<NotifyContext> = {}): NotifyContext {
  return {
    meId: 'me',
    isDM: false,
    canView: true,
    authorBlocked: false,
    authorCanMentionEveryone: true,
    myRoleIds: ['r_mod'],
    meOnline: true,
    dnd: false,
    defaultLevel: 'all',
    now: NOW,
    ...over,
  };
}

function msg(content: string, over: Partial<MessageFacts> = {}): MessageFacts {
  return { type: 'default', authorId: 'nova', content, ...over };
}

/* ------------------------------ basics ------------------------------ */

test('own messages never notify', () => {
  assert.deepEqual(decide(msg('hi <@me>', { authorId: 'me' }), ctx()), { mention: false, alert: 'none', reason: 'own' });
});

test('blocked authors never notify, not even in DMs', () => {
  assert.equal(decide(msg('<@me>'), ctx({ authorBlocked: true })).reason, 'blocked');
  assert.equal(decide(msg('hey'), ctx({ isDM: true, authorBlocked: true })).alert, 'none');
});

test('no read access → nothing', () => {
  const d = decide(msg('@everyone'), ctx({ canView: false }));
  assert.equal(d.reason, 'no-access');
  assert.equal(d.mention, false);
});

test('system notices do not alert', () => {
  assert.equal(decide(msg('', { type: 'join' }), ctx()).alert, 'none');
  assert.equal(decide(msg('', { type: 'pin' }), ctx({ isDM: true })).reason, 'system');
});

test('a call in a DM rings, unless muted or "Do not disturb"', () => {
  assert.deepEqual(decide(msg('', { type: 'call' }), ctx({ isDM: true })), { mention: true, alert: 'call', reason: 'alert' });
  assert.deepEqual(decide(msg('', { type: 'call' }), ctx({ isDM: true, dmPref: { muted: true } })), { mention: false, alert: 'none', reason: 'muted' });
  assert.deepEqual(decide(msg('', { type: 'call' }), ctx({ isDM: true, dnd: true })), { mention: true, alert: 'none', reason: 'dnd' });
  // Own call, blocked caller and calls outside DMs never ring.
  assert.equal(decide(msg('', { type: 'call', authorId: 'me' }), ctx({ isDM: true })).alert, 'none');
  assert.equal(decide(msg('', { type: 'call' }), ctx({ isDM: true, authorBlocked: true })).alert, 'none');
  assert.equal(decide(msg('', { type: 'call' }), ctx()).reason, 'system');
});

/* ------------------------------ mentions ---------------------------- */

test('direct mention', () => {
  const d = decide(msg('look <@me>!'), ctx({ defaultLevel: 'mentions' }));
  assert.deepEqual(d, { mention: true, alert: 'mention', reason: 'alert' });
});

test('a mention of somebody else is no mention', () => {
  assert.equal(findMentions(msg('<@meow> <@me2>'), ctx()).direct, false);
});

test('reply with ping to my message counts, without ping it does not', () => {
  assert.equal(decide(msg('ok', { replyMention: true, replyToAuthorId: 'me' }), ctx({ defaultLevel: 'mentions' })).alert, 'mention');
  assert.equal(decide(msg('ok', { replyMention: false, replyToAuthorId: 'me' }), ctx({ defaultLevel: 'mentions' })).alert, 'none');
  assert.equal(decide(msg('ok', { replyMention: true, replyToAuthorId: 'theo' }), ctx({ defaultLevel: 'mentions' })).mention, false);
});

test('@everyone and @here need the author permission', () => {
  assert.equal(findMentions(msg('@everyone scrim now'), ctx()).everyone, true);
  assert.equal(findMentions(msg('@everyone scrim now'), ctx({ authorCanMentionEveryone: false })).everyone, false);
  assert.equal(findMentions(msg('hey @here'), ctx({ authorCanMentionEveryone: () => false })).here, false);
});

test('the permission is only asked when the message could mention everyone', () => {
  let asked = 0;
  const lazy = () => {
    asked++;
    return true;
  };
  findMentions(msg('just text <@me>'), ctx({ authorCanMentionEveryone: lazy }));
  assert.equal(asked, 0);
  findMentions(msg('@here'), ctx({ authorCanMentionEveryone: lazy }));
  assert.equal(asked, 1);
});

test('@here does not reach me while I am invisible', () => {
  assert.equal(findMentions(msg('@here'), ctx({ meOnline: false })).here, false);
  assert.equal(findMentions(msg('@everyone'), ctx({ meOnline: false })).everyone, true);
});

test('@everyone needs a word boundary', () => {
  assert.equal(findMentions(msg('mail me@everyone.com'), ctx()).everyone, false);
  assert.equal(findMentions(msg('@everyones'), ctx()).everyone, false);
  assert.equal(findMentions(msg('(@everyone)'), ctx()).everyone, true);
});

test('role mentions: only my roles, only with permission', () => {
  assert.equal(findMentions(msg('<@&r_mod> please check'), ctx()).role, true);
  assert.equal(findMentions(msg('<@&r_admin> please check'), ctx()).role, false);
  assert.equal(findMentions(msg('<@&r_mod>'), ctx({ authorCanMentionEveryone: false })).role, false);
  assert.equal(findMentions(msg('<@&r_mod>'), ctx({ myRoleIds: [] })).role, false);
});

test('mentions inside code or escaped do not count', () => {
  assert.equal(findMentions(msg('`<@me>`'), ctx()).direct, false);
  assert.equal(findMentions(msg('```\n@everyone\n```'), ctx()).everyone, false);
  assert.equal(findMentions(msg('\\@everyone'), ctx()).everyone, false);
  assert.equal(mentionText('a `b` c'), 'a   c');
});

test('DMs: no @everyone semantics, but every message alerts', () => {
  const c = ctx({ isDM: true, defaultLevel: 'nothing' });
  assert.equal(findMentions(msg('@everyone'), c).everyone, false);
  assert.deepEqual(decide(msg('hello'), c), { mention: true, alert: 'dm', reason: 'alert' });
});

/* --------------------------- suppression ---------------------------- */

test('suppress @everyone/@here and roles per server', () => {
  const found = findMentions(msg('@everyone @here <@&r_mod>'), ctx());
  const counted = countedMentions(found, { suppressEveryone: true });
  assert.equal(counted.everyone, false);
  assert.equal(counted.here, false);
  assert.equal(counted.role, true);
  assert.equal(countedMentions(found, { suppressRoles: true }).role, false);
});

test('suppressed @everyone is still a normal message under "all"', () => {
  assert.deepEqual(decide(msg('@everyone'), ctx({ serverPref: { suppressEveryone: true } })), { mention: false, alert: 'message', reason: 'alert' });
  assert.equal(decide(msg('@everyone'), ctx({ serverPref: { suppressEveryone: true, level: 'mentions' } })).alert, 'none');
});

test('direct mentions are never suppressed', () => {
  assert.equal(decide(msg('<@me>'), ctx({ serverPref: { suppressEveryone: true, suppressRoles: true, level: 'mentions' } })).alert, 'mention');
});

/* ------------------------------ levels ------------------------------ */

test('level inheritance: channel → server → default', () => {
  assert.equal(effectiveLevel(ctx()), 'all');
  assert.equal(effectiveLevel(ctx({ defaultLevel: 'mentions' })), 'mentions');
  assert.equal(effectiveLevel(ctx({ defaultLevel: 'mentions', serverPref: { level: 'nothing' } })), 'nothing');
  assert.equal(effectiveLevel(ctx({ serverPref: { level: 'nothing' }, channelPref: { level: 'all' } })), 'all');
  assert.equal(effectiveLevel(ctx({ isDM: true, serverPref: { level: 'nothing' } })), 'all');
});

test('"only mentions" alerts only for mentions', () => {
  const c = ctx({ serverPref: { level: 'mentions' } });
  assert.equal(decide(msg('gg'), c).alert, 'none');
  assert.equal(decide(msg('gg'), c).reason, 'level');
  assert.equal(decide(msg('gg <@me>'), c).alert, 'mention');
});

test('"nothing" never alerts but still counts the mention', () => {
  assert.deepEqual(decide(msg('<@me>'), ctx({ channelPref: { level: 'nothing' } })), { mention: true, alert: 'none', reason: 'level' });
});

/* ------------------------------ mutes ------------------------------- */

test('mute until turned off', () => {
  assert.equal(isMuted({ muted: true }, NOW), true);
  assert.equal(isMuted({ muted: false }, NOW), false);
  assert.equal(isMuted(undefined, NOW), false);
});

test('timed mute expires', () => {
  assert.equal(isMuted({ muted: true, muteUntil: NOW + 1 }, NOW), true);
  assert.equal(isMuted({ muted: true, muteUntil: NOW }, NOW), false);
  assert.equal(isMuted({ muted: true, muteUntil: NOW - 60_000 }, NOW), false);
});

test('muted channel or server: no alert, mention counter stays', () => {
  assert.deepEqual(decide(msg('<@me>'), ctx({ channelPref: { muted: true } })), { mention: true, alert: 'none', reason: 'muted' });
  assert.equal(decide(msg('hi'), ctx({ serverPref: { muted: true, muteUntil: NOW + 60_000 } })).reason, 'muted');
  assert.equal(decide(msg('hi'), ctx({ serverPref: { muted: true, muteUntil: NOW - 1 } })).alert, 'message');
});

test('muted DM: nothing, no counter', () => {
  assert.deepEqual(decide(msg('hi'), ctx({ isDM: true, dmPref: { muted: true } })), { mention: false, alert: 'none', reason: 'muted' });
  assert.equal(decide(msg('hi'), ctx({ isDM: true, dmPref: { muted: true, muteUntil: NOW - 1 } })).alert, 'dm');
});

/* ------------------------------- DND -------------------------------- */

test('do not disturb silences alerts but keeps counters', () => {
  assert.deepEqual(decide(msg('<@me>'), ctx({ dnd: true })), { mention: true, alert: 'none', reason: 'dnd' });
  assert.deepEqual(decide(msg('hey'), ctx({ isDM: true, dnd: true })), { mention: true, alert: 'none', reason: 'dnd' });
});

/* ------------------------------ helpers ----------------------------- */

test('empty preferences', () => {
  assert.equal(isEmptyPref(undefined), true);
  assert.equal(isEmptyPref({}), true);
  assert.equal(isEmptyPref({ muted: false }), true);
  assert.equal(isEmptyPref({ level: 'all' }), false);
  assert.equal(isEmptyPref({ suppressRoles: true }), false);
});

test('preview truncation at a word boundary', () => {
  assert.equal(truncatePreview('  short   text '), 'short text');
  const long = 'word '.repeat(60);
  const out = truncatePreview(long, 40);
  assert.ok(out.length <= 40);
  assert.ok(out.endsWith('…'));
  assert.ok(!out.includes('wor…'));
});

test('preview text: names, hidden spoilers and code, no Markdown', () => {
  const names = { user: (id: string) => ({ u1: 'frost_byte' })[id] ?? 'unknown', role: () => 'Mods', channel: () => 'general', code: 'Code', spoiler: 'Spoiler' };
  assert.equal(previewText('hey <@u1>, ask <@&r1> in <#c1>', names), 'hey @frost_byte, ask @Mods in #general');
  assert.equal(previewText('**bold** *it* __u__ ~~s~~ `x` _soft_', names), 'bold it u s x soft');
  assert.equal(previewText('the ending: ||he dies||', names), 'the ending: [Spoiler]');
  assert.equal(previewText('look\n```js\nconst a = 1;\n```\ndone', names), 'look [Code] done');
  assert.equal(previewText('# Patch notes\n> quoted', names), 'Patch notes quoted');
  assert.equal(previewText('snake_case stays, \\*literal\\* too', names), 'snake_case stays, *literal* too');
  assert.equal(previewText('<:pog:e1> nice', names), ':pog: nice');
});

test('attachment labels', () => {
  assert.equal(attachmentLabel([]), null);
  assert.equal(attachmentLabel([{ kind: 'image' }, { kind: 'image' }]), 'image');
  assert.equal(attachmentLabel([{ kind: 'audio', voice: true }]), 'voice');
  assert.equal(attachmentLabel([{ kind: 'audio' }]), 'audio');
  assert.equal(attachmentLabel([{ kind: 'image' }, { kind: 'file' }]), 'file');
});

/* ------------------------- server copy in sync ---------------------- */

test('the Web Push function uses an identical copy of the rules', { skip: !exists('supabase/functions/push/notifyRules.ts') && 'no server copy yet' }, () => {
  const a = readFileSync(new URL('../src/lib/notifyRules.ts', import.meta.url), 'utf8');
  const b = readFileSync(new URL('../supabase/functions/push/notifyRules.ts', import.meta.url), 'utf8');
  assert.equal(b.replace(/\r\n/g, '\n'), a.replace(/\r\n/g, '\n'));
});

function exists(path: string) {
  try {
    readFileSync(new URL(`../${path}`, import.meta.url));
    return true;
  } catch {
    return false;
  }
}
