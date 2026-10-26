/**
 * Voice and calls on the server.
 *
 *  - Access to a voice channel or call: Edge Function "voice" (checks rights,
 *    issues a short-lived LiveKit token). Moderation goes the same way.
 *  - Who is in which channel: table voice_states (written by the LiveKit
 *    webhook), loaded per server / DM and kept current via Realtime broadcast
 *    "voice:<channel or dm id>" – only for what is on screen, so it scales.
 *  - Calls: table calls; every change reaches the participants via
 *    "calls:<own user id>" (also "move" and "elsewhere" signals).
 */
import { FunctionsFetchError, FunctionsHttpError, type RealtimeChannel } from '@supabase/supabase-js';
import type { ID, VoiceParticipant } from '../types';
import { supabase } from './client';
import { store } from './bridge';
import { fetchProfiles } from './load';
import { toUser } from './map';
import { presenceOf } from './presence';

/* ---------------------------------------------------------------- */
/* Edge Function                                                      */
/* ---------------------------------------------------------------- */

export interface JoinResponse {
  url: string;
  token: string;
  room: string;
  kind: 'channel' | 'dm';
  serverId: ID | null;
  channelId: ID | null;
  dmId: ID | null;
  callId: ID | null;
  callStarted: boolean;
  canSpeak: boolean;
  canVideo: boolean;
  canScreen: boolean;
  serverMute: boolean;
  serverDeaf: boolean;
}

export type VoiceErrorCode =
  | 'not_configured'
  | 'unauthorized'
  | 'suspended'
  | 'forbidden'
  | 'blocked'
  | 'full'
  | 'not_found'
  | 'rate_limited'
  | 'hierarchy'
  | 'target_cannot_connect'
  | 'livekit_unavailable'
  | 'offline'
  | 'failed';

export class VoiceError extends Error {
  code: VoiceErrorCode;
  permission?: string;
  constructor(code: VoiceErrorCode, permission?: string) {
    super(code);
    this.code = code;
    this.permission = permission;
  }
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().functions.invoke('voice', { body });
  if (!error) return data as T;
  if (error instanceof FunctionsFetchError) throw new VoiceError('offline');
  if (error instanceof FunctionsHttpError) {
    const json = (await (error.context as Response).json().catch(() => ({}))) as { error?: string; permission?: string };
    throw new VoiceError((json.error as VoiceErrorCode) || 'failed', json.permission);
  }
  throw new VoiceError('failed');
}

export const requestJoin = (target: ID, video = false) => invoke<JoinResponse>({ action: 'join', target, video });

export type ModerateOp = 'mute' | 'unmute' | 'deafen' | 'undeafen' | 'disconnect' | 'move';
export const requestModerate = (target: ID, op: ModerateOp, dest?: ID) => invoke<{ ok: true }>({ action: 'moderate', target, op, dest });

/* ---------------------------------------------------------------- */
/* Own mute / deafen indicator                                        */
/* ---------------------------------------------------------------- */

let selfTimer: ReturnType<typeof setTimeout> | null = null;
let selfSent = '';

/** Tells the others whether we are muted / deafened (debounced; only shown in the lists). */
export function reportSelf(muted: boolean, deafened: boolean, force = false) {
  const key = `${muted}|${deafened}`;
  if (!force && key === selfSent) return;
  if (selfTimer) clearTimeout(selfTimer);
  selfTimer = setTimeout(() => {
    selfTimer = null;
    selfSent = key;
    void supabase()
      .rpc('voice_set_self', { p_mute: muted, p_deaf: deafened })
      .then(({ error }) => {
        if (error) selfSent = '';
      });
  }, 250);
}

export function resetSelfReport() {
  if (selfTimer) clearTimeout(selfTimer);
  selfTimer = null;
  selfSent = '';
}

/* ---------------------------------------------------------------- */
/* Who is where (voice_states)                                        */
/* ---------------------------------------------------------------- */

interface VoiceStateRow {
  user_id: ID;
  server_id: ID | null;
  channel_id: ID | null;
  dm_id: ID | null;
  joined_at: string;
  self_mute: boolean;
  self_deaf: boolean;
  server_mute: boolean;
  server_deaf: boolean;
  camera: boolean;
  screen: boolean;
}

const COLUMNS = 'user_id, server_id, channel_id, dm_id, joined_at, self_mute, self_deaf, server_mute, server_deaf, camera, screen';

function toParticipant(r: VoiceStateRow): VoiceParticipant {
  return {
    userId: r.user_id,
    joinedAt: new Date(r.joined_at).getTime(),
    muted: r.self_mute || r.server_mute,
    deafened: r.self_deaf || r.server_deaf,
    serverMuted: r.server_mute,
    serverDeafened: r.server_deaf,
    video: r.camera,
    streaming: r.screen,
  };
}

const scopeOf = (r: Pick<VoiceStateRow, 'channel_id' | 'dm_id'>) => (r.channel_id ?? r.dm_id) as ID;
let voiceGeneration = 0;
const revisions = new Map<ID, number>();
const bump = (id: ID) => revisions.set(id, (revisions.get(id) ?? 0) + 1);

async function ensureProfiles(ids: ID[]) {
  const s = store().getState();
  const generation = voiceGeneration;
  const missing = [...new Set(ids.filter((id) => !s.users[id]))];
  if (!missing.length) return;
  const rows = await fetchProfiles(missing);
  if (generation !== voiceGeneration || store().getState().meId !== s.meId) return;
  store().setState((st) => {
    for (const p of rows)
      if (!st.users[p.id]) {
        st.users[p.id] = toUser(p, p.id === st.meId);
        if (p.id !== st.meId) st.users[p.id].status = presenceOf(p.id);
      }
  });
}

/** Someone joined, changed or left – applied to store.voice (one entry per person). */
function applyState(row: VoiceStateRow) {
  const scope = scopeOf(row);
  bump(scope);
  store().setState((s) => {
    for (const [id, list] of Object.entries(s.voice)) {
      if (id !== scope && list.some((p) => p.userId === row.user_id)) { bump(id); s.voice[id] = list.filter((p) => p.userId !== row.user_id); }
    }
    const list = (s.voice[scope] ??= []);
    const i = list.findIndex((p) => p.userId === row.user_id);
    const next = toParticipant(row);
    if (i >= 0) list[i] = next;
    else list.push(next);
    list.sort((a, b) => a.joinedAt - b.joinedAt);
  });
}

function applyLeave(userId: ID, scope: ID) {
  bump(scope);
  store().setState((s) => {
    const list = s.voice[scope];
    if (list?.some((p) => p.userId === userId)) s.voice[scope] = list.filter((p) => p.userId !== userId);
  });
}

/** Replaces the participants of these channels / DMs with what the server knows. */
async function replaceStates(scopes: ID[], rows: VoiceStateRow[]) {
  void ensureProfiles(rows.map((r) => r.user_id)).catch(() => {});
  store().setState((s) => {
    for (const id of scopes) s.voice[id] = [];
    for (const r of rows) {
      const scope = scopeOf(r);
      for (const [id, list] of Object.entries(s.voice)) if (id !== scope && list.some((p) => p.userId === r.user_id)) s.voice[id] = list.filter((p) => p.userId !== r.user_id);
      (s.voice[scope] ??= []).push(toParticipant(r));
    }
    for (const id of scopes) s.voice[id].sort((a, b) => a.joinedAt - b.joinedAt);
  });
}

export async function loadServerVoice(serverId: ID) {
  const generation = voiceGeneration;
  const before = new Map(revisions);
  const { data, error } = await supabase().from('voice_states').select(COLUMNS).eq('server_id', serverId);
  if (error || generation !== voiceGeneration) return;
  const s = store().getState();
  const channelIds = Object.values(s.channels)
    .filter((c) => c.serverId === serverId && c.type === 'voice')
    .map((c) => c.id).filter((id) => before.get(id) === revisions.get(id));
  await replaceStates(channelIds, ((data ?? []) as VoiceStateRow[]).filter((r) => channelIds.includes(scopeOf(r))));
}

export async function loadScopeVoice(scope: ID, isDM: boolean) {
  const generation = voiceGeneration;
  const before = revisions.get(scope);
  const { data, error } = await supabase()
    .from('voice_states')
    .select(COLUMNS)
    .eq(isDM ? 'dm_id' : 'channel_id', scope);
  if (error || generation !== voiceGeneration || before !== revisions.get(scope)) return;
  await replaceStates([scope], (data ?? []) as VoiceStateRow[]);
}

/* ---------------------------------------------------------------- */
/* Realtime: "voice:<id>" for what is on screen                       */
/* ---------------------------------------------------------------- */

const topics = new Map<ID, RealtimeChannel>();

/**
 * Listens to exactly these channels / DMs (the visible voice channels of the
 * open server, the open DM and the own connection). Others are left.
 */
export function watchVoiceScopes(scopes: { id: ID; isDM: boolean }[]) {
  const sb = supabase();
  const wanted = new Map(scopes.map((x) => [x.id, x.isDM]));
  for (const [id, ch] of topics) {
    if (wanted.has(id)) continue;
    void sb.removeChannel(ch);
    topics.delete(id);
  }
  for (const [id, isDM] of wanted) {
    if (topics.has(id)) continue;
    const ch = sb.channel(`voice:${id}`, { config: { private: true } });
    ch.on('broadcast', { event: 'state' }, ({ payload }) => {
      if (topics.get(id) !== ch) return;
      const row = payload as VoiceStateRow;
      applyState(row);
      void ensureProfiles([row.user_id]).catch(() => {});
    });
    ch.on('broadcast', { event: 'leave' }, ({ payload }) => { if (topics.get(id) === ch) applyLeave((payload as { user_id: ID }).user_id, id); });
    ch.subscribe((status) => {
      if (status !== 'SUBSCRIBED' || topics.get(id) !== ch) return;
      // After a reconnect something may have been missed: load once more.
      void loadScopeVoice(id, isDM);
    });
    topics.set(id, ch);
  }
}

export function unwatchVoiceScopes() {
  voiceGeneration++;
  revisions.clear();
  for (const ch of topics.values()) void supabase().removeChannel(ch);
  topics.clear();
}

/* ---------------------------------------------------------------- */
/* Calls                                                              */
/* ---------------------------------------------------------------- */

export interface CallRow {
  id: ID;
  dm_id: ID;
  started_by: ID | null;
  started_at: string;
  updated_at: string;
  ended_at: string | null;
  video: boolean;
  joined: ID[];
  declined: ID[];
}

export interface CallSignals {
  onCall: (row: CallRow) => void;
  /** A moderator moved us to another voice channel. */
  onMove: (channelId: ID) => void;
  /** The account joined a voice channel or call elsewhere (other device / tab). */
  onElsewhere: (room: string) => void;
  /** Realtime reconnected: reload what may have been missed. */
  onResubscribed: () => void;
}

let callChannel: RealtimeChannel | null = null;

export function watchCalls(userId: ID, on: CallSignals) {
  unwatchCalls();
  let subscribedBefore = false;
  const ch = supabase().channel(`calls:${userId}`, { config: { private: true } });
  ch.on('broadcast', { event: 'call' }, ({ payload }) => { if (callChannel === ch) on.onCall(payload as CallRow); });
  ch.on('broadcast', { event: 'move' }, ({ payload }) => {
    const id = (payload as { channel_id?: ID }).channel_id;
    if (id && callChannel === ch) on.onMove(id);
  });
  ch.on('broadcast', { event: 'elsewhere' }, ({ payload }) => { if (callChannel === ch) on.onElsewhere(String((payload as { room?: string }).room ?? '')); });
  ch.subscribe((status) => {
    if (status !== 'SUBSCRIBED' || callChannel !== ch) return;
    if (subscribedBefore) on.onResubscribed();
    subscribedBefore = true;
  });
  callChannel = ch;
}

export function unwatchCalls() {
  if (callChannel) void supabase().removeChannel(callChannel);
  callChannel = null;
}

/** Calls that are still running in the own DMs (after sign-in or a reconnect). */
export async function fetchActiveCalls(): Promise<CallRow[]> {
  const { data, error } = await supabase().from('calls').select('*').is('ended_at', null);
  return error ? [] : ((data ?? []) as CallRow[]);
}

export async function fetchCalls(ids: ID[]): Promise<CallRow[]> {
  if (!ids.length) return [];
  const { data, error } = await supabase().from('calls').select('*').in('id', ids);
  return error ? [] : ((data ?? []) as CallRow[]);
}

export async function declineCall(callId: ID) {
  await supabase().rpc('call_decline', { p_call: callId });
}
