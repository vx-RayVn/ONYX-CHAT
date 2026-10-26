/**
 * Server and channel permissions (works like Discord).
 *
 * For a member in a channel:
 *  1. Server owner and Administrator: everything.
 *  2. Base: permissions of @everyone plus all roles of the member.
 *  3. Overwrites. Per permission, a channel entry wins over the category entry
 *     (a channel only stores what differs). They are applied in this order:
 *     @everyone (deny, then allow) → the member's roles (all denies, then all
 *     allows – so an allow on any role wins) → the member itself.
 *  4. Implicit rules: without "View channel" nothing else works, without "Send
 *     messages" no files, voice messages or @everyone, and without "Connect"
 *     no speaking, video or screen sharing.
 *
 * "View server as role" passes `viewAs`: the local user is then evaluated with
 * exactly those roles and without owner rights.
 */
import type { Category, Channel, ID, Permission, PermissionOverwrite, Server } from '../types';

export const ALL_PERMISSIONS: Permission[] = [
  'administrator',
  'viewChannel',
  'manageServer',
  'manageChannels',
  'manageRoles',
  'manageBadges',
  'kickMembers',
  'banMembers',
  'createInvites',
  'sendMessages',
  'readHistory',
  'attachFiles',
  'sendVoiceMessages',
  'addReactions',
  'mentionEveryone',
  'manageMessages',
  'connect',
  'speak',
  'video',
  'screenShare',
  'muteMembers',
  'deafenMembers',
  'moveMembers',
];

/** Permissions that can be overwritten per channel type (only those that have an effect there). */
export const CHANNEL_PERMISSIONS: Record<'text' | 'voice', Permission[]> = {
  text: ['viewChannel', 'readHistory', 'sendMessages', 'attachFiles', 'sendVoiceMessages', 'addReactions', 'mentionEveryone', 'manageMessages', 'createInvites', 'manageChannels', 'manageRoles'],
  voice: ['viewChannel', 'connect', 'speak', 'video', 'screenShare', 'muteMembers', 'deafenMembers', 'moveMembers', 'createInvites', 'manageChannels', 'manageRoles'],
};

/** Everything a category can pass on to text and voice channels. */
export const CATEGORY_PERMISSIONS: Permission[] = [...new Set([...CHANNEL_PERMISSIONS.text, ...CHANNEL_PERMISSIONS.voice])];

export const channelPermissionSet = (type: Channel['type']) => CHANNEL_PERMISSIONS[type === 'voice' ? 'voice' : 'text'];

export type ViewAs = { serverId: ID; roleIds: ID[] } | null;

export interface Subject {
  server: Server;
  userId: ID;
  /** Roles besides @everyone. */
  roleIds: ID[];
  isOwner: boolean;
}

export function subjectFor(server: Server, userId: ID, viewAs?: ViewAs, meId?: ID): Subject {
  const preview = !!viewAs && viewAs.serverId === server.id && userId === meId;
  return {
    server,
    userId,
    roleIds: preview ? viewAs!.roleIds : (server.members[userId]?.roleIds ?? []),
    isOwner: !preview && server.ownerId === userId,
  };
}

export const everyoneRole = (server: Server) => server.roles.find((r) => r.isDefault);

/** Server-wide permissions (roles only, no channel overwrites). */
export function serverPermissions(sub: Subject): Set<Permission> {
  if (sub.isOwner) return new Set(ALL_PERMISSIONS);
  const set = new Set<Permission>();
  for (const r of sub.server.roles) if (r.isDefault || sub.roleIds.includes(r.id)) r.permissions.forEach((p) => set.add(p));
  return set.has('administrator') ? new Set(ALL_PERMISSIONS) : set;
}

export type Rule = 'allow' | 'deny';

const findOverwrite = (list: PermissionOverwrite[] | undefined, type: PermissionOverwrite['type'], id: ID) => list?.find((o) => o.type === type && o.id === id);

export function ruleIn(list: PermissionOverwrite[] | undefined, type: PermissionOverwrite['type'], id: ID, perm: Permission): Rule | undefined {
  const o = findOverwrite(list, type, id);
  if (!o) return undefined;
  if (o.deny.includes(perm)) return 'deny';
  if (o.allow.includes(perm)) return 'allow';
  return undefined;
}

/** The rule that applies to a target: channel entry first, then the category's. */
export function resolvedRule(channel: Channel | undefined, category: Category | undefined, type: PermissionOverwrite['type'], id: ID, perm: Permission) {
  const own = channel ? ruleIn(channel.overwrites, type, id, perm) : undefined;
  if (own) return { rule: own, from: 'channel' as const };
  const inherited = ruleIn(category?.overwrites, type, id, perm);
  if (inherited) return { rule: inherited, from: 'category' as const };
  return { rule: undefined, from: null };
}

export function categoryOf(server: Server, channel: Channel | undefined) {
  return channel?.categoryId ? server.categories.find((c) => c.id === channel.categoryId) : undefined;
}

/**
 * Effective permissions in a channel (or, with `channel` undefined, in a
 * category: then only the category overwrites apply).
 */
export function channelPermissions(sub: Subject, channel: Channel | undefined, category: Category | undefined, opts: { skipMember?: boolean } = {}): Set<Permission> {
  const base = serverPermissions(sub);
  if (base.has('administrator')) return base;
  const everyone = everyoneRole(sub.server);
  const result = new Set<Permission>();
  for (const p of ALL_PERMISSIONS) {
    let v = base.has(p);
    if (everyone) {
      const e = resolvedRule(channel, category, 'role', everyone.id, p).rule;
      if (e) v = e === 'allow';
    }
    let roleDeny = false;
    let roleAllow = false;
    for (const id of sub.roleIds) {
      const r = resolvedRule(channel, category, 'role', id, p).rule;
      if (r === 'deny') roleDeny = true;
      if (r === 'allow') roleAllow = true;
    }
    if (roleDeny) v = false;
    if (roleAllow) v = true;
    if (!opts.skipMember) {
      const m = resolvedRule(channel, category, 'member', sub.userId, p).rule;
      if (m) v = m === 'allow';
    }
    if (v) result.add(p);
  }
  if (!result.has('viewChannel')) return new Set();
  if (!result.has('sendMessages')) ['attachFiles', 'sendVoiceMessages', 'mentionEveryone'].forEach((p) => result.delete(p as Permission));
  if (channel?.type === 'voice' && !result.has('connect')) ['speak', 'video', 'screenShare'].forEach((p) => result.delete(p as Permission));
  return result;
}

/** A channel is "private" when @everyone cannot see it. */
export function isPrivateChannel(server: Server, channel: Channel) {
  const everyone = everyoneRole(server);
  if (!everyone) return false;
  const rule = resolvedRule(channel, categoryOf(server, channel), 'role', everyone.id, 'viewChannel').rule;
  return rule ? rule === 'deny' : !everyone.permissions.includes('viewChannel') && !everyone.permissions.includes('administrator');
}

export interface Inherited {
  value: boolean;
  source: 'category' | 'server' | 'roles' | 'admin' | 'owner';
}

/**
 * What a target gets when the channel (or category) has no explicit entry for
 * a permission – shown in the editor as "inherited".
 */
export function inheritedValue(server: Server, scope: { channel?: Channel; category?: Category }, target: Pick<PermissionOverwrite, 'type' | 'id'>, perm: Permission): Inherited {
  // In a channel, the category entry for the same target comes first.
  if (scope.channel) {
    const cat = ruleIn(scope.category?.overwrites, target.type, target.id, perm);
    if (cat) return { value: cat === 'allow', source: 'category' };
  }
  if (target.type === 'role') {
    const role = server.roles.find((r) => r.id === target.id);
    if (!role) return { value: false, source: 'server' };
    if (role.permissions.includes('administrator')) return { value: true, source: 'admin' };
    return { value: role.permissions.includes(perm), source: 'server' };
  }
  if (server.ownerId === target.id) return { value: true, source: 'owner' };
  const sub = subjectFor(server, target.id);
  const perms = channelPermissions(sub, scope.channel, scope.category, { skipMember: true });
  if (serverPermissions(sub).has('administrator')) return { value: true, source: 'admin' };
  return { value: perms.has(perm), source: 'roles' };
}

/* ---------------------------------------------------------------- */
/* Role hierarchy (as on the server, see the hierarchy migration)     */
/* ---------------------------------------------------------------- */

/** Position of a member's highest role: owner above everything, only @everyone = 0, not a member = -1. */
export function topRolePosition(server: Server, userId: ID): number {
  if (server.ownerId === userId) return Number.POSITIVE_INFINITY;
  const member = server.members[userId];
  if (!member) return -1;
  return Math.max(0, ...server.roles.filter((r) => !r.isDefault && member.roleIds.includes(r.id)).map((r) => r.position));
}

/** Roles can be edited, given and taken only below one's own highest role (@everyone always counts as below). */
export function roleBelow(server: Server, meId: ID, roleId: ID): boolean {
  const role = server.roles.find((r) => r.id === roleId);
  return !!role && (!!role.isDefault || role.position < topRolePosition(server, meId));
}

/** Members can be kicked or renamed only when their highest role is below one's own. */
export function memberBelow(server: Server, meId: ID, userId: ID): boolean {
  return topRolePosition(server, userId) < topRolePosition(server, meId);
}
