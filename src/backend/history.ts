/**
 * Older messages. The app first loads the latest messages of every chat;
 * scrolling up fetches the next page until the start of the conversation.
 * The database rules decide what is visible, exactly as for new messages.
 */
import { create } from 'zustand';
import type { ID } from '../types';
import { CLOUD } from './config';
import { store } from './bridge';
import { fetchProfiles, loadChannelMessages } from './load';
import { DELETED_USER_ID, mergeMessages, toUser } from './map';
import { presenceOf } from './presence';

const PAGE = 50;
let generation = 0;
const scopeGeneration = new Map<ID, number>();

/** Per chat: a page is on its way / everything up to the first message is loaded. */
export const useHistory = create<{ loading: Record<ID, boolean>; complete: Record<ID, boolean> }>(() => ({ loading: {}, complete: {} }));

/** After a full reload only the latest messages are in memory again. */
export function resetHistory() {
  generation++;
  scopeGeneration.clear();
  useHistory.setState({ loading: {}, complete: {} });
}

export function resetScopeHistory(id: ID) {
  scopeGeneration.set(id, (scopeGeneration.get(id) ?? 0) + 1);
  useHistory.setState(st => ({ loading: { ...st.loading, [id]: false }, complete: { ...st.complete, [id]: false } }));
}

/** Fetches the page before the oldest loaded message. Returns how many messages were added. */
export async function loadOlder(id: ID): Promise<number> {
  if (!CLOUD) return 0;
  const h = useHistory.getState();
  if (h.loading[id] || h.complete[id]) return 0;
  const s = store().getState();
  const account = s.meId, epoch = generation, scopeEpoch = scopeGeneration.get(id);
  const active = () => epoch === generation && scopeEpoch === scopeGeneration.get(id) && store().getState().meId === account;
  const oldest = s.messages[id]?.[0]?.createdAt;
  useHistory.setState((st) => ({ loading: { ...st.loading, [id]: true } }));
  let added = 0;
  let complete = false;
  try {
    const list = await loadChannelMessages(id, !!s.dms[id], PAGE, oldest);
    if (!active()) return 0;
    // Authors who left (or never shared a server with us) are not loaded yet.
    const missing = [...new Set(list.map((m) => m.authorId))].filter((a) => a !== DELETED_USER_ID && !store().getState().users[a]);
    if (missing.length) {
      const profiles = await fetchProfiles(missing);
      if (!active()) return 0;
      store().setState((st) => {
        for (const p of profiles) {
          st.users[p.id] = toUser(p, p.id === st.meId);
          if (p.id !== st.meId) st.users[p.id].status = presenceOf(p.id);
        }
      });
    }
    const have = new Set((store().getState().messages[id] ?? []).map((m) => m.id));
    const fresh = list.filter((m) => !have.has(m.id));
    if (fresh.length) {
      store().setState((st) => {
        st.messages[id] = mergeMessages(st.messages[id] ?? [], fresh);
      });
    }
    added = fresh.length;
    complete = list.length < PAGE || fresh.length === 0;
  } catch (e) {
    console.warn('[onyx] older messages failed', e);
  }
  if (active()) useHistory.setState((st) => ({ loading: { ...st.loading, [id]: false }, complete: complete ? { ...st.complete, [id]: true } : st.complete }));
  return added;
}
