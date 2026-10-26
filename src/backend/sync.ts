import {normalizeFolders} from '../lib/serverFolders';
/**
 * Cloud session lifecycle: load the data after sign-in, keep it current via
 * Realtime, reload when something changed that cannot be applied directly.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { BadgeId, ID } from '../types';
import type { Store } from '../store/store';
import { supabase } from './client';
import { cloudHooks, store } from './bridge';
import { known, loadCloudData, type CloudData } from './load';
import { handleVerificationError, isBusy, resetQueue, setFailHandler, whenIdle } from './queue';
import { toNotifyPref, type NotifyRow } from './map';
import { saveNotifyDefault, saveNotifyPref } from './remote';
import type { NotifyLevel } from '../types';
import { resetHistory } from './history';
import { firstTextChannel } from '../store/store';
import { presenceOf, startPresence, stopPresence, refreshPresence } from './presence';
import { startMessageFeed } from './messageFeed';
import { startScopedRealtime } from './scopedRealtime';
import { toast } from '../store/ui';
import { t } from '../i18n';
import { BADGE_BY_ID } from '../data/badges';
import { leave as leaveVoice } from '../voice/engine';
import { forgetVoiceResume } from '../voice/resume';
import { unwatchVoiceActivity } from './voiceActivity';
import { closeVoiceAudio } from '../voice/sounds';
import { configurePtt } from '../voice/ptt';
import { resetCalls } from '../voice/calls';
import { unwatchCalls, unwatchVoiceScopes } from './voice';

let live: RealtimeChannel | null = null;
let generation = 0;
let feed: ReturnType<typeof startMessageFeed> | null = null;
let stopScoped: (() => void) | null = null;
let currentUser: ID | null = null;
let resyncTimer: ReturnType<typeof setTimeout> | null = null;
let resyncRunning = false;
let resyncAgain = false;
let everSubscribed = false;

/* ---------------------------------------------------------------- */
/* Applying loaded data                                               */
/* ---------------------------------------------------------------- */

/** Preferences that belong to one account (drafts, notes, read state …) – never shown to another account. */
function resetAccountPrefs(s: Store) {
  s.serverOrder = [];
  s.serverFolders = [];
  s.readState = {};
  s.notes = {};
  s.drafts = {};
  s.lastChannelByServer = {};
  s.collapsedCategories = {};
  s.mutedChannels = {};
  s.notifyPrefs = {};
  s.notifyDefault = 'all';
  s.favorites = [];
  s.frequentEmojis = {};
  s.view = { kind: 'home', page: 'friends' };
}

function applyData(s: Store, data: CloudData) {
  const previous=s.meId===data.meId?s.users:{};
  if (s.meId && s.meId !== data.meId) resetAccountPrefs(s);
  s.meId = data.meId;
  s.users = data.users;
  for(const [id,user] of Object.entries(s.users)){const a=previous[id]?.activity;if(user.accountStatus!=='offline'&&a?.expiresAt&&a.expiresAt>Date.now())user.activity=a;}
  s.servers = data.servers;
  s.channels = data.channels;
  s.dms = data.dms;
  s.relationships = data.relationships;
  s.earnedBadges = data.earnedBadges;
  s.notes = data.notes;
  s.redeemed = data.redeemed;
  applyNotifySettings(s, data);
  // Online status of the others comes from presence.
  for (const [id, u] of Object.entries(s.users)) if (id !== data.meId) u.status = presenceOf(id,u);

  if (data.messages) {
    s.messages = data.messages;
    resetHistory();
  }
  else {
    // Structure reload: keep the messages of channels and DMs that still exist.
    for (const id of Object.keys(s.messages)) if (!data.channels[id] && !data.dms[id]) delete s.messages[id];
  }

  // Server order is a local preference: keep it, drop servers that are gone, append new ones.
  const ids = Object.keys(data.servers);
  s.serverOrder = [...s.serverOrder.filter((id) => data.servers[id]), ...ids.filter((id) => !s.serverOrder.includes(id)).sort((a, b) => data.servers[a].createdAt - data.servers[b].createdAt)];

  s.serverFolders = normalizeFolders(s.serverFolderPrefs[data.meId] ?? s.serverFolders, s.serverOrder);

  // Read state: the newest of this device and the account (other devices). Channels seen for the first time count as read.
  for (const [id, at] of Object.entries(data.readStates)) s.readState[id] = Math.max(s.readState[id] ?? 0, at);
  for (const id of [...Object.keys(data.channels), ...Object.keys(data.dms)]) {
    if (s.readState[id] === undefined) {
      const list = s.messages[id];
      s.readState[id] = list?.length ? list[list.length - 1].createdAt + 1 : Date.now();
    }
  }

  // The view must point at something that exists.
  const v = s.view;
  if (v.kind === 'server') {
    const server = s.servers[v.serverId];
    if (!server) s.view = { kind: 'home', page: 'friends' };
    else if (v.channelId && !s.channels[v.channelId]) s.view = { kind: 'server', serverId: server.id, channelId: firstTextChannel(s.channels, server) };
  } else if (v.kind === 'dm' && !s.dms[v.dmId]) s.view = { kind: 'home', page: 'friends' };
  if (s.voiceSelf.channelId && !s.channels[s.voiceSelf.channelId]) s.voiceSelf = { ...s.voiceSelf, channelId: null };
  if(data.messages&&s.users[data.meId]?.guest&&s.view.kind==='home'){
    const official=Object.values(s.servers).find(server=>server.isOfficial);
    if(official)s.view={kind:'server',serverId:official.id,channelId:firstTextChannel(s.channels,official)};
  }
}

/** Settings from older versions of this device that still have to be uploaded once. */
let legacyNotify: { ids: ID[]; level?: NotifyLevel } = { ids: [] };

/** Notification settings come from the account; local mutes from before version 6 are taken over once. */
function applyNotifySettings(s: Store, data: CloudData) {
  s.notifyPrefs = { ...data.notifyPrefs };
  if (data.notifyDefault) s.notifyDefault = data.notifyDefault;
  else if (s.notifyDefault !== 'all') legacyNotify.level = s.notifyDefault;
  for (const [id, muted] of Object.entries(s.mutedChannels)) {
    if (!muted || data.notifyPrefs[id] || (!data.channels[id] && !data.dms[id])) continue;
    s.notifyPrefs[id] = { muted: true };
    legacyNotify.ids.push(id);
  }
  s.mutedChannels = {};
}

function uploadLegacyNotify() {
  const { ids, level } = legacyNotify;
  legacyNotify = { ids: [] };
  const s = store().getState();
  if(s.users[s.meId]?.guest)return;
  for (const id of ids) saveNotifyPref(id, s.notifyPrefs[id]);
  if (level) saveNotifyDefault(level);
}

/** Removes all account data from the store (sign-out). Local preferences stay. */
export function clearCloudData() {
  resetHistory();
  store().setState((s) => {
    resetAccountPrefs(s);
    s.meId = '';
    s.users = {};
    s.servers = {};
    s.channels = {};
    s.dms = {};
    s.messages = {};
    s.relationships = {};
    s.earnedBadges = {};
    s.voice = {};
    s.view = { kind: 'home', page: 'friends' };
    s.call = null;
    s.viewAs = null;
  });
}

/* ---------------------------------------------------------------- */
/* Start / stop                                                       */
/* ---------------------------------------------------------------- */

export async function startCloud(userId: ID) {
  if (currentUser && currentUser !== userId) stopCloud();
  const epoch = ++generation;
  currentUser = userId;
  setFailHandler(requestResync);
  const data = await loadCloudData(userId, { messages: true });
  if (currentUser !== userId || generation !== epoch) return;
  store().setState((s) => applyData(s, data));
  uploadLegacyNotify();
  subscribe(userId);
  startPresence(userId);
  feed?.close(); stopScoped?.();
  const nextFeed = startMessageFeed(userId); feed = nextFeed;
  stopScoped = startScopedRealtime(userId, { messages: server => nextFeed.pump.wake(server), presence: refreshPresence, scopes: nextFeed.update });
}

export function stopCloud() {
  generation++;
  stopScoped?.(); stopScoped = null; feed?.close(); feed = null;
  forgetVoiceResume();
  void leaveVoice({ silent: true });
  resetCalls();
  closeVoiceAudio();
  configurePtt(false, '', 0);
  unwatchCalls();
  unwatchVoiceScopes();
  unwatchVoiceActivity();
  currentUser = null;
  everSubscribed = false;
  if (resyncTimer) clearTimeout(resyncTimer);
  resyncTimer = null;
  resyncAgain = false;
  resyncWithMessages = false;
  resyncRunning = false;
  running = null;
  resetQueue();
  stopPresence();
  if (live) void supabase().removeChannel(live);
  live = null;
}

/** Reloads the structure (servers, channels, members, DMs, friends) once pending changes are sent. */
export function requestResync(opts: { messages?: boolean } = {}) {
  if (!currentUser) return;
  if (opts.messages) resyncWithMessages = true;
  if (resyncTimer) clearTimeout(resyncTimer);
  resyncTimer = setTimeout(runResync, 400);
}

let resyncWithMessages = false;
let running: Promise<void> | null = null;

/** Reloads right away and resolves when the new data is in the store (e.g. after joining a server). */
export async function reloadNow() {
  if (resyncTimer) clearTimeout(resyncTimer);
  resyncTimer = null;
  if (running) await running;
  await runResync();
}

function runResync(): Promise<void> {
  resyncTimer = null;
  if (resyncRunning) {
    resyncAgain = true;
    return running ?? Promise.resolve();
  }
  const task = doResync().finally(() => { if (running === task) running = null; });
  running = task;
  return running;
}

async function doResync() {
  const userId = currentUser, epoch = generation;
  if (!userId) return;
  resyncRunning = true;
  try {
    // Never overwrite local changes that are still on their way.
    if (isBusy()) await whenIdle();
    const withMessages = resyncWithMessages;
    resyncWithMessages = false;
    const data = await loadCloudData(userId, { messages: withMessages });
    if (currentUser !== userId || generation !== epoch || isBusy()) {
      // Try again later, without losing a requested message reload.
      resyncWithMessages ||= withMessages;
      resyncAgain = currentUser === userId && generation === epoch;
      return;
    }
    store().setState((s) => applyData(s, data));
    uploadLegacyNotify();
    // Newly visible scopes bootstrap through the same revision-consistent feed.
  } catch (e) {
    console.warn('[onyx] reload failed', e);
    handleVerificationError(e);
  } finally {
    if (generation === epoch) {
      resyncRunning = false;
      if (resyncAgain) {
        resyncAgain = false;
        requestResync();
      }
    }
  }
}

/* ---------------------------------------------------------------- */
/* Realtime                                                           */
/* ---------------------------------------------------------------- */

const STRUCTURE_TABLES = [
  'servers',
  'server_members',
  'member_roles',
  'roles',
  'categories',
  'channels',
  'permission_overwrites',
  'invites',
  'server_badges',
  'member_badges',
  'server_emojis',
  'server_bans',
  'dm_channels',
  'dm_participants',
];

function subscribe(userId: ID) {
  const sb = supabase();
  if (live) void sb.removeChannel(live);
  let ch = sb
    .channel(`onyx-live-${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, (p) => {
      // Delete events only carry the id (and reach everyone): react only to our own.
      const id = ((p.new as { id?: ID })?.id ?? (p.old as { id?: ID })?.id) as ID | undefined;
      if (p.eventType !== 'DELETE' || (id && known.friendships.has(id))) requestResync();
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'user_badges', filter: `user_id=eq.${userId}` }, (p) =>
      onBadge((p.new as { badge: BadgeId; earned_at: string }).badge, (p.new as { earned_at: string }).earned_at),
    )
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'user_badges' }, (p) => {
      const row=p.old as {user_id?:string;badge?:BadgeId};
      if(row.user_id!==userId||!row.badge)return;
      const badge=row.badge;store().setState(st=>{delete st.earnedBadges[badge];const me=st.users[userId];if(me)me.badges=me.badges.filter(item=>item!==badge);});
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'blocks' }, (p) => {
      if (p.eventType !== 'DELETE' || (p.old as { blocker_id?: ID }).blocker_id === userId) requestResync();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notification_settings', filter: `user_id=eq.${userId}` }, (p) =>
      onNotifySetting(p.eventType === 'DELETE' ? (p.old as NotifyRow) : (p.new as NotifyRow), p.eventType === 'DELETE'),
    );
  for (const table of STRUCTURE_TABLES) {
    ch = ch.on('postgres_changes', { event: '*', schema: 'public', table }, (p) => {
      if (p.eventType === 'DELETE' && !concernsMe(table, p.old as Record<string, ID>)) return;
      requestResync();
    });
  }
  live = ch.subscribe((status) => {
    if (currentUser !== userId || live !== ch) return;
    if (status === 'SUBSCRIBED') {
      // After a reconnect, fetch what was missed in the meantime.
      if (everSubscribed) requestResync({ messages: true });
      everSubscribed = true;
    }
  });
}

/** Realtime delete events carry only the primary key and reach every subscriber – filter the ones we know. */
function concernsMe(table: string, old: Record<string, ID>) {
  const s = store().getState();
  switch (table) {
    case 'servers':
      return !!s.servers[old.id];
    case 'channels':
      return !!s.channels[old.id];
    case 'categories':
      return Object.values(s.servers).some((sv) => sv.categories.some((k) => k.id === old.id));
    case 'roles':
      return Object.values(s.servers).some((sv) => sv.roles.some((r) => r.id === old.id));
    case 'server_emojis':
      return Object.values(s.servers).some((sv) => sv.emojis.some((e) => e.id === old.id));
    case 'server_badges':
      return Object.values(s.servers).some((sv) => sv.badges?.some((b) => b.id === old.id));
    case 'invites':
      return Object.values(s.servers).some((sv) => sv.invites.some((i) => i.code === old.code));
    case 'permission_overwrites':
      return known.overwrites.has(old.id);
    case 'server_bans':
      return !!s.servers[old.server_id]?.bans?.some((b) => b.userId === old.user_id);
    case 'dm_channels':
      return !!s.dms[old.id];
    case 'dm_participants':
      return !!s.dms[old.dm_id];
    default:
      return !!old.server_id && !!s.servers[old.server_id];
  }
}

/** Notification settings changed on another device. */
function onNotifySetting(row: NotifyRow, deleted: boolean) {
  const s = store().getState();
  if (row.user_id !== s.meId) return;
  // Our own change is still on its way – reload once it has arrived instead of applying an older state.
  if (isBusy()) return requestResync();
  store().setState((st) => {
    if (row.scope_id === st.meId) {
      if (!deleted) st.notifyDefault = row.level ?? 'all';
    } else if (deleted) delete st.notifyPrefs[row.scope_id];
    else st.notifyPrefs[row.scope_id] = toNotifyPref(row);
  });
}

/** A badge was awarded by the server (event, goal, code, Plus). */
function onBadge(badge: BadgeId, earnedAt: string) {
  const s = store().getState();
  if (s.earnedBadges[badge]) return;
  store().setState((st) => {
    st.earnedBadges[badge] = new Date(earnedAt).getTime();
    const me = st.users[st.meId];
    if (me && !me.badges.includes(badge) && me.badges.length < 10) me.badges.push(badge);
  });
  const def = BADGE_BY_ID[badge];
  if (def) toast({ tone: 'success', title: t('Badge earned: {name}', { name: t(def.name) }), body: t('You can find it under Settings → Badges.') });
}

cloudHooks.requestResync = () => requestResync();
cloudHooks.reloadNow = reloadNow;
