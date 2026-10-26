/**
 * Account-owned browser liveness. Only friends, DM peers and the current server
 * are read; no global client-controlled Presence map.
 */
import type { ID, PresenceStatus, User } from '../types';
import { supabase } from './client';
import { store } from './bridge';
import { relevantPresenceIds } from './scopedRealtime';
import { handleVerificationError } from './queue';
let online: Record<ID, PresenceStatus> = {};
let stop: (() => void) | null = null;
let touch: (() => Promise<void>) | null = null;
let refresh: ((userId?: ID) => void) | null = null;
export function presenceOf(userId: ID, user: User | undefined = store().getState().users[userId]): PresenceStatus {
  const a = user?.activity;
  const desktop = a?.source === 'desktop' && a.expiresAt && a.expiresAt > Date.now() && user.accountStatus !== 'offline';
  return online[userId] ?? (desktop ? user.accountStatus ?? 'online' : 'offline');
}
export const browserPresenceOf = (userId: ID): PresenceStatus => online[userId] ?? 'offline';
export function refreshPresence(userId?: ID) { refresh?.(userId); }
export function startPresence(meId: ID) {
  stopPresence();
  const instance = crypto.randomUUID(), controller = new AbortController();
  let closed = false, running = false, again = false, timer: ReturnType<typeof setTimeout> | undefined, signature = '';
  let full = true;
  const dirty = new Set<ID>();
  let relevant = relevantPresenceIds(store().getState()), relevantSet = new Set(relevant);
  const active = () => !closed && store().getState().meId === meId;
  const apply = (next: Record<ID, PresenceStatus>, wanted: ID[]) => {
    const ids = new Set([...Object.keys(online), ...Object.keys(next), ...wanted]);
    online = next;
    const changed = [...ids].filter(id => { const u = store().getState().users[id]; return u && u.status !== presenceOf(id, u); });
    if (changed.length) store().setState(s => { for (const id of changed) if (s.users[id]) s.users[id].status = presenceOf(id, s.users[id]); });
  };
  const run = async () => {
    timer = undefined;
    if (!active() || document.hidden) return;
    if (running) { again = true; return; }
    running = true;
    try {
      const all = relevant, wanted = relevantSet, complete = full;
      const ids = complete ? all : [...dirty].filter(id => wanted.has(id));
      full = false; dirty.clear();
      const next: Record<ID, PresenceStatus> = complete ? {} : { ...online }, preferences: Record<ID, PresenceStatus> = {};
      for (const id of ids) delete next[id];
      for (let i = 0; i < ids.length; i += 500) {
        const { data, error } = await supabase().rpc('presence_snapshot', { p_users: ids.slice(i, i + 500) }).abortSignal(controller.signal);
        if (error) throw error;
        if (!active()) return;
        for (const [id, raw] of Object.entries(data ?? {})) {
          const value = raw as { status?: PresenceStatus; online?: boolean };
          if (!wanted.has(id) || !value || !['online', 'idle', 'dnd', 'offline'].includes(value.status ?? '')) continue;
          preferences[id] = value.status!;
          if (value.online && value.status !== 'offline') next[id] = value.status!;
        }
      }
      if (active()) {
        store().setState(s => { for (const [id, status] of Object.entries(preferences)) if (s.users[id]) s.users[id].accountStatus = status; });
        apply(next, ids);
      }
    } catch (error) { if (active()) handleVerificationError(error); }
    finally { running = false; if (again && active()) { again = false; if (!timer) timer = setTimeout(() => void run(), 150); } }
  };
  const schedule = (userId?: ID) => {
    if (userId) { if (!relevantSet.has(userId)) return; dirty.add(userId); }
    else full = true;
    if (running) again = true;
    if (!closed && !timer) timer = setTimeout(() => void run(), 150);
  };
  const heartbeat = async () => {
    if (!active()) return;
    try {
      const { error } = await supabase().rpc('presence_touch', { p_instance: instance }).abortSignal(controller.signal);
      if (error) handleVerificationError(error);
    } catch (error) { if (active()) handleVerificationError(error); }
  };
  touch = heartbeat; refresh = schedule;
  const unsubscribe = store().subscribe((s, previous) => {
    if (s.view !== previous.view || s.servers !== previous.servers || s.relationships !== previous.relationships || s.dms !== previous.dms) {
      const ids = relevantPresenceIds(s), next = ids.join(',');
      if (next !== signature) { signature = next; relevant = ids; relevantSet = new Set(ids); schedule(); }
    }
  });
  const focus = () => { if (!document.hidden) { void heartbeat(); schedule(); } };
  const pagehide = () => { if (active()) void supabase().rpc('presence_touch', { p_instance: instance, p_leave: true }).then(() => {}); };
  const beat = setInterval(() => void heartbeat(), 25_000), poll = setInterval(schedule, 30_000);
  document.addEventListener('visibilitychange', focus); window.addEventListener('online', focus); window.addEventListener('pagehide', pagehide);
  stop = () => {
    closed = true; controller.abort(); unsubscribe(); clearInterval(beat); clearInterval(poll); if (timer) clearTimeout(timer);
    document.removeEventListener('visibilitychange', focus); window.removeEventListener('online', focus); window.removeEventListener('pagehide', pagehide);
    void supabase().rpc('presence_touch', { p_instance: instance, p_leave: true }).then(() => {});
  };
  void heartbeat(); schedule();
}
export async function announce() { await touch?.(); refresh?.(); }
export function stopPresence() {
  stop?.(); stop = null; touch = null; refresh = null; online = {};
}
