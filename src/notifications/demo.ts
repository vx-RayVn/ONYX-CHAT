/**
 * Demo only: a sample user "writes" a message so notifications, sounds and
 * counters can be tried without a second account. Clearly offered as a
 * simulation in the notification settings; cloud mode never uses this.
 */
import type { ID, Message } from '../types';
import { useStore } from '../store/store';
import { notifyContext } from '../store/selectors';
import { uid } from '../lib/utils';
import { t, tk } from '../i18n';
import { handleIncoming } from './notifier';

export type DemoKind = 'message' | 'mention' | 'dm';

const LINES = [tk('Anyone up for a round later?'), tk('Just posted the new clips – have a look 🎬'), tk('gg, that was close!'), tk('Who’s joining voice tonight?')];

function line() {
  return t(LINES[Math.floor(Math.random() * LINES.length)]);
}

/** Where a simulated message would go (null when there is no suitable chat). */
export function demoTarget(kind: DemoKind): { scopeId: ID; authorId: ID; label: string } | null {
  const s = useStore.getState();
  const usable = (id: ID | undefined) => !!id && id !== s.meId && !!s.users[id] && !s.users[id].bot && s.relationships[id]?.type !== 'blocked';
  if (kind === 'dm') {
    const dm = Object.values(s.dms)
      .filter((d) => d.type === 'dm' && usable(d.participantIds.find((p) => p !== s.meId)))
      .sort((a, b) => b.lastActivityAt - a.lastActivityAt)[0];
    if (!dm) return null;
    const authorId = dm.participantIds.find((p) => p !== s.meId)!;
    return { scopeId: dm.id, authorId, label: s.users[authorId].displayName };
  }
  // Preferably not the chat that is open, so the counters show it too.
  const open = s.view.kind === 'server' ? s.view.channelId : null;
  for (const serverId of s.serverOrder) {
    const server = s.servers[serverId];
    if (!server) continue;
    const channel = Object.values(s.channels)
      .filter((c) => c.serverId === serverId && c.type === 'text' && notifyContext(s, c.id)?.canView)
      .sort((a, b) => Number(a.id === open) - Number(b.id === open) || a.position - b.position)[0];
    const authorId = Object.keys(server.members).find(usable);
    if (channel && authorId) return { scopeId: channel.id, authorId, label: `#${channel.name} · ${server.name}` };
  }
  return null;
}

/** Adds a message from a sample user and runs it through the notification path. */
export function simulateIncoming(kind: DemoKind): boolean {
  const target = demoTarget(kind);
  if (!target) return false;
  const s = useStore.getState();
  const content = kind === 'mention' ? `<@${s.meId}> ${line()}` : line();
  const msg: Message = { id: uid('m_'), channelId: target.scopeId, authorId: target.authorId, type: 'default', content, createdAt: Date.now(), reactions: [], attachments: [], embeds: [] };
  useStore.setState((st) => {
    (st.messages[target.scopeId] ??= []).push(msg);
    const dm = st.dms[target.scopeId];
    if (dm) {
      dm.lastActivityAt = msg.createdAt;
      dm.hidden = false;
    }
  });
  handleIncoming(target.scopeId, msg.id);
  return true;
}
