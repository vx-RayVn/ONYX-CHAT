import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, Check, History } from 'lucide-react';
import type { ID, Message } from '../../types';
import { useStore } from '../../store/store';
import { can } from '../../store/selectors';
import { useUI } from '../../store/ui';
import { MINUTE, cn, formatClock, formatDayDivider, isSameDay } from '../../lib/utils';
import { t, tn } from '../../i18n';
import { CLOUD } from '../../backend/config';
import { loadOlder, useHistory } from '../../backend/history';
import { Spinner } from '../ui/misc';
import { MessageItem } from './MessageItem';
import { ChannelWelcome } from './ChannelWelcome';

const EMPTY: Message[] = [];
/** Older messages are fetched once the top of the list is this close. */
const LOAD_OLDER_PX = 600;

type Row =
  { kind: 'day'; ts: number; key: string } | { kind: 'new'; key: string } | { kind: 'blocked'; count: number; key: string; ids: ID[] } | { kind: 'msg'; m: Message; grouped: boolean; key: string };

export function MessageList({ channelId, serverId }: { channelId: ID; serverId: ID | null }) {
  const all = useStore((s) => s.messages[channelId] ?? EMPTY);
  // Without "Read message history" only messages sent after opening the channel are shown.
  const history = useStore((s) => can(s, channelId, 'readHistory'));
  const [openedAt] = useState(() => Date.now());
  const messages = useMemo(() => (history ? all : all.filter((m) => m.createdAt >= openedAt)), [all, history, openedAt]);
  const meId = useStore((s) => s.meId);
  const relationships = useStore((s) => s.relationships);
  const compact = useStore((s) => s.settings.density === 'compact');
  const markRead = useStore((s) => s.markRead);
  const highlight = useUI((s) => s.highlight);
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const [revealed, setRevealed] = useState<Set<ID>>(new Set());
  // Cloud: only the latest messages are loaded at first, older ones follow when scrolling up.
  const complete = useHistory((h) => !CLOUD || !!h.complete[channelId]);
  const loadingOlder = useHistory((h) => !!h.loading[channelId]);
  const anchor = useRef<{ height: number; top: number } | null>(null);

  // Unread marker: where the user left off when opening the channel.
  const [unreadAt, setUnreadAt] = useState<number | null>(() => {
    const s = useStore.getState();
    const read = s.readState[channelId] ?? 0;
    const list = s.messages[channelId] ?? [];
    return list.some((m) => m.createdAt > read && m.authorId !== s.meId) ? read : null;
  });
  const unreadCount = useMemo(() => (unreadAt ? messages.filter((m) => m.createdAt > unreadAt && m.authorId !== meId).length : 0), [messages, unreadAt, meId]);
  const unreadSince = useMemo(() => messages.find((m) => unreadAt && m.createdAt > unreadAt && m.authorId !== meId)?.createdAt, [messages, unreadAt, meId]);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Clear the marker once the user sends something.
  const lastMine = messages.length && messages[messages.length - 1].authorId === meId ? messages[messages.length - 1].id : null;
  useEffect(() => {
    if (lastMine && unreadAt && messages[messages.length - 1].createdAt > Date.now() - 2000) setUnreadAt(null);
  }, [lastMine]);

  const rows = useMemo(() => {
    const out: Row[] = [];
    let prev: Message | undefined;
    let newInserted = false;
    let blockedRun: (Row & { kind: 'blocked' }) | null = null;
    for (const m of messages) {
      const blocked = relationships[m.authorId]?.type === 'blocked' && !revealed.has(m.id);
      if (!prev || !isSameDay(prev.createdAt, m.createdAt)) {
        out.push({ kind: 'day', ts: m.createdAt, key: `d${m.id}` });
        prev = undefined;
        blockedRun = null;
      }
      let dividerHere = false;
      if (unreadAt && !newInserted && m.createdAt > unreadAt && m.authorId !== meId) {
        out.push({ kind: 'new', key: 'new' });
        newInserted = true;
        dividerHere = true;
        blockedRun = null;
      }
      if (blocked) {
        if (blockedRun) {
          blockedRun.count++;
          blockedRun.ids.push(m.id);
        } else {
          blockedRun = { kind: 'blocked', count: 1, key: `b${m.id}`, ids: [m.id] };
          out.push(blockedRun);
        }
        prev = undefined;
        continue;
      }
      blockedRun = null;
      const grouped = !!prev && !dividerHere && prev.authorId === m.authorId && prev.type === 'default' && m.type === 'default' && !m.replyToId && m.createdAt - prev.createdAt < 7 * MINUTE;
      out.push({ kind: 'msg', m, grouped, key: m.id });
      prev = m;
    }
    return out;
  }, [messages, unreadAt, meId, relationships, revealed]);

  const scrollToBottom = (smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  };

  // Initial position: unread divider (if far up) or bottom.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const divider = el.querySelector('.divider-new') as HTMLElement | null;
    if (divider && divider.offsetTop < el.scrollHeight - el.clientHeight - 40) {
      el.scrollTop = Math.max(0, divider.offsetTop - 80);
      atBottom.current = false;
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  // Stick to bottom when new content arrives (incl. images loading).
  useLayoutEffect(() => {
    if (atBottom.current) scrollToBottom();
  }, [rows.length]);

  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    const ro = new ResizeObserver(() => {
      if (atBottom.current) scrollToBottom();
    });
    ro.observe(inner);
    if(scrollRef.current)ro.observe(scrollRef.current);
    return () => ro.disconnect();
  }, []);

  // Own messages always scroll into view.
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last && last.authorId === meId && Date.now() - last.createdAt < 1500) {
      atBottom.current = true;
      scrollToBottom(true);
    }
  }, [messages, meId]);

  // Read state follows what is visible (not while the settings cover the chat – closing them marks it read).
  useEffect(() => {
    if (document.visibilityState === 'visible' && !useUI.getState().settings) markRead(channelId);
  }, [channelId, messages.length, markRead]);

  // Jump to highlighted message.
  useEffect(() => {
    if (!highlight) return;
    const el = scrollRef.current?.querySelector(`[data-mid="${highlight}"]`) as HTMLElement | null;
    if (el) {
      atBottom.current = false;
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [highlight]);

  const maybeLoadOlder = () => {
    const el = scrollRef.current;
    if (!el || complete || loadingOlder || !history || el.scrollTop > LOAD_OLDER_PX) return;
    anchor.current = { height: el.scrollHeight, top: el.scrollTop };
    void loadOlder(channelId).then((added) => {
      if (!added) anchor.current = null;
    });
  };

  // Older messages were added above: keep what the user is looking at in place.
  const firstId = messages[0]?.id;
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const a = anchor.current;
    if (!el || !a) return;
    anchor.current = null;
    if (!atBottom.current) el.scrollTop = a.top + (el.scrollHeight - a.height);
  }, [firstId]);

  // Short chats show their top right away – fetch until the start (or the screen is full).
  useEffect(() => {
    maybeLoadOlder();
  }, [channelId, messages.length, complete, loadingOlder, history]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    atBottom.current = dist < 48;
    setShowJump(dist > 500);
    maybeLoadOlder();
  };

  return (
    <div className="msg-list-wrap">
      {unreadAt && unreadCount > 0 && !bannerDismissed && (
        <div className="unread-banner">
          <button className="unread-banner-text" onClick={() => (scrollRef.current?.querySelector('.divider-new') as HTMLElement | null)?.scrollIntoView({ block: 'center', behavior: 'smooth' })}>
            {tn(unreadCount, '{count} new message since {time}', '{count} new messages since {time}', { time: unreadSince ? formatClock(unreadSince) : '' })}
          </button>
          <button
            className="unread-banner-action"
            onClick={() => {
              setBannerDismissed(true);
              markRead(channelId);
            }}
          >
            {t('Mark as read')}
            <Check size={14} />
          </button>
        </div>
      )}
      <div className="msg-scroll" ref={scrollRef} onScroll={onScroll} role="log" aria-live="polite" aria-label={t('Messages')}>
        <div className="msg-inner" ref={innerRef}>
          {history ? (
            complete ? (
              <ChannelWelcome channelId={channelId} />
            ) : (
              <div className="history-loading" aria-busy={loadingOlder}>
                <Spinner size={16} />
                <span>{t('Loading …')}</span>
              </div>
            )
          ) : (
            <div className="no-history">
              <History size={20} />
              <div>
                <strong>{t('Older messages are hidden')}</strong>
                <span>{t('You don’t have “Read message history” in this channel. You see messages that are sent while you’re here.')}</span>
              </div>
            </div>
          )}
          {rows.map((r) => {
            switch (r.kind) {
              case 'day':
                return (
                  <div key={r.key} className="divider-day" role="separator">
                    <span>{formatDayDivider(r.ts)}</span>
                  </div>
                );
              case 'new':
                return (
                  <div key={r.key} className="divider-new" role="separator">
                    <span>{t('New')}</span>
                  </div>
                );
              case 'blocked':
                return (
                  <div key={r.key} className="msg-blocked">
                    {tn(r.count, '{count} blocked message', '{count} blocked messages')} · <button onClick={() => setRevealed((s) => new Set([...s, ...r.ids]))}>{t('Show')}</button>
                  </div>
                );
              default:
                return (
                  <Fragment key={r.key}>
                    <MessageItem message={r.m} grouped={r.grouped} serverId={serverId} compact={compact} />
                  </Fragment>
                );
            }
          })}
          <div className="msg-bottom-spacer" />
        </div>
      </div>
      <button className={cn('jump-present', showJump && 'is-visible')} onClick={() => scrollToBottom(true)} tabIndex={showJump ? 0 : -1}>
        {t('Jump to latest messages')}
        <ArrowDown size={15} />
      </button>
    </div>
  );
}
