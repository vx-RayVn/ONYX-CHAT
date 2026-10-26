/**
 * Calls in DMs and groups: which calls exist (for the call notices in the
 * chat), which ring for me right now, the ringtone and the ringback tone.
 *
 * A call rings for 45 s – until I answer or decline (on any device), the
 * caller hangs up or someone else answered on my account. The server sends
 * every change to "calls:<my id>".
 */
import { create } from 'zustand';
import type { ID } from '../types';
import { store } from '../backend/bridge';
import { CLOUD } from '../backend/config';
import { declineCall as declineOnServer, fetchActiveCalls, fetchCalls, type CallRow } from '../backend/voice';
import { isMuted } from '../lib/notifyRules';
import { toast } from '../store/ui';
import { t } from '../i18n';
import { startRingback, startRingtone } from './sounds';
import * as engine from './engine';

export const RING_MS = 45_000;

interface CallsState {
  calls: Record<ID, CallRow>;
  /** Calls ringing for me, oldest first. */
  incoming: ID[];
}

export const useCalls = create<CallsState>()(() => ({ calls: {}, incoming: [] }));

const ringTimers = new Map<ID, ReturnType<typeof setTimeout>>();
const declineTimers = new Set<ReturnType<typeof setTimeout>>();
let generation = 0;

/** Should this call ring here right now? */
function rings(c: CallRow): boolean {
  const s = store().getState();
  const me = s.meId;
  if (!me || c.ended_at || c.started_by === me) return false;
  if (c.joined.includes(me) || c.declined.includes(me)) return false;
  if (Date.now() - Date.parse(c.started_at) > RING_MS) return false;
  if (s.call?.dmId === c.dm_id) return false;
  if (c.started_by && s.relationships[c.started_by]?.type === 'blocked') return false;
  return !!s.dms[c.dm_id];
}

function setIncoming(ids: ID[]) {
  const prev = useCalls.getState().incoming;
  if (prev.length === ids.length && prev.every((x, i) => x === ids[i])) return;
  useCalls.setState({ incoming: ids });
  updateRingtone();
}

function evaluate(c: CallRow) {
  const list = useCalls.getState().incoming.filter((id) => id !== c.id);
  clearTimeout(ringTimers.get(c.id));
  ringTimers.delete(c.id);
  if (rings(c)) {
    list.push(c.id);
    const left = RING_MS - (Date.now() - Date.parse(c.started_at));
    ringTimers.set(
      c.id,
      setTimeout(
        () => {
          ringTimers.delete(c.id);
          setIncoming(useCalls.getState().incoming.filter((id) => id !== c.id));
        },
        Math.max(0, left),
      ),
    );
  }
  setIncoming(list);
}

/** A call row from the server (Realtime or loaded). */
export function upsertCall(c: CallRow) {
  const previous = useCalls.getState().calls[c.id];
  if (previous && (Date.parse(previous.updated_at) > Date.parse(c.updated_at) || (previous.ended_at && !c.ended_at && previous.updated_at === c.updated_at))) return;
  useCalls.setState((s) => ({ calls: { ...s.calls, [c.id]: c } }));
  evaluate(c);
  checkOwnCall(c);
}

/** Our own outgoing 1:1 call was declined: say so and hang up. */
function checkOwnCall(c: CallRow) {
  const s = store().getState();
  const call = s.call;
  if (!call || call.dmId !== c.dm_id || call.state === 'connected') return;
  const dm = s.dms[c.dm_id];
  if (!dm || dm.type !== 'dm') return;
  const other = dm.participantIds.find((id) => id !== s.meId);
  if (other && c.declined.includes(other) && !c.joined.includes(other)) {
    toast({ title: t('{name} declined the call', { name: s.users[other]?.displayName ?? '' }) });
    const timer = setTimeout(() => {
      declineTimers.delete(timer);
      const now = store().getState().call;
      if (now?.callId === call.callId && now.dmId === c.dm_id && now.state !== 'connected') void engine.leave();
    }, 600);
    declineTimers.add(timer);
  }
}

/* ---------------------------------------------------------------- */
/* Ringtone / ringback                                                */
/* ---------------------------------------------------------------- */

let stopRing: (() => void) | null = null;
let stopBack: (() => void) | null = null;
let backTimer: ReturnType<typeof setTimeout> | null = null;

function quiet(dmId: ID) {
  const s = store().getState();
  return s.users[s.meId]?.status === 'dnd' || isMuted(s.notifyPrefs[dmId], Date.now());
}

function updateRingtone() {
  const { incoming, calls } = useCalls.getState();
  const audible = incoming.some((id) => calls[id] && !quiet(calls[id].dm_id));
  const s = store().getState();
  if (audible && !stopRing) stopRing = startRingtone(s.settings.notifyVolume);
  if (!audible && stopRing) {
    stopRing();
    stopRing = null;
  }
}

/** Outgoing call: ringback while nobody else is there, for at most 45 s. */
export function updateRingback(state: 'connecting' | 'ringing' | 'connected' | null) {
  if (state === 'ringing' && !stopBack) {
    stopBack = startRingback(store().getState().settings.notifyVolume);
    backTimer = setTimeout(() => updateRingback(null), RING_MS);
  } else if (state !== 'ringing' && stopBack) {
    stopBack();
    stopBack = null;
    if (backTimer) clearTimeout(backTimer);
    backTimer = null;
  }
}

/* ---------------------------------------------------------------- */
/* Actions                                                            */
/* ---------------------------------------------------------------- */

export function acceptCall(callId: ID, video = false) {
  const c = useCalls.getState().calls[callId];
  if (!c) return;
  setIncoming(useCalls.getState().incoming.filter((id) => id !== callId));
  void engine.joinCall(c.dm_id, { video });
}

export function declineCall(callId: ID) {
  setIncoming(useCalls.getState().incoming.filter((id) => id !== callId));
  void declineOnServer(callId).catch(() => {});
}

/** Loads the running calls of my DMs (after sign-in and after a Realtime reconnect). */
export async function refreshActiveCalls() {
  if (!CLOUD) return;
  const mine = generation;
  const user = store().getState().meId;
  const rows = await fetchActiveCalls();
  if (mine !== generation || store().getState().meId !== user) return;
  for (const c of rows) upsertCall(c);
}

/* Calls for the notices in the chat: loaded in batches when they are shown. */
const pending = new Set<ID>();
const asked = new Set<ID>();
let batch: ReturnType<typeof setTimeout> | null = null;

export function requestCall(id: ID) {
  if (!CLOUD || asked.has(id) || useCalls.getState().calls[id]) return;
  asked.add(id);
  pending.add(id);
  batch ??= setTimeout(async () => {
    const mine = generation;
    const user = store().getState().meId;
    batch = null;
    const ids = [...pending];
    pending.clear();
    const rows = await fetchCalls(ids);
    if (mine !== generation || store().getState().meId !== user) return;
    for (const row of rows) upsertCall(row);
  }, 50);
}

export function resetCalls() {
  generation++;
  if (batch) clearTimeout(batch);
  batch = null;
  pending.clear();
  for (const timer of declineTimers) clearTimeout(timer);
  declineTimers.clear();
  for (const tm of ringTimers.values()) clearTimeout(tm);
  ringTimers.clear();
  asked.clear();
  useCalls.setState({ calls: {}, incoming: [] });
  updateRingtone();
  updateRingback(null);
}
