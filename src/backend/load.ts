/**
 * Loads everything the signed-in user may see. Row Level Security decides what
 * comes back – a plain "select *" only returns the user's own servers, DMs,
 * friendships and so on.
 */
import type { BadgeId, Channel, DMChannel, ID, Message, NotifyLevel, NotifyPref, RedeemedCode, Relationship, Reward, Server, User } from '../types';
import { supabase } from './client';
import { mediaUrl, sourceFromDb } from './media';
import {
  DELETED_USER_ID,
  deletedUser,
  toCategory,
  toChannel,
  toDM,
  toInvite,
  toMessage,
  toNotifyPref,
  toOverwrite,
  toRole,
  toServerBadge,
  toServerBan,
  toUser,
  type CategoryRow,
  type ChannelRow,
  type DMRow,
  type FriendshipRow,
  type InviteRow,
  type MemberRow,
  type MessageRow,
  type NotifyRow,
  type OverwriteRow,
  type ProfileRow,
  type RoleRow,
  type ServerBadgeRow,
  type ServerBanRow,
  type ServerRow,
} from './map';

export interface CloudData {
  meId: ID;
  users: Record<ID, User>;
  servers: Record<ID, Server>;
  channels: Record<ID, Channel>;
  dms: Record<ID, DMChannel>;
  relationships: Record<ID, Relationship>;
  earnedBadges: Partial<Record<BadgeId, number>>;
  /** Last read time per channel/DM on any device (merged with the local value). */
  readStates: Record<ID, number>;
  /** Private notes about people. */
  notes: Record<ID, string>;
  redeemed: RedeemedCode[];
  /** Notification settings per server, channel and DM. */
  notifyPrefs: Record<ID, NotifyPref>;
  /** Account default level – undefined while it was never saved. */
  notifyDefault?: NotifyLevel;
  /** Only on a full load (structure reloads keep the messages already in the store). */
  messages?: Record<ID, Message[]>;
}

/** IDs of rows whose delete events matter to this client (realtime delete events only carry the key). */
export const known = { friendships: new Set<ID>(), overwrites: new Set<ID>() };

async function rows<T>(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as T[];
}

export async function fetchProfiles(ids: ID[]): Promise<ProfileRow[]> {
  const unique = [...new Set(ids)].filter((id) => id && id !== DELETED_USER_ID);
  const out: ProfileRow[] = [];
  for (let i = 0; i < unique.length; i += 100)
    out.push(
      ...(await rows<ProfileRow>(
        supabase()
          .from('profiles')
          .select('*')
          .in('id', unique.slice(i, i + 100)),
      )),
    );
  return out;
}

export async function loadCloudData(meId: ID, opts: { messages: boolean }): Promise<CloudData> {
  const sb = supabase();
  if(opts.messages){const {error}=await sb.rpc('ensure_official_server');if(error)throw error;}
  const [
    badgeRows,
    servers,
    roles,
    members,
    memberRoles,
    memberBadges,
    categories,
    channels,
    overwrites,
    invites,
    serverBadges,
    serverBans,
    dmRows,
    participants,
    friendships,
    blocks,
    emojis,
    readRows,
    noteRows,
    redemptions,
    notifyRows,
    messageRows,
  ] = await Promise.all([
    rows<{ badge: string; earned_at: string }>(sb.from('user_badges').select('badge, earned_at').eq('user_id', meId)),
    rows<ServerRow>(sb.from('servers').select('*')),
    rows<RoleRow>(sb.from('roles').select('*')),
    rows<MemberRow>(sb.from('server_members').select('*')),
    rows<{ server_id: ID; user_id: ID; role_id: ID }>(sb.from('member_roles').select('*')),
    rows<{ server_id: ID; user_id: ID; badge_id: ID }>(sb.from('member_badges').select('server_id, user_id, badge_id')),
    rows<CategoryRow>(sb.from('categories').select('*')),
    rows<ChannelRow>(sb.from('channels').select('*')),
    rows<OverwriteRow>(sb.from('permission_overwrites').select('*')),
    rows<InviteRow>(sb.from('invites').select('*').order('created_at', { ascending: false })),
    rows<ServerBadgeRow>(sb.from('server_badges').select('*').order('created_at')),
    // RLS: only servers where the user may ban.
    rows<ServerBanRow>(sb.from('server_bans').select('*').order('created_at', { ascending: false })),
    rows<DMRow>(sb.from('dm_channels').select('*')),
    rows<{ dm_id: ID; user_id: ID; hidden: boolean }>(sb.from('dm_participants').select('dm_id, user_id, hidden')),
    rows<FriendshipRow>(sb.from('friendships').select('*')),
    rows<{ blocked_id: ID; created_at: string }>(sb.from('blocks').select('blocked_id, created_at')),
    rows<{ id: ID; server_id: ID; name: string; image: string; animated: boolean }>(sb.from('server_emojis').select('id, server_id, name, image, animated').order('created_at')),
    rows<{ scope_id: ID; last_read_at: string }>(sb.from('read_states').select('scope_id, last_read_at')),
    rows<{ target_id: ID; note: string }>(sb.from('user_notes').select('target_id, note')),
    rows<{ code: string; redeemed_at: string; rewards: Reward[] }>(sb.from('code_redemptions').select('code, redeemed_at, rewards').order('redeemed_at', { ascending: false })),
    rows<NotifyRow>(sb.from('notification_settings').select('*')),
    opts.messages ? rows<MessageRow>(sb.rpc('recent_messages', { p_limit: 50 })) : Promise.resolve([] as MessageRow[]),
  ]);

  /* Servers */
  const serverMap: Record<ID, Server> = {};
  for (const s of servers) {
    serverMap[s.id] = {
      id: s.id,
      name: s.name,
      icon: mediaUrl(s.icon),
      iconColor: s.icon_color,
      banner: sourceFromDb(s.banner) ?? undefined,
      description: s.description ?? undefined,
      ownerId: s.owner_id,
      categories: [],
      roles: [],
      members: {},
      invites: [],
      emojis: [],
      badges: [],
      verified: s.verified || undefined,
      isOfficial: s.is_official || undefined,
      systemChannelId: s.system_channel_id ?? undefined,
      createdAt: new Date(s.created_at).getTime(),
    };
  }
  for (const r of roles) serverMap[r.server_id]?.roles.push(toRole(r));
  for (const m of members) {
    const server = serverMap[m.server_id];
    if (server) server.members[m.user_id] = { userId: m.user_id, roleIds: [], nickname: m.nickname ?? undefined, joinedAt: new Date(m.joined_at).getTime() };
  }
  for (const mr of memberRoles) serverMap[mr.server_id]?.members[mr.user_id]?.roleIds.push(mr.role_id);
  for (const mb of memberBadges) {
    const m = serverMap[mb.server_id]?.members[mb.user_id];
    if (m) (m.badgeIds ??= []).push(mb.badge_id);
  }
  for (const b of serverBadges) serverMap[b.server_id]?.badges!.push(toServerBadge(b));
  for (const b of serverBans) {
    const server = serverMap[b.server_id];
    if (server) (server.bans ??= []).push(toServerBan(b));
  }
  for (const i of invites) serverMap[i.server_id]?.invites.push(toInvite(i));
  for (const e of emojis) serverMap[e.server_id]?.emojis.push({ id: e.id, name: e.name, src: mediaUrl(e.image) ?? e.image, animated: e.animated || undefined });

  known.overwrites = new Set(overwrites.map((o) => o.id));
  const byChannel = new Map<ID, OverwriteRow[]>();
  const byCategory = new Map<ID, OverwriteRow[]>();
  for (const o of overwrites) {
    if (o.channel_id) byChannel.set(o.channel_id, [...(byChannel.get(o.channel_id) ?? []), o]);
    if (o.category_id) byCategory.set(o.category_id, [...(byCategory.get(o.category_id) ?? []), o]);
  }
  for (const k of categories) serverMap[k.server_id]?.categories.push(toCategory(k, (byCategory.get(k.id) ?? []).map(toOverwrite)));
  const channelMap: Record<ID, Channel> = {};
  for (const c of channels) if (serverMap[c.server_id]) channelMap[c.id] = toChannel(c, (byChannel.get(c.id) ?? []).map(toOverwrite));

  /* DMs */
  const dmMap: Record<ID, DMChannel> = {};
  for (const d of dmRows) {
    const parts = participants.filter((p) => p.dm_id === d.id);
    const mine = parts.find((p) => p.user_id === meId);
    if (!mine) continue;
    // My own id first, like the demo data.
    const others = parts.filter((p) => p.user_id !== meId).map((p) => p.user_id);
    // 1:1 conversation whose other account was deleted: shown as "Deleted user", read-only.
    if (d.type === 'dm' && others.length === 0) others.push(DELETED_USER_ID);
    dmMap[d.id] = toDM(d, [meId, ...others], mine.hidden);
  }

  /* Relationships */
  known.friendships = new Set(friendships.map((f) => f.id));
  const relationships: Record<ID, Relationship> = {};
  for (const f of friendships) {
    const other = f.requester_id === meId ? f.addressee_id : f.requester_id;
    const type = f.status === 'accepted' ? 'friend' : f.requester_id === meId ? 'outgoing' : 'incoming';
    relationships[other] = { userId: other, type, since: new Date(f.accepted_at ?? f.created_at).getTime() };
  }
  for (const b of blocks) relationships[b.blocked_id] = { userId: b.blocked_id, type: 'blocked', since: new Date(b.created_at).getTime() };

  /* Messages */
  let messages: Record<ID, Message[]> | undefined;
  if (opts.messages) {
    messages = {};
    for (const row of messageRows) (messages[row.channel_id ?? row.dm_id!] ??= []).push(toMessage(row));
    for (const list of Object.values(messages)) list.sort((a, b) => a.createdAt - b.createdAt);
  }

  /* Profiles of everyone referenced above */
  const ids = [
    meId,
    ...members.map((m) => m.user_id),
    ...participants.map((p) => p.user_id),
    ...Object.keys(relationships),
    ...messageRows.map((m) => m.author_id ?? ''),
    ...invites.map((i) => i.inviter_id ?? ''),
    ...serverBans.flatMap((b) => [b.user_id, b.banned_by ?? '']),
  ];
  const profiles = await fetchProfiles(ids);
  const users: Record<ID, User> = { [DELETED_USER_ID]: deletedUser() };
  for (const p of profiles) users[p.id] = toUser(p, p.id === meId);
  if (!users[meId]) throw new Error('profile-missing');

  const earnedBadges: CloudData['earnedBadges'] = {};
  for (const b of badgeRows) earnedBadges[b.badge as BadgeId] = new Date(b.earned_at).getTime();

  const readStates: Record<ID, number> = {};
  for (const r of readRows) readStates[r.scope_id] = new Date(r.last_read_at).getTime();
  const notes: Record<ID, string> = {};
  for (const n of noteRows) notes[n.target_id] = n.note;
  const redeemed: RedeemedCode[] = redemptions.map((r) => ({ code: r.code, at: new Date(r.redeemed_at).getTime(), rewards: r.rewards }));
  const notifyPrefs: Record<ID, NotifyPref> = {};
  let notifyDefault: NotifyLevel | undefined;
  for (const r of notifyRows) {
    if (r.scope_id === meId) notifyDefault = r.level ?? 'all';
    else notifyPrefs[r.scope_id] = toNotifyPref(r);
  }

  return { meId, users, servers: serverMap, channels: channelMap, dms: dmMap, relationships, earnedBadges, readStates, notes, redeemed, notifyPrefs, notifyDefault, messages };
}

/** The latest messages of one channel or DM (e.g. a channel that just became visible). */
/** The latest messages of a chat, or – with `before` (ms) – the ones before that time (inclusive, so nothing in the same millisecond is skipped). */
export async function loadChannelMessages(id: ID, isDM: boolean, limit = 50, before?: number): Promise<Message[]> {
  let query = supabase()
    .from('messages')
    .select('*, reactions(emoji, user_id, created_at)')
    .eq(isDM ? 'dm_id' : 'channel_id', id);
  if (before !== undefined) query = query.lt('created_at', new Date(before + 1).toISOString());
  const list = await rows<MessageRow>(query.order('created_at', { ascending: false }).limit(limit));
  return list.map((m) => toMessage(m)).sort((a, b) => a.createdAt - b.createdAt);
}
