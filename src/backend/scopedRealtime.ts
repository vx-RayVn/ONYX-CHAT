/** Server-scoped wake-ups, plus the signed-in user's inbox. No message content. */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './client';
import { store } from './bridge';
import type { SyncScope } from './deltaPump';
import type { Store } from '../store/store';

export function messageScopes(s: Store): SyncScope[] {
  return [...Object.values(s.channels).filter(c => c.type !== 'voice').map(c => ({ id: c.id, dm: false, server: c.serverId })),
    ...Object.keys(s.dms).map(id => ({ id, dm: true }))];
}
export function relevantPresenceIds(s: Store): string[] {
  const ids = new Set<string>();
  for (const r of Object.values(s.relationships)) if (r.type === 'friend') ids.add(r.userId);
  for (const dm of Object.values(s.dms)) for (const id of dm.participantIds) ids.add(id);
  if (s.view.kind === 'server') for (const id of Object.keys(s.servers[s.view.serverId]?.members ?? {})) ids.add(id);
  ids.delete(s.meId); ids.delete('deleted-user');
  return [...ids].sort();
}
export function startScopedRealtime(userId: string, callbacks: { messages: (server?: string) => void; presence: (userId?: string) => void; scopes: (scopes: SyncScope[]) => void }) {
  const channels = new Map<string, RealtimeChannel>();
  let stopped = false, scopeSignature = '', serverSignature = '';
  const refresh = () => {
    if (stopped) return;
    const s = store().getState();
    if (s.meId !== userId) return;
    const scopes = messageScopes(s);
    const signature = scopes.map(v => v.id).sort().join(',');
    if (signature !== scopeSignature) { scopeSignature = signature; callbacks.scopes(scopes); }
    // Leave room for voice/account channels. Unsubscribed servers still catch up periodically.
    const selected = s.view.kind === 'server' ? s.view.serverId : '';
    const serverIds = [selected, ...s.serverOrder, ...Object.keys(s.servers)].filter((id, i, all) => id && s.servers[id] && all.indexOf(id) === i).slice(0, 48);
    const topics = new Map<string, string>([['onyx:inbox:' + userId, 'inbox'], ...serverIds.map(id => ['onyx:server:' + id, id] as [string, string])]);
    const signature2 = [...topics.keys()].sort().join(',');
    if (signature2 === serverSignature) return;
    serverSignature = signature2;
    for (const [topic, ch] of channels) if (!topics.has(topic)) { channels.delete(topic); void supabase().removeChannel(ch); }
    for (const [topic, server] of topics) if (!channels.has(topic)) {
      const ch = supabase().channel(topic, { config: { private: true } })
        .on('broadcast', { event: 'messages' }, () => { if (!stopped) callbacks.messages(server); })
        .on('broadcast', { event: 'presence' }, ({ payload }) => {
          const view = store().getState().view;
          if (!stopped && (server === 'inbox' || view.kind === 'server' && view.serverId === server)) callbacks.presence(typeof payload?.user_id === 'string' ? payload.user_id : undefined);
        });
      channels.set(topic, ch);
      ch.subscribe(status => { if (!stopped && status === 'SUBSCRIBED') { callbacks.messages(server); const view = store().getState().view; if (server === 'inbox' || view.kind === 'server' && view.serverId === server) callbacks.presence(); } });
    }
  };
  const unsubscribe = store().subscribe((s, previous) => {
    if (s.channels !== previous.channels || s.dms !== previous.dms || s.servers !== previous.servers || s.serverOrder !== previous.serverOrder || s.view !== previous.view) refresh();
  });
  const catchUp = () => { if (!stopped && document.visibilityState !== 'hidden') { callbacks.messages(); callbacks.presence(); } };
  const interval = setInterval(catchUp, 60_000);
  window.addEventListener('online', catchUp); document.addEventListener('visibilitychange', catchUp);
  refresh();
  return () => {
    stopped = true; unsubscribe(); clearInterval(interval);
    window.removeEventListener('online', catchUp); document.removeEventListener('visibilitychange', catchUp);
    for (const ch of channels.values()) void supabase().removeChannel(ch);
    channels.clear();
  };
}
