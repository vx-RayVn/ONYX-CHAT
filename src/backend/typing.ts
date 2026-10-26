/**
 * "… is typing" over Supabase Realtime Broadcast. Each open chat joins a
 * private channel (typing:channel:<id> or typing:dm:<id>); the database rules
 * decide who may listen (can see the channel) and who may send (can write).
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { ID } from '../types';
import { CLOUD } from './config';
import { supabase } from './client';
import { store } from './bridge';

const SHOW_MS = 6000;
const SEND_EVERY_MS = 3000;

/** scope id → user id → time until which "typing" is shown */
export const useTypingStore = create<{ typing: Record<ID, Record<ID, number>> }>(() => ({ typing: {} }));

const channels = new Map<ID, RealtimeChannel>();
const lastSent = new Map<ID, number>();

const topic = (scopeId: ID, isDM: boolean) => `typing:v2:${isDM ? 'dm' : 'channel'}:${scopeId}`;
const dmScopes = new Set<ID>();

function setTyping(scopeId: ID, userId: ID, until: number | null) {
  useTypingStore.setState((st) => {
    const scope = { ...(st.typing[scopeId] ?? {}) };
    if (until) scope[userId] = until;
    else delete scope[userId];
    return { typing: { ...st.typing, [scopeId]: scope } };
  });
}

/** Someone's message arrived: they are no longer typing. */
export function clearTyping(scopeId: ID, userId: ID) {
  if (useTypingStore.getState().typing[scopeId]?.[userId]) setTyping(scopeId, userId, null);
}

/** Listens for typing in one chat while it is open. */
export function useTypingChannel(scopeId: ID | null, isDM: boolean) {
  useEffect(() => {
    if (!CLOUD || !scopeId) return;
    const ch = supabase().channel(topic(scopeId, isDM), { config: { private: true } });
    const owner = store().getState().meId;
    let closed = false;
    ch.on('broadcast', { event: 'typing' }, ({ payload }) => {
      const userId = (payload as { user_id?: ID })?.user_id;
      if (closed || store().getState().meId !== owner || !userId || userId === owner) return;
      setTyping(scopeId, userId, Date.now() + SHOW_MS);
      setTimeout(() => {
        const until = useTypingStore.getState().typing[scopeId]?.[userId];
        if (until && until <= Date.now()) setTyping(scopeId, userId, null);
      }, SHOW_MS + 100);
    });
    ch.subscribe();
    channels.set(scopeId, ch);
    if (isDM) dmScopes.add(scopeId);
    return () => {
      closed = true;
      channels.delete(scopeId); dmScopes.delete(scopeId); lastSent.delete(scopeId);
      useTypingStore.setState(st => { const typing = { ...st.typing }; delete typing[scopeId]; return { typing }; });
      void supabase().removeChannel(ch);
    };
  }, [scopeId, isDM]);
}

/** Tells the others in this chat that I am typing (at most every few seconds). */
export function sendTyping(scopeId: ID) {
  if (!CLOUD) return;
  const ch = channels.get(scopeId);
  const now = Date.now();
  if (!ch || now - (lastSent.get(scopeId) ?? 0) < SEND_EVERY_MS) return;
  lastSent.set(scopeId, now);
  void supabase().rpc('typing_ping', { p_scope: scopeId, p_dm: dmScopes.has(scopeId) }).then(() => {});
}

/** IDs of the people currently typing in a chat. */
export function useTypingUsers(scopeId: ID | null): ID[] {
  const scope = useTypingStore((st) => (scopeId ? st.typing[scopeId] : undefined));
  const now = Date.now();
  return scope
    ? Object.entries(scope)
        .filter(([, until]) => until > now)
        .map(([id]) => id)
    : [];
}
