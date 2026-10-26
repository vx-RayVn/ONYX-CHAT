/**
 * Notification rules – one pure decision per incoming message.
 *
 * Used by the app (unread counters, popups, sounds) and, as an identical copy
 * in supabase/functions/push/notifyRules.ts, by the Web Push sender on the
 * server. That is why this file imports nothing: everything it needs is passed
 * in as plain values (tests/notifyRules.test.ts checks that both copies match).
 *
 * Order of the rules:
 *  1. own message, blocked author or no read access → nothing
 *  2. system notices (joined, pinned) → no alert; a call in a DM rings
 *     (alert "call") unless the DM is muted or the status is "Do not disturb"
 *  3. mention: <@me>, reply to my message with ping, @everyone / @here,
 *     <@&my role> – the last three only if the author may mention everyone in
 *     that channel and the server setting does not suppress them
 *  4. muted (channel or server, or the DM) → no alert
 *  5. level: channel → server → account default; DMs always alert
 *  6. "Do not disturb" → no alert (counters stay)
 */

export type NotifyLevel = 'all' | 'mentions' | 'nothing';

/** Settings of one server, channel or DM. Missing fields inherit. */
export interface NotifyPref {
  level?: NotifyLevel;
  muted?: boolean;
  /** End of a timed mute (epoch ms); without it a mute lasts until it is turned off. */
  muteUntil?: number;
  /** Server only: @everyone and @here do not count as mention. */
  suppressEveryone?: boolean;
  /** Server only: role mentions do not count as mention. */
  suppressRoles?: boolean;
}

export interface MessageFacts {
  type: string;
  authorId: string;
  content: string;
  /** The message is a reply that pings the original author. */
  replyMention?: boolean;
  /** Author of the message that is replied to (if known). */
  replyToAuthorId?: string | null;
}

export interface NotifyContext {
  meId: string;
  isDM: boolean;
  /** May the local user read this chat (channel permission or DM participant)? */
  canView: boolean;
  authorBlocked: boolean;
  /** Author has "Mention @everyone" in the channel (also needed for role mentions). Lazy, only asked when needed. */
  authorCanMentionEveryone: boolean | (() => boolean);
  /** The local user's roles in the server (without @everyone). */
  myRoleIds: readonly string[];
  /** False while the local user is invisible – @here only reaches people who are online. */
  meOnline: boolean;
  dnd: boolean;
  dmPref?: NotifyPref;
  serverPref?: NotifyPref;
  channelPref?: NotifyPref;
  /** Account default for server channels without an own level. */
  defaultLevel: NotifyLevel;
  now: number;
}

export type AlertKind = 'none' | 'message' | 'mention' | 'dm' | 'call';

export type NotifyReason = 'own' | 'blocked' | 'no-access' | 'system' | 'muted' | 'level' | 'dnd' | 'alert';

export interface Mentions {
  direct: boolean;
  reply: boolean;
  everyone: boolean;
  here: boolean;
  role: boolean;
}

export interface Decision {
  /** Counts for the red counter (DMs, mentions). */
  mention: boolean;
  /** Popup and sound (before checking whether the chat is open). */
  alert: AlertKind;
  reason: NotifyReason;
}

/** Durations offered for "Mute" (null = until turned off). */
export const MUTE_DURATIONS = [15 * 60_000, 60 * 60_000, 8 * 60 * 60_000, 24 * 60 * 60_000, null] as const;

export function isMuted(pref: NotifyPref | undefined, now: number): boolean {
  if (!pref?.muted) return false;
  return pref.muteUntil === undefined || pref.muteUntil > now;
}

/** True when the preference holds nothing (can be deleted). */
export function isEmptyPref(pref: NotifyPref | undefined): boolean {
  return !pref || (!pref.level && !pref.muted && !pref.suppressEveryone && !pref.suppressRoles);
}

/** Level of a server channel: channel → server → account default. */
export function effectiveLevel(ctx: Pick<NotifyContext, 'isDM' | 'channelPref' | 'serverPref' | 'defaultLevel'>): NotifyLevel {
  if (ctx.isDM) return 'all';
  return ctx.channelPref?.level ?? ctx.serverPref?.level ?? ctx.defaultLevel;
}

/** Message text without code and escaped characters – mentions there are not mentions. */
export function mentionText(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]+`/g, ' ')
    .replace(/\\[*_~`|\\<>#@:-]/g, ' ');
}

const EVERYONE = /(^|[^\p{L}\p{N}_])@everyone(?![\p{L}\p{N}_])/u;
const HERE = /(^|[^\p{L}\p{N}_])@here(?![\p{L}\p{N}_])/u;
const ROLE = /<@&([\w-]+)>/g;

/** Which kinds of mention a message contains for the local user (before suppression). */
export function findMentions(m: MessageFacts, ctx: Pick<NotifyContext, 'meId' | 'isDM' | 'authorCanMentionEveryone' | 'myRoleIds' | 'meOnline'>): Mentions {
  const text = mentionText(m.content);
  const out: Mentions = { direct: false, reply: false, everyone: false, here: false, role: false };
  out.direct = text.includes(`<@${ctx.meId}>`);
  out.reply = !!m.replyMention && !!m.replyToAuthorId && m.replyToAuthorId === ctx.meId;
  if (ctx.isDM) return out;
  const everyone = EVERYONE.test(text);
  const here = HERE.test(text);
  const roleIds = ctx.myRoleIds.length ? [...text.matchAll(ROLE)].map((x) => x[1]) : [];
  const role = roleIds.some((id) => ctx.myRoleIds.includes(id));
  if (!everyone && !here && !role) return out;
  const allowed = typeof ctx.authorCanMentionEveryone === 'function' ? ctx.authorCanMentionEveryone() : ctx.authorCanMentionEveryone;
  if (!allowed) return out;
  out.everyone = everyone;
  out.here = here && ctx.meOnline;
  out.role = role;
  return out;
}

/** Mentions that count after the server's suppression settings. */
export function countedMentions(found: Mentions, serverPref: NotifyPref | undefined): Mentions {
  return {
    ...found,
    everyone: found.everyone && !serverPref?.suppressEveryone,
    here: found.here && !serverPref?.suppressEveryone,
    role: found.role && !serverPref?.suppressRoles,
  };
}

export function anyMention(m: Mentions): boolean {
  return m.direct || m.reply || m.everyone || m.here || m.role;
}

/** The decision for one message. */
export function decide(m: MessageFacts, ctx: NotifyContext): Decision {
  if (m.authorId === ctx.meId) return { mention: false, alert: 'none', reason: 'own' };
  if (ctx.authorBlocked) return { mention: false, alert: 'none', reason: 'blocked' };
  if (!ctx.canView) return { mention: false, alert: 'none', reason: 'no-access' };
  if (m.type === 'call' && ctx.isDM) {
    if (isMuted(ctx.dmPref, ctx.now)) return { mention: false, alert: 'none', reason: 'muted' };
    if (ctx.dnd) return { mention: true, alert: 'none', reason: 'dnd' };
    return { mention: true, alert: 'call', reason: 'alert' };
  }
  if (m.type !== 'default') return { mention: false, alert: 'none', reason: 'system' };

  if (ctx.isDM) {
    if (isMuted(ctx.dmPref, ctx.now)) return { mention: false, alert: 'none', reason: 'muted' };
    if (ctx.dnd) return { mention: true, alert: 'none', reason: 'dnd' };
    return { mention: true, alert: 'dm', reason: 'alert' };
  }

  const mention = anyMention(countedMentions(findMentions(m, ctx), ctx.serverPref));
  if (isMuted(ctx.channelPref, ctx.now) || isMuted(ctx.serverPref, ctx.now)) return { mention, alert: 'none', reason: 'muted' };
  const level = effectiveLevel(ctx);
  if (level === 'nothing' || (level === 'mentions' && !mention)) return { mention, alert: 'none', reason: 'level' };
  if (ctx.dnd) return { mention, alert: 'none', reason: 'dnd' };
  return { mention, alert: mention ? 'mention' : 'message', reason: 'alert' };
}

export interface PreviewNames {
  user: (id: string) => string;
  role: (id: string) => string;
  channel: (id: string) => string;
  /** Shown instead of code blocks and spoilers (translated). */
  code: string;
  spoiler: string;
}

/**
 * One readable line from stored message content: Markdown removed, spoilers
 * and code blocks hidden, tokens (<@id>, <@&id>, <#id>, custom emojis) as names.
 */
export function previewText(content: string, names: PreviewNames): string {
  return content
    .replace(/```[\s\S]*?```/g, ` [${names.code}] `)
    .replace(/\|\|[\s\S]+?\|\|/g, ` [${names.spoiler}] `)
    .replace(/^\s*(?:#{1,3}|>)\s+/gm, '')
    .replace(/(?<!\\)(?:\*+|~~|`)/g, '')
    .replace(/(?<![\\\p{L}\p{N}])_+|_+(?![\p{L}\p{N}])/gu, '')
    .replace(/<@&([\w-]+)>/g, (_, id: string) => `@${names.role(id)}`)
    .replace(/<@([\w-]+)>/g, (_, id: string) => `@${names.user(id)}`)
    .replace(/<#([\w-]+)>/g, (_, id: string) => `#${names.channel(id)}`)
    .replace(/<a?:(\w+):[\w-]+>/g, (_, name: string) => `:${name}:`)
    .replace(/\\([*_~`|\\<>#@:-])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Shortens a preview to `max` characters at a word boundary. */
export function truncatePreview(text: string, max = 140): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** What an attachment-only message is called in a notification. */
export function attachmentLabel(attachments: readonly { kind: string; voice?: boolean }[]): 'voice' | 'image' | 'video' | 'audio' | 'file' | null {
  if (!attachments.length) return null;
  if (attachments.some((a) => a.voice)) return 'voice';
  if (attachments.every((a) => a.kind === 'image')) return 'image';
  if (attachments.every((a) => a.kind === 'video')) return 'video';
  if (attachments.every((a) => a.kind === 'audio')) return 'audio';
  return 'file';
}
