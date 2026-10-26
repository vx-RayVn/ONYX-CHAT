/**
 * Derived data. Pure functions take the store state; hooks wrap them so that
 * components only re-render when the derived primitive actually changes.
 */
import { useShallow } from 'zustand/react/shallow';
import type { Channel, CustomEmoji, ID, Message, Permission, Role, Server, User } from '../types';
import { categoryOf, channelPermissions, serverPermissions, subjectFor } from '../lib/permissions';
import { anyMention, countedMentions, decide, findMentions, isMuted, type Decision, type MessageFacts, type NotifyContext } from '../lib/notifyRules';
import { ALL_ANIMATED_EMOJIS } from '../data/emojiPacks';
import { useStore, type Store } from './store';
import { t } from '../i18n';
import {guestPermissions} from '../lib/guest';

export const useMe = () => useStore((s) => s.users[s.meId]);
export const useUser = (id: ID | undefined) => useStore((s) => (id ? s.users[id] : undefined));

/* ---------------------------------------------------------------- */
/* Notifications: mentions, unread counters                           */
/* ---------------------------------------------------------------- */

/**
 * What the notification rules (src/lib/notifyRules.ts) need to know about a
 * chat. Author-specific fields are added per message by `forAuthor`.
 */
export function notifyContext(s: Store, scopeId: ID, now = Date.now()): NotifyContext | null {
  const me = s.users[s.meId];
  const base = { meId: s.meId, authorBlocked: false, authorCanMentionEveryone: false, meOnline: me?.status !== 'offline', dnd: me?.status === 'dnd', defaultLevel: s.notifyDefault, now };
  const dm = s.dms[scopeId];
  if (dm) return { ...base, isDM: true, canView: dm.participantIds.includes(s.meId), myRoleIds: [], dmPref: s.notifyPrefs[scopeId] };
  const channel = s.channels[scopeId];
  const server = channel ? s.servers[channel.serverId] : undefined;
  if (!channel || !server) return null;
  return {
    ...base,
    isDM: false,
    // The real permissions – “View server as role” is only a preview and changes nothing here.
    canView: channelPermissions(subjectFor(server, s.meId), channel, categoryOf(server, channel)).has('viewChannel'),
    myRoleIds: server.members[s.meId]?.roleIds ?? [],
    serverPref: s.notifyPrefs[server.id],
    channelPref: s.notifyPrefs[channel.id],
  };
}

function forAuthor(s: Store, ctx: NotifyContext, scopeId: ID, authorId: ID): NotifyContext {
  return { ...ctx, authorBlocked: s.relationships[authorId]?.type === 'blocked', authorCanMentionEveryone: () => authorCanMentionEveryone(s, scopeId, authorId) };
}

/** @everyone, @here and role mentions only count when the author has “Mention @everyone” in that channel. */
function authorCanMentionEveryone(s: Store, channelId: ID, authorId: ID) {
  const channel = s.channels[channelId];
  const server = channel ? s.servers[channel.serverId] : undefined;
  if (!channel || !server) return false;
  return channelPermissions(subjectFor(server, authorId), channel, categoryOf(server, channel)).has('mentionEveryone');
}

export function messageFacts(s: Store, m: Message): MessageFacts {
  const target = m.replyToId && m.replyMention ? s.messages[m.channelId]?.find((x) => x.id === m.replyToId) : undefined;
  return { type: m.type, authorId: m.authorId, content: m.content, replyMention: m.replyMention, replyToAuthorId: target?.authorId ?? null };
}

/** The full decision for one message (null when the chat is unknown). */
export function notifyDecision(s: Store, m: Message, now = Date.now()): Decision | null {
  const ctx = notifyContext(s, m.channelId, now);
  return ctx ? decide(messageFacts(s, m), forAuthor(s, ctx, m.channelId, m.authorId)) : null;
}

/** Highlight in the chat and the mentions inbox: does the message mention me (after the server's suppression settings)? */
export function isMention(s: Store, m: Message) {
  // Runs for every visible message on every change: without "@" or a reply ping there is nothing to find.
  if (m.authorId === s.meId || (!m.replyMention && !m.content.includes('@'))) return false;
  const dm = s.dms[m.channelId];
  const channel = s.channels[m.channelId];
  const server = channel ? s.servers[channel.serverId] : undefined;
  if (!dm && !server) return false;
  const found = findMentions(messageFacts(s, m), {
    meId: s.meId,
    isDM: !!dm,
    myRoleIds: server?.members[s.meId]?.roleIds ?? [],
    meOnline: s.users[s.meId]?.status !== 'offline',
    authorCanMentionEveryone: () => authorCanMentionEveryone(s, m.channelId, m.authorId),
  });
  return anyMention(countedMentions(found, server ? s.notifyPrefs[server.id] : undefined));
}

/** Muted right now (a timed mute that ran out no longer counts). */
export function scopeMuted(s: Pick<Store, 'notifyPrefs'>, scopeId: ID | undefined) {
  return !!scopeId && isMuted(s.notifyPrefs[scopeId], Date.now());
}

export const useScopeMuted = (scopeId: ID | undefined) => useStore((s) => scopeMuted(s, scopeId));

export function channelUnread(s: Store, channelId: ID) {
  const list = s.messages[channelId];
  if (!list || list.length === 0) return { unread: 0, mentions: 0 };
  const read = s.readState[channelId] ?? 0;
  let ctx: NotifyContext | null | undefined;
  let unread = 0;
  let mentions = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i];
    if (m.createdAt <= read) break;
    if (m.authorId === s.meId) continue;
    if (s.relationships[m.authorId]?.type === 'blocked') continue;
    unread++;
    ctx ??= notifyContext(s, channelId);
    if (ctx && decide(messageFacts(s, m), forAuthor(s, ctx, channelId, m.authorId)).mention) mentions++;
  }
  return { unread, mentions };
}

export function useChannelUnread(channelId: ID) {
  return useStore(useShallow((s) => channelUnread(s, channelId)));
}

/** Unread marker (not for muted channels or a muted server) and mention count of a server. */
export function serverUnread(s: Store, serverId: ID) {
  const muted = scopeMuted(s, serverId);
  let unread = false;
  let mentions = 0;
  for (const c of Object.values(s.channels)) {
    if (c.serverId !== serverId || c.type === 'voice' || !canSee(s, c.id)) continue;
    const u = channelUnread(s, c.id);
    if (u.unread && !muted && !scopeMuted(s, c.id)) unread = true;
    mentions += u.mentions;
  }
  return { unread, mentions, muted };
}

export function useServerUnread(serverId: ID) {
  return useStore(useShallow((s) => serverUnread(s, serverId)));
}

/** Everything that waits for the user: mentions, DMs and friend requests (tab title, icon badge). One pass over all chats. */
export function unreadTotals(s: Store) {
  let mentions = Object.values(s.relationships).filter((r) => r.type === 'incoming').length;
  let unread = false;
  for (const c of Object.values(s.channels)) {
    if (c.type === 'voice' || !s.servers[c.serverId] || !canSee(s, c.id)) continue;
    const u = channelUnread(s, c.id);
    mentions += u.mentions;
    if (u.unread && !scopeMuted(s, c.serverId) && !scopeMuted(s, c.id)) unread = true;
  }
  for (const dm of Object.values(s.dms)) {
    const u = channelUnread(s, dm.id);
    mentions += u.mentions;
    if (u.unread && !scopeMuted(s, dm.id)) unread = true;
  }
  return { mentions, unread };
}

export function usePendingFriendCount() {
  return useStore((s) => Object.values(s.relationships).filter((r) => r.type === 'incoming').length);
}

export function memberDisplayName(s: Pick<Store, 'servers' | 'users'>, userId: ID, serverId?: ID | null) {
  const user = s.users[userId];
  if (!user) return t('Unknown');
  const nick = serverId ? s.servers[serverId]?.members[userId]?.nickname : undefined;
  return nick || user.displayName;
}

export function memberRoles(server: Server | undefined, userId: ID): Role[] {
  if (!server) return [];
  const m = server.members[userId];
  if (!m) return [];
  return server.roles.filter((r) => m.roleIds.includes(r.id)).sort((a, b) => b.position - a.position);
}

export function topColor(server: Server | undefined, userId: ID): string | undefined {
  return memberRoles(server, userId).find((r) => r.color)?.color ?? undefined;
}

export function hoistRole(server: Server | undefined, userId: ID): Role | undefined {
  return memberRoles(server, userId).find((r) => r.hoist);
}

/** Server-wide permission of any member (real roles, no preview). */
export function hasPermission(server: Server | undefined, userId: ID, perm: Permission) {
  if (!server) return true;
  return serverPermissions(subjectFor(server, userId)).has(perm);
}

type PermState = Pick<Store, 'servers' | 'channels' | 'meId' | 'viewAs'> & Partial<Pick<Store,'users'>>;

/** The local user's server-wide permissions (honours “View server as role”). */
export function myServerPermissions(s: PermState, serverId: ID | undefined): Set<Permission> | null {
  const server = serverId ? s.servers[serverId] : undefined;
  if (!server) return null;
  return guestPermissions(serverPermissions(subjectFor(server, s.meId, s.viewAs, s.meId)),s.users?.[s.meId]?.guest);
}

export function canServer(s: PermState, serverId: ID | undefined, perm: Permission) {
  const perms = myServerPermissions(s, serverId);
  return perms ? perms.has(perm) : true;
}

/** The local user's permissions in a channel; null outside servers (DMs: everything allowed). */
export function myChannelPermissions(s: PermState, channelId: ID | undefined): Set<Permission> | null {
  const channel = channelId ? s.channels[channelId] : undefined;
  const server = channel ? s.servers[channel.serverId] : undefined;
  if (!channel || !server) return null;
  return guestPermissions(channelPermissions(subjectFor(server, s.meId, s.viewAs, s.meId), channel, categoryOf(server, channel)),s.users?.[s.meId]?.guest);
}

/** True in DMs; in servers it checks the channel permission. */
export function can(s: PermState, channelId: ID | undefined, perm: Permission) {
  const perms = myChannelPermissions(s, channelId);
  return perms ? perms.has(perm) : true;
}

export const canSee = (s: PermState, channelId: ID) => can(s, channelId, 'viewChannel');

export function useCan(channelId: ID | undefined, perm: Permission) {
  return useStore((s) => can(s, channelId, perm));
}

export function canWrite(s: PermState, channel: Channel | undefined) {
  return can(s, channel?.id, 'sendMessages');
}

/** Channel settings for this channel (name, topic …). */
export function canManageChannel(s: PermState, channelId: ID) {
  return can(s, channelId, 'manageChannels');
}

export function canManage(s: PermState, serverId: ID | undefined) {
  if (!serverId || !s.servers[serverId]) return false;
  const perms = myServerPermissions(s, serverId)!;
  return perms.has('manageServer') || perms.has('manageChannels') || perms.has('manageRoles') || perms.has('manageBadges');
}

export function useCanManage(serverId: ID | undefined) {
  return useStore((s) => canManage(s, serverId));
}

export function dmTitle(s: Pick<Store, 'users' | 'meId'>, dm: { type: 'dm' | 'group'; participantIds: ID[]; name?: string }) {
  if (dm.name) return dm.name;
  const others = dm.participantIds.filter((id) => id !== s.meId).map((id) => s.users[id]?.displayName ?? t('Unknown'));
  if (dm.type === 'dm') return others[0] ?? t('Unknown');
  return others.join(', ');
}

export function dmOther(s: Pick<Store, 'users' | 'meId'>, dm: { participantIds: ID[] }): User | undefined {
  const id = dm.participantIds.find((p) => p !== s.meId);
  return id ? s.users[id] : undefined;
}

export interface EmojiSourceState {
  servers: Store['servers'];
  serverOrder: Store['serverOrder'];
}

export type AvailableEmoji = CustomEmoji & { serverId: ID };

/** Custom and animated emojis from every server you are a member of – usable in all chats. */
export function allCustomEmojis(s: EmojiSourceState): AvailableEmoji[] {
  return s.serverOrder.flatMap((id) => (s.servers[id]?.emojis ?? []).map((e) => ({ ...e, serverId: id })));
}

/** Image source for a custom emoji id (server emoji or pack emoji). */
export function emojiSrc(s: Pick<Store, 'servers' | 'serverOrder'>, id: string): string | null {
  for (const sid of s.serverOrder) {
    const e = s.servers[sid]?.emojis.find((x) => x.id === id);
    if (e) return e.src;
  }
  return ALL_ANIMATED_EMOJIS.find((e) => e.id === id)?.src ?? null;
}
