/**
 * Conversion between database rows (snake_case, timestamptz, null) and the app
 * types in src/types.ts (camelCase, epoch milliseconds, undefined).
 */
import { t } from '../i18n';
import { messageEmbeds } from '../lib/externalUrl';
import { mediaUrl, sourceFromDb } from './media';
import type {
  AvatarSource,
  BadgeId,
  BannerSource,
  BorderLine,
  Category,
  Channel,
  ChannelType,
  CustomStatus,
  DMChannel,
  ID,
  Invite,
  Message,
  MessageType,
  NameStyle,
  NotifyLevel,
  NotifyPref,
  Permission,
  PermissionOverwrite,
  PresenceStatus,
  Reaction,
  Role,
  ServerBadge,
  ServerBan,
  User,
} from '../types';

const ms = (v: string | null | undefined) => (v ? new Date(v).getTime() : undefined);
const iso = (v: number | null | undefined) => (v ? new Date(v).toISOString() : null);

/* ---------------------------------------------------------------- */
/* Notification settings                                              */
/* ---------------------------------------------------------------- */

export interface NotifyRow {
  user_id: ID;
  /** Server, channel or DM – or the user's own id for the account default. */
  scope_id: ID;
  level: NotifyLevel | null;
  muted: boolean;
  mute_until: string | null;
  suppress_everyone: boolean;
  suppress_roles: boolean;
}

export function toNotifyPref(r: NotifyRow): NotifyPref {
  const p: NotifyPref = {};
  if (r.level) p.level = r.level;
  if (r.muted) {
    p.muted = true;
    if (r.mute_until) p.muteUntil = new Date(r.mute_until).getTime();
  }
  if (r.suppress_everyone) p.suppressEveryone = true;
  if (r.suppress_roles) p.suppressRoles = true;
  return p;
}

export const notifyPrefRow = (p: NotifyPref) => ({
  level: p.level ?? null,
  muted: !!p.muted,
  mute_until: p.muted ? iso(p.muteUntil) : null,
  suppress_everyone: !!p.suppressEveryone,
  suppress_roles: !!p.suppressRoles,
});
const opt = <T>(v: T | null | undefined) => (v === null || v === undefined ? undefined : v);

/* ---------------------------------------------------------------- */
/* Rows                                                               */
/* ---------------------------------------------------------------- */

export interface ProfileRow {
  id: ID;
  is_guest?: boolean;
  username: string;
  display_name: string;
  avatar: AvatarSource | null;
  avatar_color: string;
  banner: BannerSource | null;
  bio: string | null;
  pronouns: string | null;
  status: PresenceStatus;
  custom_status: CustomStatus | null;
  badges: string[];
  profile_colors: string[] | null;
  avatar_decoration: string | null;
  profile_frame: string | null;
  profile_effect: string | null;
  name_style: NameStyle | null;
  border_line: BorderLine | null;
  member_number: number | string;
  country: string | null;
  plus_since: string | null;
  plus_until?: string | null;
  supporter_wall: boolean;
  created_at: string;
}

export interface ServerRow {
  id: ID;
  name: string;
  icon: string | null;
  icon_color: string;
  banner: BannerSource | null;
  description: string | null;
  owner_id: ID;
  verified: boolean;
  is_official?: boolean;
  system_channel_id: ID | null;
  created_at: string;
}

export interface RoleRow {
  id: ID;
  server_id: ID;
  name: string;
  color: string | null;
  hoist: boolean;
  position: number;
  permissions: Permission[];
  is_default: boolean;
}

export interface MemberRow {
  server_id: ID;
  user_id: ID;
  nickname: string | null;
  joined_at: string;
}

export interface CategoryRow {
  id: ID;
  server_id: ID;
  name: string;
  position: number;
}

export interface ChannelRow {
  id: ID;
  server_id: ID;
  category_id: ID | null;
  name: string;
  type: ChannelType;
  topic: string | null;
  position: number;
  slowmode: number | null;
  age_restricted: boolean;
  user_limit: number | null;
}

export interface OverwriteRow {
  id: ID;
  server_id: ID;
  channel_id: ID | null;
  category_id: ID | null;
  target_type: 'role' | 'member';
  target_id: ID;
  allow: Permission[];
  deny: Permission[];
}

export interface InviteRow {
  code: string;
  server_id: ID;
  channel_id: ID | null;
  inviter_id: ID | null;
  uses: number;
  max_uses: number | null;
  expires_at: string | null;
  created_at: string;
}

export interface ServerBadgeRow {
  id: ID;
  server_id: ID;
  name: string;
  image: string;
  description: string | null;
  created_at: string;
}

export interface ServerBanRow {
  server_id: ID;
  user_id: ID;
  reason: string | null;
  banned_by: ID | null;
  created_at: string;
}

export interface DMRow {
  id: ID;
  type: 'dm' | 'group';
  name: string | null;
  icon: string | null;
  owner_id: ID | null;
  last_activity_at: string;
}

export interface MessageRow {
  bot_author?: {id:string;name:string;avatar:string|null} | null;
  id: ID;
  channel_id: ID | null;
  dm_id: ID | null;
  author_id: ID | null;
  type: MessageType;
  content: string;
  created_at: string;
  edited_at: string | null;
  reply_to_id: ID | null;
  reply_mention: boolean;
  attachments: Message['attachments'];
  embeds: Message['embeds'];
  pinned: boolean;
  /** recent_messages() and embedded selects deliver the reactions with the message. */
  reactions?: { emoji: string; user_id: ID }[];
}

export interface FriendshipRow {
  id: ID;
  requester_id: ID;
  addressee_id: ID;
  status: 'pending' | 'accepted';
  created_at: string;
  accepted_at: string | null;
}

/* ---------------------------------------------------------------- */
/* Row → app                                                          */
/* ---------------------------------------------------------------- */

/** Placeholder author for messages whose account was deleted. */
export const DELETED_USER_ID = 'deleted-user';

export function toUser(p: ProfileRow, isMe: boolean): User {
  return {
    id: p.id,
    guest: !!p.is_guest,
    username: p.username,
    displayName: p.display_name,
    avatar: opt(sourceFromDb(p.avatar)),
    avatarColor: p.avatar_color,
    banner: opt(sourceFromDb(p.banner)),
    bio: opt(p.bio),
    pronouns: opt(p.pronouns),
    // Phase 1 has no presence yet: other people are shown offline instead of pretending they are online.
    status: isMe ? p.status : 'offline',
    accountStatus: p.status,
    customStatus: opt(p.custom_status),
    badges: (p.badges as BadgeId[]).filter(badge=>badge!=='verified'),
    profileColors: opt(p.profile_colors),
    avatarDecoration: opt(p.avatar_decoration),
    profileFrame: opt(p.profile_frame),
    profileEffect: opt(p.profile_effect),
    nameStyle: opt(p.name_style),
    borderLine: opt(p.border_line),
    memberNumber: p.member_number==null?undefined:Number(p.member_number),
    country: opt(p.country),
    plusSince: p.plus_until && (ms(p.plus_until)??0)<=Date.now()?undefined:ms(p.plus_since),
    plusUntil: ms(p.plus_until),
    supporterWall: p.supporter_wall,
    createdAt: ms(p.created_at) ?? Date.now(),
  };
}

export function deletedUser(): User {
  return { id: DELETED_USER_ID, username: 'deleted-user', displayName: t('Deleted user'), avatarColor: '#64748b', status: 'offline', badges: [], createdAt: 0 };
}

export const toRole = (r: RoleRow): Role => ({
  id: r.id,
  name: r.name,
  color: r.color,
  hoist: r.hoist,
  position: r.position,
  permissions: r.permissions,
  ...(r.is_default ? { isDefault: true } : {}),
});

export const toOverwrite = (o: OverwriteRow): PermissionOverwrite => ({ type: o.target_type, id: o.target_id, allow: o.allow, deny: o.deny });

export const toCategory = (k: CategoryRow, overwrites: PermissionOverwrite[]): Category => ({
  id: k.id,
  name: k.name,
  position: k.position,
  ...(overwrites.length ? { overwrites } : {}),
});

export const toChannel = (c: ChannelRow, overwrites: PermissionOverwrite[]): Channel => ({
  id: c.id,
  serverId: c.server_id,
  categoryId: c.category_id,
  name: c.name,
  type: c.type,
  topic: opt(c.topic),
  position: c.position,
  slowmode: opt(c.slowmode),
  ageRestricted: c.age_restricted || undefined,
  userLimit: opt(c.user_limit),
  ...(overwrites.length ? { overwrites } : {}),
});

export const toInvite = (i: InviteRow): Invite => ({
  code: i.code,
  channelId: i.channel_id ?? '',
  inviterId: i.inviter_id ?? DELETED_USER_ID,
  uses: i.uses,
  maxUses: i.max_uses,
  expiresAt: ms(i.expires_at) ?? null,
  createdAt: ms(i.created_at) ?? Date.now(),
});

export const toServerBadge = (b: ServerBadgeRow): ServerBadge => ({
  id: b.id,
  name: b.name,
  image: mediaUrl(b.image) ?? b.image,
  description: opt(b.description),
  createdAt: ms(b.created_at) ?? Date.now(),
});

export const toServerBan = (b: ServerBanRow): ServerBan => ({
  userId: b.user_id,
  reason: opt(b.reason),
  bannedBy: opt(b.banned_by),
  createdAt: ms(b.created_at) ?? Date.now(),
});

export const toDM =(d: DMRow, participantIds: ID[], hidden: boolean): DMChannel => ({
  id: d.id,
  type: d.type,
  participantIds,
  name: opt(d.name),
  icon: mediaUrl(d.icon),
  ownerId: opt(d.owner_id),
  lastActivityAt: ms(d.last_activity_at) ?? Date.now(),
  ...(hidden ? { hidden: true } : {}),
});

/** Groups reaction rows by emoji, in order of the first reaction. */
export function toReactions(rows: { emoji: string; user_id: ID }[] | undefined): Reaction[] {
  const out: Reaction[] = [];
  for (const r of rows ?? []) {
    const existing = out.find((x) => x.emoji === r.emoji);
    if (existing) {
      if (!existing.userIds.includes(r.user_id)) existing.userIds.push(r.user_id);
    } else out.push({ emoji: r.emoji, userIds: [r.user_id] });
  }
  return out;
}

/** Merges two message lists of one chat (by id, oldest first). */
export function mergeMessages(a: Message[], b: Message[]) {
  const map = new Map(a.map((m) => [m.id, m]));
  for (const m of b) map.set(m.id, m);
  return [...map.values()].sort((x, y) => x.createdAt - y.createdAt);
}

export function toMessage(m: MessageRow, reactions?: Reaction[]): Message {
  return {
    id: m.id,
    channelId: (m.channel_id ?? m.dm_id)!,
    authorId: m.author_id ?? DELETED_USER_ID,
    bot: m.bot_author ?? undefined,
    type: m.type,
    content: m.content,
    createdAt: ms(m.created_at) ?? Date.now(),
    editedAt: ms(m.edited_at),
    replyToId: opt(m.reply_to_id),
    replyMention: m.reply_mention || undefined,
    reactions: reactions ?? toReactions(m.reactions),
    attachments: m.attachments ?? [],
    embeds: messageEmbeds(m.embeds),
    pinned: m.pinned || undefined,
  };
}

/* ---------------------------------------------------------------- */
/* App → row                                                          */
/* ---------------------------------------------------------------- */

const PROFILE_COLUMNS: Partial<Record<keyof User, keyof ProfileRow>> = {
  username: 'username',
  displayName: 'display_name',
  avatar: 'avatar',
  avatarColor: 'avatar_color',
  banner: 'banner',
  bio: 'bio',
  pronouns: 'pronouns',
  status: 'status',
  customStatus: 'custom_status',
  badges: 'badges',
  profileColors: 'profile_colors',
  avatarDecoration: 'avatar_decoration',
  profileFrame: 'profile_frame',
  profileEffect: 'profile_effect',
  nameStyle: 'name_style',
  borderLine: 'border_line',
  supporterWall: 'supporter_wall',
};

/** Only the columns a user may change on their own profile; everything else is ignored. */
export function profilePatch(patch: Partial<User>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    const col = PROFILE_COLUMNS[k as keyof User];
    if (col) out[col] = v === undefined ? null : v;
  }
  return out;
}

export function serverPatch(patch: Record<string, unknown>) {
  const map: Record<string, string> = { name: 'name', icon: 'icon', iconColor: 'icon_color', banner: 'banner', description: 'description', systemChannelId: 'system_channel_id' };
  return renameKeys(patch, map);
}

export function channelPatch(patch: Partial<Channel>) {
  const map: Record<string, string> = {
    name: 'name',
    topic: 'topic',
    categoryId: 'category_id',
    position: 'position',
    slowmode: 'slowmode',
    ageRestricted: 'age_restricted',
    userLimit: 'user_limit',
  };
  const out = renameKeys(patch as Record<string, unknown>, map);
  if ('age_restricted' in out) out.age_restricted = !!out.age_restricted;
  return out;
}

export function rolePatch(patch: Partial<Role>) {
  return renameKeys(patch as Record<string, unknown>, { name: 'name', color: 'color', hoist: 'hoist', position: 'position', permissions: 'permissions' });
}

function renameKeys(patch: Record<string, unknown>, map: Record<string, string>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) if (map[k]) out[map[k]] = v === undefined ? null : v;
  return out;
}

export const channelRow = (c: Channel) => ({
  id: c.id,
  server_id: c.serverId,
  category_id: c.categoryId,
  name: c.name,
  type: c.type,
  topic: c.topic ?? null,
  position: c.position,
});

export const messageRow = (m: Message, isDM: boolean) => ({
  id: m.id,
  channel_id: isDM ? null : m.channelId,
  dm_id: isDM ? m.channelId : null,
  author_id: m.authorId,
  type: m.type,
  content: m.content,
  reply_to_id: m.replyToId ?? null,
  reply_mention: !!m.replyMention,
});

export const inviteRow = (serverId: ID, i: Invite) => ({
  code: i.code,
  server_id: serverId,
  channel_id: i.channelId || null,
  inviter_id: i.inviterId,
  max_uses: i.maxUses,
  expires_at: iso(i.expiresAt),
});
