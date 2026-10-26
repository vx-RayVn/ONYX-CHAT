import {ServerTagPill} from '../profile/ServerTag';
import {useLiveActivity} from '../../backend/activity';
import { HeaderTools } from '../layout/HeaderTools';
import { CLOUD } from '../../backend/config';
import { useMemo, useState } from 'react';
import { ArrowLeft, AtSign, Check, Copy, Ellipsis, MessageCircle, Search, UserPlus, Users, X, Volume2, Ban } from 'lucide-react';
import type { Relationship, User } from '../../types';
import { useStore } from '../../store/store';
import { showMainPane, showNavPane, toast } from '../../store/ui';
import { useMe, usePendingFriendCount } from '../../store/selectors';
import { cn, copyText, formatElapsed, hashString } from '../../lib/utils';
import { locale, t, tn } from '../../i18n';
import { StyledName } from '../cosmetics/StyledName';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { Avatar } from '../ui/Avatar';
import { Button, IconButton } from '../ui/Button';
import { Dropdown } from '../ui/Menu';
import { EmptyArt, EmptyState, SectionLabel } from '../ui/misc';
import { statusLabel } from '../ui/icons';
import { userMenu } from '../profile/userMenu';
import { activityLine } from '../chat/MemberList';
import { UserPopover } from '../profile/UserPopover';
import { ServerIcon } from '../layout/ServerRail';

type Tab = 'online' | 'all' | 'pending' | 'blocked' | 'add';

function FriendRow({ user, rel }: { user: User; rel: Relationship }) {
  useLiveActivity(user.id);
  const { openDMWithUser, acceptFriend, removeRelationship } = useStore.getState();
  const line = activityLine(user);
  const message = () => {
    openDMWithUser(user.id);
    showMainPane();
  };
  const sub = rel.type === 'incoming' ? t('Incoming friend request') : rel.type === 'outgoing' ? t('Outgoing friend request') : rel.type === 'blocked' ? t('Blocked') : null;
  return (
    <div className="friend-row anim-host" role="button" tabIndex={0} onClick={rel.type === 'friend' ? message : undefined} onKeyDown={(e) => e.key === 'Enter' && rel.type === 'friend' && message()}>
      <UserPopover userId={user.id} side="right" align="start">
        <button className="friend-avatar" onClick={(e) => e.stopPropagation()} aria-label={t('Profile of {name}', { name: user.displayName })}>
          <Avatar user={user} size={36} status={rel.type === 'friend' ? user.status : undefined} frame />
        </button>
      </UserPopover>
      <div className="friend-text">
        <div className="friend-name">
          <strong className="truncate">
            <StyledName style={user.nameStyle}>{user.displayName}</StyledName><ServerTagPill userId={user.id}/>
          </strong>
          <span className="friend-username truncate">{user.username}</span>
        </div>
        <div className="friend-sub truncate">{sub ?? (line ? line.text : statusLabel(user.status))}</div>
      </div>
      <div className="friend-actions" onClick={(e) => e.stopPropagation()}>
        {rel.type === 'friend' && (
          <>
            <IconButton label={t('Message')} className="round-btn" onClick={message}>
              <MessageCircle />
            </IconButton>
            <Dropdown
              align="end"
              items={userMenu(user.id)}
              trigger={
                <button className="icon-btn round-btn" aria-label={t('More options')}>
                  <Ellipsis />
                </button>
              }
            />
          </>
        )}
        {rel.type === 'incoming' && (
          <>
            <IconButton label={t('Accept')} className="round-btn is-accept" onClick={() => acceptFriend(user.id)}>
              <Check />
            </IconButton>
            <IconButton label={t('Decline')} className="round-btn is-decline" onClick={() => removeRelationship(user.id)}>
              <X />
            </IconButton>
          </>
        )}
        {rel.type === 'outgoing' && (
          <IconButton label={t('Cancel request')} className="round-btn is-decline" onClick={() => removeRelationship(user.id)}>
            <X />
          </IconButton>
        )}
        {rel.type === 'blocked' && (
          <Button variant="secondary" size="sm" onClick={() => removeRelationship(user.id)}>
            {t('Unblock')}
          </Button>
        )}
      </div>
    </div>
  );
}

function AddFriend() {
  const [value, setValue] = useState('');
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const send = useStore((s) => s.sendFriendRequest);
  const [busy, setBusy] = useState(false);
  const me = useMe();
  return (
    <div className="add-friend">
      <h2>{t('Add friend')}</h2>
      <p>{t('You can add friends with their ONYX username.')}</p>
      <form
        className={cn('add-friend-form', result && (result.ok ? 'is-ok' : 'is-error'))}
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          const r = await send(value);
          setBusy(false);
          setResult(r);
          if (r.ok) setValue('');
        }}
      >
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setResult(null);
          }}
          placeholder={CLOUD ? t('Enter a username') : t('Enter a username, e.g. frostbyte')}
          aria-label={t('Username')}
          autoFocus
          maxLength={32}
        />
        <Button type="submit" disabled={!value.trim()} loading={busy}>
          {t('Send request')}
        </Button>
      </form>
      {result && <div className={cn('add-friend-result', result.ok ? 'is-ok' : 'is-error')}>{result.message}</div>}
      <div className="add-friend-more">
        <SectionLabel>{t('Your username')}</SectionLabel>
        <button className="share-teaser" onClick={() => copyText(me.username).then(() => toast({ title: t('Username copied') }))}>
          <span className="share-teaser-icon">
            <AtSign />
          </span>
          <span className="grow">
            <strong>{me.username}</strong>
            <span>{t('Share it so friends can add you.')}</span>
          </span>
          <Copy size={16} />
        </button>
      </div>
    </div>
  );
}

function ActiveNow() {
  const relationships = useStore((s) => s.relationships);
  const users = useStore((s) => s.users);
  const voice = useStore((s) => s.voice);
  const channels = useStore((s) => s.channels);
  const servers = useStore((s) => s.servers);
  const { joinVoice, selectChannel, openDMWithUser } = useStore.getState();

  const items = useMemo(() => {
    const friends = Object.values(relationships)
      .filter((r) => r.type === 'friend')
      .map((r) => users[r.userId])
      .filter((u) => u && u.status !== 'offline');
    return friends
      .map((u) => {
        const vc = Object.entries(voice).find(([, list]) => list.some((p) => p.userId === u.id));
        return { user: u, voiceChannelId: vc?.[0] };
      })
      .filter((x) => x.user.activity || x.voiceChannelId)
      .slice(0, 6);
  }, [relationships, users, voice]);

  return (
    <aside className="active-now">
      <h2>{t('Active now')}</h2>
      {items.length === 0 ? (
        <div className="active-empty">
          <strong>{t('It’s quiet for now …')}</strong>
          <span>{t('When friends are playing or in a voice channel, you’ll see it here.')}</span>
        </div>
      ) : (
        items.map(({ user, voiceChannelId }) => {
          const vc = voiceChannelId ? channels[voiceChannelId] : undefined;
          const server = vc ? servers[vc.serverId] : undefined;
          const a = user.activity;
          const hue = hashString(a?.name ?? 'x') % 360;
          return (
            <div key={user.id} className="active-card anim-host">
              <button className="active-head" onClick={() => (openDMWithUser(user.id), showMainPane())}>
                <Avatar user={user} size={36} status={user.status} />
                <span className="active-head-text">
                  <strong className="truncate">{user.displayName}</strong>
                  <span className="truncate">
                    {a
                      ? a.type === 'streaming'
                        ? t('Streaming {name}', { name: a.name })
                        : a.type === 'listening'
                          ? t('Listening to {name}', {
                              name: a.details ?? a.name,
                            })
                          : a.type === 'watching'
                            ? t('Watching {name}', { name: a.name })
                            : t('Playing {name}', { name: a.name })
                      : t('In a voice channel')}
                    {a?.since ? ` · ${formatElapsed(a.since)}` : ''}
                  </span>
                </span>
                {a && (
                  <span
                    className="active-art"
                    style={{
                      background: `linear-gradient(140deg, hsl(${hue} 70% 55%), hsl(${(hue + 40) % 360} 70% 28%))`,
                    }}
                  >
                    {a.name.slice(0, 1)}
                  </span>
                )}
              </button>
              {vc && server && (
                <div className="active-voice">
                  <ServerIcon server={server} size={20} />
                  <span className="truncate">
                    <Volume2 size={13} /> {vc.name}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      joinVoice(vc.id);
                      selectChannel(vc.serverId, vc.id);
                      showMainPane();
                    }}
                  >
                    {t('Join')}
                  </Button>
                </div>
              )}
            </div>
          );
        })
      )}
    </aside>
  );
}

export function FriendsView() {
  const [tab, setTab] = useState<Tab>('online');
  const [query, setQuery] = useState('');
  const relationships = useStore((s) => s.relationships);
  const users = useStore((s) => s.users);
  const pending = usePendingFriendCount();
  const wide = useMediaQuery('(min-width: 1180px)');

  const list = useMemo(() => {
    const rels = Object.values(relationships).filter((r) => {
      if (tab === 'online') return r.type === 'friend' && users[r.userId]?.status !== 'offline';
      if (tab === 'all') return r.type === 'friend';
      if (tab === 'pending') return r.type === 'incoming' || r.type === 'outgoing';
      if (tab === 'blocked') return r.type === 'blocked';
      return false;
    });
    const q = query.toLowerCase();
    return rels
      .map((r) => ({ rel: r, user: users[r.userId] }))
      .filter((x) => x.user && (!q || x.user.displayName.toLowerCase().includes(q) || x.user.username.toLowerCase().includes(q)))
      .sort((a, b) => (a.rel.type === 'incoming' ? -1 : 0) - (b.rel.type === 'incoming' ? -1 : 0) || a.user.displayName.localeCompare(b.user.displayName, locale()));
  }, [relationships, users, tab, query]);

  const labels: Record<Exclude<Tab, 'add'>, string> = {
    online: t('Online'),
    all: t('All friends'),
    pending: t('Pending'),
    blocked: t('Blocked'),
  };

  const empty: Record<Exclude<Tab, 'add'>, { title: string; body: string; icon: React.ReactNode }> = {
    online: {
      title: t('Nobody is online right now'),
      body: t('As soon as your friends are online, they appear here.'),
      icon: <Users />,
    },
    all: {
      title: t('No friends yet'),
      body: t('Add friends with their username.'),
      icon: <UserPlus />,
    },
    pending: {
      title: t('No pending requests'),
      body: t('Incoming and sent friend requests appear here.'),
      icon: <UserPlus />,
    },
    blocked: {
      title: t('Nobody blocked'),
      body: t('Blocked users can’t message you. You can undo this at any time.'),
      icon: <Ban />,
    },
  };

  return (
    <div className="friends-view">
      <header className="view-header">
        <IconButton label={t('Back')} className="mobile-only mobile-back" onClick={showNavPane} tooltip={false}>
          <ArrowLeft />
        </IconButton>
        <div className="view-header-title">
          <Users size={22} className="vh-icon" />
          <h1>{t('Friends')}</h1>
        </div>
        <span className="view-header-divider" />
        <nav className="tabs scroll-thin" aria-label={t('Filter friends list')}>
          {(['online', 'all', 'pending', 'blocked'] as const).map((id) => (
            <button key={id} className={cn('tab', tab === id && 'is-active')} onClick={() => setTab(id)}>
              {id === 'all' ? t('All') : labels[id]}
              {id === 'pending' && pending > 0 && <span className="mention-badge">{pending}</span>}
            </button>
          ))}
        </nav>
        <button aria-label={t('Add friend')} className={cn('tab tab-accent friends-add-action',tab==='add'&&'is-active')} onClick={()=>setTab('add')}><UserPlus size={18}/><span>{t('Add friend')}</span></button>
        <HeaderTools />
      </header>
      <div className="view-body">
        <div className="friends-main">
          {tab === 'add' ? (
            <AddFriend />
          ) : (
            <>
              <div className="friends-search">
                <Search size={16} />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Search')} aria-label={t('Search friends')} />
                {query && (
                  <button onClick={() => setQuery('')} aria-label={t('Clear search')}>
                    <X size={14} />
                  </button>
                )}
              </div>
              {list.length > 0 && (
                <SectionLabel className="friends-count">
                  {labels[tab]} — {list.length}
                </SectionLabel>
              )}
              <div className="friends-list">
                {list.length === 0 ? (
                  <EmptyState
                    art={<EmptyArt icon={empty[tab].icon} />}
                    title={query ? t('No results') : empty[tab].title}
                    body={query ? t('Nobody matches “{query}”.', { query }) : empty[tab].body}
                    action={
                      !query &&
                      tab !== 'blocked' && (
                        <Button variant="secondary" onClick={() => setTab('add')} icon={<UserPlus />}>
                          {t('Add friend')}
                        </Button>
                      )
                    }
                  />
                ) : (
                  list.map(({ rel, user }) => <FriendRow key={user.id} user={user} rel={rel} />)
                )}
              </div>
              {tab === 'pending' && list.length > 0 && (
                <div className="friends-foot">{tn(list.filter((x) => x.rel.type === 'incoming').length, '{count} incoming request', '{count} incoming requests')}</div>
              )}
            </>
          )}
        </div>
        {wide && <ActiveNow />}
      </div>
    </div>
  );
}
