import { useMemo } from 'react';
import { Search, X } from 'lucide-react';
import type { ID, Message } from '../../types';
import { useStore } from '../../store/store';
import { canSee, can } from '../../store/selectors';
import { useUI, showMainPane } from '../../store/ui';
import { tn, tx, t } from '../../i18n';
import { IconButton } from '../ui/Button';
import { EmptyArt, EmptyState } from '../ui/misc';
import { ChannelIcon } from '../ui/icons';
import { MessagePreviewCard } from './PinnedList';
import { plainPreview } from './MessageContent';

export function SearchPanel({ scope }: { scope: ID }) {
  const query = useUI((s) => s.search?.query ?? '');
  const setSearch = useUI((s) => s.setSearch);
  const messages = useStore((s) => s.messages);
  const channels = useStore((s) => s.channels);
  const users = useStore((s) => s.users);
  const isServer = useStore((s) => !!s.servers[scope]);

  const results = useMemo(() => {
    let q = query.toLowerCase();
    let from: string | null = null;
    const fm = q.match(/from:(\S+)/);
    if (fm) {
      from = fm[1].replace('@', '');
      q = q.replace(fm[0], '').trim();
    }
    const state = useStore.getState();
    const channelIds = isServer
      ? Object.values(channels)
          .filter((c) => c.serverId === scope && c.type !== 'voice' && canSee(state, c.id) && can(state, c.id, 'readHistory'))
          .map((c) => c.id)
      : [scope];
    const out: Message[] = [];
    channelIds.forEach((cid) =>
      (messages[cid] ?? []).forEach((m) => {
        if (m.type !== 'default') return;
        const author = users[m.authorId];
        if (from && !(author?.username.toLowerCase().includes(from) || author?.displayName.toLowerCase().includes(from))) return;
        const hay = `${plainPreview(m.content)} ${m.embeds.map((e) => `${e.title ?? ''} ${e.description ?? ''}`).join(' ')} ${m.attachments.map((a) => a.name).join(' ')}`.toLowerCase();
        if (!q || hay.includes(q)) out.push(m);
      }),
    );
    return out.sort((a, b) => b.createdAt - a.createdAt).slice(0, 50);
  }, [query, messages, channels, users, scope, isServer]);

  const jump = (m: Message) => {
    const c = channels[m.channelId];
    const s = useStore.getState();
    if (c) s.selectChannel(c.serverId, c.id);
    showMainPane();
    window.setTimeout(() => useUI.getState().flash(m.id), 80);
  };

  return (
    <aside className="search-panel" aria-label={t('Search results')}>
      <div className="search-panel-head">
        <Search size={16} />
        <span className="grow truncate">{tn(results.length, '{count} result for “{query}”', '{count} results for “{query}”', { query })}</span>
        <IconButton label={t('Close search')} size="sm" onClick={() => setSearch(null)}>
          <X />
        </IconButton>
      </div>
      <div className="search-tip">{tx('Tip: {code} filters by sender.', { code: <code>from:nova</code> })}</div>
      <div className="search-results">
        {results.length === 0 ? (
          <EmptyState compact art={<EmptyArt icon={<Search />} />} title={t('No results')} body={t('Try another term or remove filters.')} />
        ) : (
          results.map((m) => {
            const c = channels[m.channelId];
            return (
              <button key={m.id} className="search-result" onClick={() => jump(m)}>
                {c && (
                  <span className="search-result-where">
                    <ChannelIcon type={c.type} size={14} />
                    {c.name}
                  </span>
                )}
                <MessagePreviewCard m={m} serverId={c?.serverId ?? null} />
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
