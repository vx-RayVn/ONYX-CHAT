/** Server icons only need a boolean, never the identities in private channels.
 * Invalidation broadcasts contain no counts; the invoker RPC applies voice RLS.
 */
import { create } from 'zustand';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './client';

export const useVoiceActivity = create<{ active: Record<string, boolean> }>(() => ({ active: {} }));
const topics = new Map<string, RealtimeChannel>();
let generation = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let request = 0;

async function refresh() {
  const seq = ++request, epoch = generation;
  const { data, error } = await supabase().rpc('voice_server_activity');
  if (error || epoch !== generation || seq !== request) return;
  const active: Record<string, boolean> = {};
  for (const row of (data ?? []) as { server_id: string }[]) active[row.server_id] = true;
  useVoiceActivity.setState({ active });
}

export function refreshVoiceActivity() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; void refresh(); }, 150);
}

export function watchVoiceActivity(servers: string[]) {
  const wanted = new Set(servers);
  for (const [id, ch] of topics) if (!wanted.has(id)) { topics.delete(id); void supabase().removeChannel(ch); }
  for (const id of wanted) {
    if (topics.has(id)) continue;
    const ch = supabase().channel(`voice-activity:${id}`, { config: { private: true } });
    ch.on('broadcast', { event: 'refresh' }, () => { if (topics.get(id) === ch) refreshVoiceActivity(); });
    topics.set(id, ch);
    ch.subscribe((status) => { if (status === 'SUBSCRIBED' && topics.get(id) === ch) refreshVoiceActivity(); });
  }
  refreshVoiceActivity();
}

export function unwatchVoiceActivity() {
  generation++;
  if (timer) clearTimeout(timer);
  timer = null;
  for (const ch of topics.values()) void supabase().removeChannel(ch);
  topics.clear();
  useVoiceActivity.setState({ active: {} });
}
