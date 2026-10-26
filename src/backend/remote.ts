/**
 * Supabase calls behind the store actions. The store has already applied the
 * change locally (optimistic); these functions send it and, if the server
 * refuses, revert it or reload the affected data.
 */
import type { Attachment, Category, Channel, CustomEmoji, ID, Invite, Message, NotifyLevel, NotifyPref, PermissionOverwrite, RedeemedCode, Role, ServerBadge, User } from '../types';
import type { Store } from '../store/store';
import { t } from '../i18n';
import { supabase } from './client';
import { store } from './bridge';
import { enqueue, enqueueDebounced, type Result } from './queue';
import { channelPatch, channelRow, inviteRow, messageRow, notifyPrefRow, profilePatch, rolePatch, serverPatch, toUser, type ProfileRow } from './map';
import { isEmptyPref } from '../lib/notifyRules';
import { attachmentPath, removeAttachments, takeBlob, uploadAttachment, uploadRowImages } from './media';
import { announce } from './presence';
import { deleteAudio, getAudio } from '../lib/audio';

const sb = () => supabase();
const meId = () => store().getState().meId;

/* ---------------------------------------------------------------- */
/* Messages                                                           */
/* ---------------------------------------------------------------- */

/** The binary of an attachment that is about to be uploaded. */
async function attachmentBlob(a: Attachment): Promise<Blob | undefined> {
  if (a.url?.startsWith('data:')) return (await fetch(a.url)).blob();
  if (a.localKey) return getAudio(a.localKey);
  return takeBlob(a.id);
}

/** What the database stores about an attachment (no local previews). */
function attachmentRow(a: Attachment, path: string) {
  const { url: _url, localKey: _key, unavailable: _u, ...rest } = a;
  return { ...rest, path };
}

export function sendMessage(m: Message, isDM: boolean) {
  const uploaded: string[] = [];
  void enqueue(
    async () => {
      // Files first (Storage), then the message that points at them.
      const rows: ReturnType<typeof attachmentRow>[] = [];
      const recorded = new Map<string, Blob>();
      for (const a of m.attachments) {
        const blob = await attachmentBlob(a);
        if (!blob) throw new Error(t('“{name}” could not be read.', { name: a.name }));
        const path = attachmentPath(isDM ? 'dms' : 'channels', m.channelId, m.id, a);
        await uploadAttachment(path, blob, a.mime);
        uploaded.push(path);
        rows.push(attachmentRow(a, path));
        if (a.localKey) recorded.set(a.id, blob);
      }
      const res = await sb()
        .from('messages')
        .insert({ ...messageRow(m, isDM), attachments: rows });
      if (!res.error && rows.length)
        store().setState((s) => {
          const msg = s.messages[m.channelId]?.find((x) => x.id === m.id);
          if (!msg) return;
          msg.attachments = msg.attachments.map((a) => {
            const next = { ...a, path: rows.find((r) => r.id === a.id)?.path };
            const blob = recorded.get(a.id);
            // Recordings are online now: play them from memory and drop the copy in the
            // browser storage (after a reload the app uses the online file anyway).
            if (blob && next.localKey) {
              void deleteAudio([next.localKey]);
              delete next.localKey;
              next.url = URL.createObjectURL(blob);
            }
            return next;
          });
        });
      return res;
    },
    {
      title: t('Message not sent'),
      undo: () => {
        void removeAttachments(uploaded);
        store().setState((s) => {
          const list = s.messages[m.channelId];
          if (list) s.messages[m.channelId] = list.filter((x) => x.id !== m.id);
          // Give the text back so nothing typed is lost.
          if (m.content && !s.drafts[m.channelId]) s.drafts[m.channelId] = m.content;
        });
      },
    },
  );
}

export function editMessage(id: ID, content: string) {
  void enqueue(() => sb().from('messages').update({ content }).eq('id', id));
}

export function deleteMessage(id: ID, attachments: Attachment[] = []) {
  const paths = attachments.map((a) => a.path).filter((x): x is string => !!x);
  void enqueue(async () => {
    const res = await sb().from('messages').delete().eq('id', id);
    // Remove the files too (best effort – a failure here does not bring the message back).
    if (!res.error) await removeAttachments(paths).catch(() => undefined);
    return res;
  });
}

export function setReaction(messageId: ID, emoji: string, on: boolean) {
  const me = meId();
  void enqueue(() => (on ? sb().from('reactions').insert({ message_id: messageId, user_id: me, emoji }) : sb().from('reactions').delete().match({ message_id: messageId, user_id: me, emoji })));
}

export function setPinned(id: ID, pinned: boolean, notice: Message | null, isDM: boolean) {
  void enqueue(() => sb().from('messages').update({ pinned }).eq('id', id));
  if (notice) sendMessage(notice, isDM);
}

/* ---------------------------------------------------------------- */
/* Servers                                                            */
/* ---------------------------------------------------------------- */

/** Sends a freshly created server (with roles, categories, channels) in one step. */
export function createServer(s: Store, serverId: ID, joinMessageId: ID | null) {
  const server = s.servers[serverId];
  const channels = Object.values(s.channels).filter((c) => c.serverId === serverId);
  // An uploaded icon can only be stored once the server exists (the storage folder belongs to it).
  const pendingIcon = server.icon?.startsWith('data:') ? server.icon : null;
  const payload = {
    id: server.id,
    name: server.name,
    icon: pendingIcon ? null : (server.icon ?? null),
    iconColor: server.iconColor,
    roles: server.roles.map((r) => ({ id: r.id, name: r.name, color: r.color, hoist: r.hoist, position: r.position, permissions: r.permissions, isDefault: !!r.isDefault })),
    memberRoleIds: server.members[s.meId]?.roleIds ?? [],
    categories: server.categories.map((k) => ({ id: k.id, name: k.name, position: k.position })),
    channels: channels.map((c) => ({ id: c.id, categoryId: c.categoryId, name: c.name, type: c.type, topic: c.topic ?? null, position: c.position })),
    systemChannelId: server.systemChannelId ?? null,
    joinMessageId,
  };
  void enqueue(() => sb().rpc('create_server', { p: payload }), {
    title: t('Server not created'),
    onData: () => pendingIcon && updateServer(serverId, { icon: pendingIcon }),
    undo: () =>
      store().setState((st) => {
        for (const c of channels) {
          delete st.channels[c.id];
          delete st.messages[c.id];
        }
        delete st.servers[serverId];
        st.serverOrder = st.serverOrder.filter((id) => id !== serverId);
        if (st.view.kind === 'server' && st.view.serverId === serverId) st.view = { kind: 'home', page: 'friends' };
      }),
  });
}

export function updateServer(serverId: ID, patch: Record<string, unknown>) {
  enqueueDebounced(`server:${serverId}`, serverPatch(patch), async (p) => {
    const row = await uploadRowImages(p, `servers/${serverId}`, (urls) =>
      store().setState((s) => {
        const server = s.servers[serverId];
        if (!server) return;
        if (urls.icon !== undefined) server.icon = (urls.icon as string) ?? undefined;
        if (urls.banner !== undefined) server.banner = (urls.banner as Store['servers'][string]['banner']) ?? undefined;
      }),
    );
    return sb().from('servers').update(row).eq('id', serverId);
  });
}

export function deleteServer(serverId: ID) {
  void enqueue(() => sb().from('servers').delete().eq('id', serverId));
}

export function leaveServer(serverId: ID) {
  void enqueue(() => sb().from('server_members').delete().match({ server_id: serverId, user_id: meId() }));
}

export function transferServer(serverId: ID, userId: ID, undo: () => void) {
  void enqueue(() => sb().rpc('transfer_server_ownership', { p_server: serverId, p_user: userId }) as Result, {
    title: t('Ownership not transferred'),
    undo,
  });
}

/** Follows an invite; resolves with the server id or null (invalid, expired or used up). */
export async function joinByInvite(code: string): Promise<ID | null> {
  const { data, error } = await sb().rpc('join_server_by_invite', { p_code: code });
  if (error) throw error;
  return (data as ID | null) ?? null;
}

/* ---------------------------------------------------------------- */
/* Channels, categories, positions                                    */
/* ---------------------------------------------------------------- */

export function createChannel(c: Channel) {
  void enqueue(() => sb().from('channels').insert(channelRow(c)), {
    undo: () => store().setState((s) => void delete s.channels[c.id]),
  });
  if (c.overwrites?.length) replaceOverwrites(c.serverId, { channelId: c.id }, c.overwrites);
}

export function updateChannel(channelId: ID, patch: Partial<Channel>) {
  const p = channelPatch(patch);
  if (Object.keys(p).length) enqueueDebounced(`channel:${channelId}`, p, (x) => sb().from('channels').update(x).eq('id', channelId));
}
export function reorderChannel(channelId:ID,categoryId:ID|null,beforeId:ID|null){
  // One locked transaction, including source/destination positions and fresh permissions.
  void enqueue(()=>sb().rpc('reorder_server_channel',{p_channel:channelId,p_category:categoryId,p_before:beforeId}) as Result,{title:t('Channel not moved')});
}

export function deleteChannel(channelId: ID) {
  void enqueue(() => sb().from('channels').delete().eq('id', channelId));
}

export function createCategory(serverId: ID, k: Category) {
  void enqueue(() => sb().from('categories').insert({ id: k.id, server_id: serverId, name: k.name, position: k.position }));
}

export function renameCategory(categoryId: ID, name: string) {
  enqueueDebounced(`category:${categoryId}`, { name }, (p) => sb().from('categories').update(p).eq('id', categoryId));
}

export function deleteCategory(categoryId: ID) {
  void enqueue(() => sb().from('categories').delete().eq('id', categoryId));
}

/** Sends every position / category change between two store states (moving, deleting, new roles). */
export function syncPositions(before: Store, after: Store, serverId: ID) {
  for (const c of Object.values(after.channels)) {
    const b = before.channels[c.id];
    if (c.serverId !== serverId || !b || (b.position === c.position && b.categoryId === c.categoryId)) continue;
    void enqueue(() => sb().from('channels').update({ position: c.position, category_id: c.categoryId }).eq('id', c.id));
  }
  const bs = before.servers[serverId];
  const as = after.servers[serverId];
  if (!bs || !as) return;
  for (const k of as.categories) {
    const b = bs.categories.find((x) => x.id === k.id);
    if (b && b.position !== k.position) void enqueue(() => sb().from('categories').update({ position: k.position }).eq('id', k.id));
  }
  for (const r of as.roles) {
    const b = bs.roles.find((x) => x.id === r.id);
    if (b && b.position !== r.position) void enqueue(() => sb().from('roles').update({ position: r.position }).eq('id', r.id));
  }
}

export function replaceOverwrites(serverId: ID, scope: { channelId: ID } | { categoryId: ID }, list: PermissionOverwrite[] | undefined) {
  const channel = 'channelId' in scope ? scope.channelId : null;
  const category = 'categoryId' in scope ? scope.categoryId : null;
  enqueueDebounced(
    `overwrites:${channel ?? category}`,
    { list: (list ?? []).map((o) => ({ type: o.type, id: o.id, allow: o.allow, deny: o.deny })) },
    (p) => sb().rpc('replace_overwrites', { p_server: serverId, p_channel: channel, p_category: category, p_list: p.list }),
    350,
  );
}

/* ---------------------------------------------------------------- */
/* Roles and members                                                  */
/* ---------------------------------------------------------------- */

export function createRole(serverId: ID, r: Role) {
  void enqueue(() => sb().from('roles').insert({ id: r.id, server_id: serverId, name: r.name, color: r.color, hoist: r.hoist, position: r.position, permissions: r.permissions }));
}

export function updateRole(roleId: ID, patch: Partial<Role>) {
  const p = rolePatch(patch);
  if (Object.keys(p).length) enqueueDebounced(`role:${roleId}`, p, (x) => sb().from('roles').update(x).eq('id', roleId));
}

export function deleteRole(roleId: ID) {
  void enqueue(() => sb().from('roles').delete().eq('id', roleId));
}

export function setMemberRole(serverId: ID, userId: ID, roleId: ID, on: boolean) {
  const row = { server_id: serverId, user_id: userId, role_id: roleId };
  void enqueue(() => (on ? sb().from('member_roles').insert(row) : sb().from('member_roles').delete().match(row)));
}

export function setNickname(serverId: ID, userId: ID, nickname: string | undefined) {
  void enqueue(() =>
    sb()
      .from('server_members')
      .update({ nickname: nickname ?? null })
      .match({ server_id: serverId, user_id: userId }),
  );
}

export function kickMember(serverId: ID, userId: ID) {
  void enqueue(() => sb().from('server_members').delete().match({ server_id: serverId, user_id: userId }));
}

/** The server removes the membership itself (and records who banned, and when). */
export function banMember(serverId: ID, userId: ID, reason: string | undefined) {
  void enqueue(() => sb().from('server_bans').insert({ server_id: serverId, user_id: userId, reason: reason ?? null }), { title: t('Ban failed') });
}

export function unbanMember(serverId: ID, userId: ID) {
  void enqueue(() => sb().from('server_bans').delete().match({ server_id: serverId, user_id: userId }));
}

export function createInvite(serverId: ID, invite: Invite) {
  return enqueue(() => sb().from('invites').insert(inviteRow(serverId, invite)), {
    undo: () =>
      store().setState((s) => {
        const server = s.servers[serverId];
        if (server) server.invites = server.invites.filter((i) => i.code !== invite.code);
      }),
  });
}

export function revokeInvite(code: string) {
  void enqueue(() => sb().from('invites').delete().eq('code', code));
}

/* ---------------------------------------------------------------- */
/* Server badges                                                      */
/* ---------------------------------------------------------------- */

const setBadgeImage = (serverId: ID, badgeId: ID, image: unknown) =>
  store().setState((s) => {
    const b = s.servers[serverId]?.badges?.find((x) => x.id === badgeId);
    if (b && typeof image === 'string') b.image = image;
  });

export function createServerBadge(serverId: ID, b: ServerBadge) {
  void enqueue(async () => {
    const row = await uploadRowImages({ image: b.image }, `servers/${serverId}`, (urls) => setBadgeImage(serverId, b.id, urls.image));
    return sb()
      .from('server_badges')
      .insert({ id: b.id, server_id: serverId, name: b.name, image: row.image, description: b.description ?? null });
  });
}

export function updateServerBadge(serverId: ID, badgeId: ID, patch: Partial<Pick<ServerBadge, 'name' | 'image' | 'description'>>) {
  const p: Record<string, unknown> = {};
  if (patch.name !== undefined) p.name = patch.name;
  if (patch.image) p.image = patch.image;
  if ('description' in patch) p.description = patch.description || null;
  enqueueDebounced(`badge:${badgeId}`, p, async (x) => {
    const row = await uploadRowImages(x, `servers/${serverId}`, (urls) => setBadgeImage(serverId, badgeId, urls.image));
    return sb().from('server_badges').update(row).eq('id', badgeId);
  });
}

export function deleteServerBadge(badgeId: ID) {
  void enqueue(() => sb().from('server_badges').delete().eq('id', badgeId));
}

export function setMemberBadge(serverId: ID, userId: ID, badgeId: ID, on: boolean) {
  const row = { server_id: serverId, user_id: userId, badge_id: badgeId };
  void enqueue(() => (on ? sb().from('member_badges').insert(row) : sb().from('member_badges').delete().match(row)));
}

/* ---------------------------------------------------------------- */
/* Profile                                                            */
/* ---------------------------------------------------------------- */

export function updateProfile(patch: Partial<User>) {
  const p = profilePatch(patch);
  if (!Object.keys(p).length) return;
  const id = meId();
  if ('status' in patch) void announce();
  enqueueDebounced(`profile:${id}`, p, async (x) => {
    const row = await uploadRowImages(x, `users/${id}`, (urls) =>
      store().setState((s) => {
        const me = s.users[id];
        if (!me) return;
        if (urls.avatar !== undefined) me.avatar = (urls.avatar as User['avatar']) ?? undefined;
        if (urls.banner !== undefined) me.banner = (urls.banner as User['banner']) ?? undefined;
      }),
    );
    return sb().from('profiles').update(row).eq('id', id);
  });
}

/* ---------------------------------------------------------------- */
/* Server emojis                                                      */
/* ---------------------------------------------------------------- */

export function createEmoji(serverId: ID, e: CustomEmoji) {
  void enqueue(
    async () => {
      const row = await uploadRowImages({ image: e.src }, `servers/${serverId}`, (urls) =>
        store().setState((s) => {
          const emoji = s.servers[serverId]?.emojis.find((x) => x.id === e.id);
          if (emoji && typeof urls.image === 'string') emoji.src = urls.image;
        }),
      );
      return sb().from('server_emojis').insert({ id: e.id, server_id: serverId, name: e.name, image: row.image, animated: !!e.animated });
    },
    {
      title: t('Emoji not added'),
      undo: () =>
        store().setState((s) => {
          const server = s.servers[serverId];
          if (server) server.emojis = server.emojis.filter((x) => x.id !== e.id);
        }),
    },
  );
}

export function renameEmoji(emojiId: ID, name: string) {
  enqueueDebounced(`emoji:${emojiId}`, { name }, (x) => sb().from('server_emojis').update(x).eq('id', emojiId));
}

export function deleteEmoji(emojiId: ID) {
  void enqueue(() => sb().from('server_emojis').delete().eq('id', emojiId));
}

/* ---------------------------------------------------------------- */
/* Read state and notes (synced across devices)                       */
/* ---------------------------------------------------------------- */

export function pushReadState(scopeId: ID, at: number) {
  const id = meId();
  enqueueDebounced(
    `read:${scopeId}`,
    { last_read_at: new Date(at).toISOString() },
    (x) =>
      sb()
        .from('read_states')
        .upsert({ user_id: id, scope_id: scopeId, ...x }, { onConflict: 'user_id,scope_id' }),
    1500,
  );
}

/* ---------------------------------------------------------------- */
/* Notification settings (synced across devices)                      */
/* ---------------------------------------------------------------- */

/** Saves the settings of one server, channel or DM; empty settings delete the row. */
export function saveNotifyPref(scopeId: ID, pref: NotifyPref | undefined) {
  const id = meId();
  enqueueDebounced(`notify:${scopeId}`, { pref: pref ? { ...pref } : null }, (x) => {
    const p = (x.pref ?? undefined) as NotifyPref | undefined;
    return isEmptyPref(p)
      ? sb().from('notification_settings').delete().match({ user_id: id, scope_id: scopeId })
      : sb()
          .from('notification_settings')
          .upsert({ user_id: id, scope_id: scopeId, ...notifyPrefRow(p!), updated_at: new Date().toISOString() }, { onConflict: 'user_id,scope_id' });
  });
}

/** The account default lives in the row whose scope is the user's own id (always kept, so other devices know it was set). */
export function saveNotifyDefault(level: NotifyLevel) {
  const id = meId();
  enqueueDebounced('notify:default', { level }, (x) =>
    sb()
      .from('notification_settings')
      .upsert({ user_id: id, scope_id: id, level: x.level, updated_at: new Date().toISOString() }, { onConflict: 'user_id,scope_id' }),
  );
}

export function saveNote(targetId: ID, note: string) {
  const id = meId();
  enqueueDebounced(`note:${targetId}`, { note }, (x) =>
    String(x.note ?? '').trim()
      ? sb().from('user_notes').upsert({ owner_id: id, target_id: targetId, note: x.note, updated_at: new Date().toISOString() }, { onConflict: 'owner_id,target_id' })
      : sb().from('user_notes').delete().match({ owner_id: id, target_id: targetId }),
  );
}

/* ---------------------------------------------------------------- */
/* Codes, ONYX Plus (demo without payment), supporter wall            */
/* ---------------------------------------------------------------- */

export type RedeemResponse =
  | { status: 'success'; code: string; title: string; description: string; rewards: RedeemedCode['rewards'] }
  | { status: 'invalid' }
  | { status: 'redeemed'; code: string; at: string; rewards: RedeemedCode['rewards'] };

export async function redeemCode(input: string): Promise<RedeemResponse> {
  const { data, error } = await sb().rpc('redeem_code', { p_code: input });
  if (error) throw error;
  return data as RedeemResponse;
}

export function plusDemoPurchase(undo: () => void) {
  void enqueue(() => sb().rpc('plus_demo_purchase') as Result, { undo });
}

export function plusDemoReset() {
  void enqueue(() => sb().rpc('plus_demo_reset') as Result);
}

/** Loads everyone who chose to appear on the supporter wall (public profile data). */
export async function loadSupporters() {
  const { data, error } = await sb().from('profiles').select('*').eq('supporter_wall', true).not('plus_since', 'is', null).limit(500);
  if (error || !data) return;
  store().setState((s) => {
    for (const row of data as ProfileRow[]) if (!s.users[row.id]) s.users[row.id] = toUser(row, row.id === s.meId);
  });
}

/* ---------------------------------------------------------------- */
/* Friends and DMs                                                    */
/* ---------------------------------------------------------------- */

export type FriendRequestStatus = 'sent' | 'accepted' | 'not_found' | 'self' | 'already_friends' | 'already_sent' | 'unavailable';

export async function friendRequest(username: string): Promise<{ status: FriendRequestStatus; user_id?: ID; display_name?: string }> {
  const { data, error } = await sb().rpc('friend_request', { p_username: username });
  if (error) throw error;
  return data as { status: FriendRequestStatus; user_id?: ID; display_name?: string };
}

const rpcVoid = (fn: string, args: Record<string, unknown>) => void enqueue(() => sb().rpc(fn, args) as Result);

export const acceptFriend = (userId: ID) => rpcVoid('friend_accept', { p_user: userId });
export const removeRelationship = (userId: ID) => rpcVoid('friend_remove', { p_user: userId });
export const blockUser = (userId: ID) => rpcVoid('user_block', { p_user: userId });

/** Creates (or finds) the 1:1 DM on the server. If it already existed with another id, the local one is replaced. */
export function openDM(localId: ID, userId: ID) {
  void enqueue<ID>(() => sb().rpc('open_dm', { p_user: userId, p_id: localId }), {
    title: t('Could not open the conversation'),
    onData: (serverId) => {
      if (!serverId || serverId === localId) return;
      store().setState((s) => {
        const local = s.dms[localId];
        if (!local) return;
        delete s.dms[localId];
        s.dms[serverId] = { ...(s.dms[serverId] ?? local), id: serverId, hidden: false };
        if (s.view.kind === 'dm' && s.view.dmId === localId) s.view = { kind: 'dm', dmId: serverId };
      });
    },
    undo: () =>
      store().setState((s) => {
        delete s.dms[localId];
        if (s.view.kind === 'dm' && s.view.dmId === localId) s.view = { kind: 'home', page: 'friends' };
      }),
  });
}

export function createGroupDM(id: ID, userIds: ID[]) {
  void enqueue(() => sb().rpc('create_group_dm', { p_id: id, p_users: userIds }), {
    undo: () =>
      store().setState((s) => {
        delete s.dms[id];
        if (s.view.kind === 'dm' && s.view.dmId === id) s.view = { kind: 'home', page: 'friends' };
      }),
  });
}

export function hideDM(dmId: ID, hidden: boolean) {
  void enqueue(() => sb().from('dm_participants').update({ hidden }).match({ dm_id: dmId, user_id: meId() }));
}

export function renameGroupDM(dmId: ID, name: string | undefined) {
  void enqueue(() =>
    sb()
      .from('dm_channels')
      .update({ name: name ?? null })
      .eq('id', dmId),
  );
}
