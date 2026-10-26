import { DeltaPump, type SyncReply, type SyncScope } from './deltaPump';
import { supabase } from './client';
import { cloudHooks, store } from './bridge';
import { whenIdle, handleVerificationError, isBusy } from './queue';
import { fetchProfiles } from './load';
import { toMessage, toUser, type MessageRow } from './map';
import { presenceOf } from './presence';
import { clearTyping } from './typing';
import { resetScopeHistory } from './history';

export interface MessageDelta extends SyncReply { rows: MessageRow[]; deleted: string[] }
export function startMessageFeed(userId: string) {
  let stopped = false;
  let initialized = false;
  const startedAt = Date.now(), initial = new Set<string>();
  const active = () => !stopped && store().getState().meId === userId;
  const pump = new DeltaPump<MessageDelta>({
    idle: whenIdle,
    fetch: async (p_scopes, signal) => {
      const { data, error } = await supabase().rpc('message_sync', { p_scopes }).abortSignal(signal);
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error('Invalid message sync');
      return data as MessageDelta[];
    },
    error: handleVerificationError,
    apply: async deltas => {
      const missing = [...new Set(deltas.flatMap(d => d.rows.map(r => r.author_id)).filter((id): id is string => !!id && !store().getState().users[id]))];
      const profiles = missing.length ? await fetchProfiles(missing) : [];
      await whenIdle();
      if (!active()) return;
      if (isBusy()) throw new Error('Write queue changed during message sync');
      const incoming = new Map<string, { id: string; at: number }>();
      store().setState(s => {
        if (s.meId !== userId) return;
        for (const p of profiles) { s.users[p.id] = toUser(p, p.id === s.meId); if (p.id !== s.meId) s.users[p.id].status = presenceOf(p.id, s.users[p.id]); }
        for (const d of deltas) {
          if (!s.channels[d.id] && !s.dms[d.id]) continue;
          if (!d.allowed) { delete s.messages[d.id]; continue; }
          const previous = new Map((s.messages[d.id] ?? []).map(m => [m.id, m]));
          const list = d.reset ? new Map() : new Map(previous);
          for (const id of d.deleted) list.delete(id);
          for (const row of d.rows) {
            const old = previous.get(row.id), next = toMessage(row);
            if (old) next.attachments = next.attachments.map(a => ({ ...old.attachments.find(v => v.id === a.id), ...a }));
            list.set(row.id, next);
            const freshScope = d.reset && !initial.has(d.id) && next.createdAt >= startedAt;
            if ((!d.reset || freshScope) && !old && row.author_id !== userId) {
              const previousIncoming = incoming.get(d.id);
              if (!previousIncoming || previousIncoming.at <= next.createdAt) incoming.set(d.id, { id: row.id, at: next.createdAt });
              const visible = s.view.kind === 'dm' ? s.view.dmId === d.id : s.view.kind === 'server' && s.view.channelId === d.id;
              if (freshScope && !visible) s.readState[d.id] = Math.min(s.readState[d.id] ?? next.createdAt, next.createdAt - 1);
            }
            if (row.dm_id && s.dms[row.dm_id]) { s.dms[row.dm_id].lastActivityAt = Math.max(s.dms[row.dm_id].lastActivityAt, next.createdAt); s.dms[row.dm_id].hidden = false; }
            if (row.author_id === userId) s.readState[d.id] = Math.max(s.readState[d.id] ?? 0, next.createdAt + 1);
          }
          s.messages[d.id] = [...list.values()].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
        }
      });
      if (!active()) return;
      for (const d of deltas) {
        if (d.reset || !d.allowed) resetScopeHistory(d.id);
        for (const row of d.rows) if (row.author_id) clearTyping(d.id, row.author_id);
        if (!d.allowed) cloudHooks.requestResync();
      }
      // One current notification per chat/batch; reconnecting a large old backlog stays quiet.
      for (const [scope, message] of incoming) if (message.at >= Date.now() - 30_000) cloudHooks.incomingMessage(scope, message.id);
    },
  });
  return { pump, update: (scopes: SyncScope[]) => { if (!initialized) { scopes.forEach(s => initial.add(s.id)); initialized = true; } pump.update(scopes); }, close: () => { stopped = true; pump.close(); } };
}
