import {ServerTagPill} from '../profile/ServerTag';
import { useMemo } from 'react';
import { BellOff, Compass, Check, Copy, Palette, Pencil, Plus, UserRound, Users, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import type { DMChannel } from '../../types';
import { useStore } from '../../store/store';
import { useUI, showMainPane, toast } from '../../store/ui';
import { channelUnread, dmOther, dmTitle, scopeMuted, usePendingFriendCount } from '../../store/selectors';
import { muteEntry } from '../notifications/notifyMenus';
import { cn, copyText, plural } from '../../lib/utils';
import { t } from '../../i18n';
import { Avatar } from '../ui/Avatar';
import { IconButton } from '../ui/Button';
import { ContextMenu, type MenuSpec } from '../ui/Menu';
import { GemMark, OnyxServicesLogo } from '../ui/icons';
import { BorderLine } from '../cosmetics/Frames';
import { SectionLabel } from '../ui/misc';
import { SelfPanel } from './SelfPanel';
import { StyledName } from '../cosmetics/StyledName';
import { FEATURES } from '../../config/features';

export function GroupIcon({ dm, size = 32 }: { dm: DMChannel; size?: number }) {
  const users = useStore((s) => s.users);
  const meId = useStore((s) => s.meId);
  const others = dm.participantIds.filter((id) => id !== meId).slice(0, 2);
  if (others.length < 2) return <Avatar user={users[others[0]]} size={size} />;
  const small = Math.round(size * 0.68);
  return (
    <span className="group-stack" style={{ width: size, height: size }}>
      <Avatar user={users[others[0]]} size={small} className="gs-a" />
      <Avatar user={users[others[1]]} size={small} className="gs-b" />
    </span>
  );
}

function dmMenu(dm: DMChannel): MenuSpec {
  const s = useStore.getState();
  const ui = useUI.getState();
  const other = dmOther(s, dm);
  const { unread } = channelUnread(s, dm.id);
  return [
    { label: t('Mark as read'), icon: <Check />, disabled: !unread, onSelect: () => s.markRead(dm.id) },
    { type: 'separator' },
    dm.type === 'dm' && other && { label: t('Profile'), icon: <UserRound />, onSelect: () => ui.openModal({ type: 'profile', userId: other.id }) },
    dm.type === 'group' && {
      label: t('Rename group'),
      icon: <Pencil />,
      onSelect: () =>
        ui.openModal({ type: 'prompt', title: t('Rename group'), label: t('Group name'), initial: dm.name ?? '', maxLength: 40, confirmLabel: t('Save'), onSubmit: (v) => s.renameGroupDM(dm.id, v) }),
    },
    muteEntry(dm.id, 'dm'),
    { type: 'separator' },
    { label: dm.type === 'group' ? t('Hide group') : t('Close DM'), icon: <X />, onSelect: () => s.closeDM(dm.id) },
    { type: 'separator' },
    { label: t('Copy ID'), icon: <Copy />, onSelect: () => copyText(dm.id).then(() => toast({ title: t('ID copied') })) },
  ];
}

function DMRow({ dm }: { dm: DMChannel }) {
  const active = useStore((s) => s.view.kind === 'dm' && s.view.dmId === dm.id);
  const { unread, mentions } = useStore(useShallow((s) => channelUnread(s, dm.id)));
  const muted = useStore((s) => scopeMuted(s, dm.id));
  const title = useStore((s) => dmTitle(s, dm));
  const other = useStore((s) => (dm.type === 'dm' ? dmOther(s, dm) : undefined));
  const { openDM, closeDM } = useStore.getState();
  const sub =
    dm.type === 'group'
      ? plural(dm.participantIds.length, '{count} member', '{count} members')
      : other?.activity && other.status !== 'offline'
        ? other.activity.type === 'streaming'
          ? t('Streaming {name}', { name: other.activity.name })
          : other.activity.type === 'listening'
            ? t('Listening to {name}', { name: other.activity.details ?? other.activity.name })
            : t('Playing {name}', { name: other.activity.name })
        : other?.customStatus
          ? `${other.customStatus.emoji ?? ''} ${other.customStatus.text}`.trim()
          : null;

  return (
    <ContextMenu items={() => dmMenu(dm)}>
      <div
        className={cn('dm-item anim-host', active && 'is-active', unread > 0 && !muted && 'is-unread', muted && 'is-muted')}
        role="button"
        tabIndex={0}
        onClick={() => {
          openDM(dm.id);
          showMainPane();
        }}
        onKeyDown={(e) => e.key === 'Enter' && (openDM(dm.id), showMainPane())}
      >
        {dm.type === 'group' ? <GroupIcon dm={dm} /> : <Avatar user={other} size={32} status={other?.status} />}
        <span className="dm-text">
          <span className="dm-name truncate">
            {dm.type === 'dm' ? <StyledName style={other?.nameStyle}>{title}</StyledName> : title}
            {other && <ServerTagPill userId={other.id} />}{muted && <BellOff className="dm-muted" size={13} aria-label={t('Muted')} />}
          </span>
          {sub && <span className="dm-sub truncate">{sub}</span>}
        </span>
        {mentions > 0 && !active ? (
          <span className="mention-badge">{mentions}</span>
        ) : (
          <IconButton
            label={dm.type === 'group' ? t('Hide group') : t('Close DM')}
            size="sm"
            className="dm-close"
            tooltip={false}
            onClick={(e) => {
              e.stopPropagation();
              closeDM(dm.id);
            }}
          >
            <X />
          </IconButton>
        )}
      </div>
    </ContextMenu>
  );
}

export function HomeSidebar() {
  const view = useStore((s) => s.view);
  const dms = useStore((s) => s.dms);
  const goHome = useStore((s) => s.goHome);
  const pending = usePendingFriendCount();
  const openModal = useUI((s) => s.openModal);
  const openSettings = useUI((s) => s.openSettings);

  const list = useMemo(
    () =>
      Object.values(dms)
        .filter((d) => !d.hidden)
        .sort((a, b) => b.lastActivityAt - a.lastActivityAt),
    [dms],
  );

  const nav = (page: 'friends' | 'plus' | 'shop' | 'discover') => {
    goHome(page);
    showMainPane();
  };
  const isPage = (p: string) => view.kind === 'home' && view.page === p;

  return (
    <aside className="sidebar" aria-label={t('Direct messages')}>
      <div className="sidebar-header home-header">
        <button className="home-search" onClick={() => openModal({ type: 'quickSwitcher' })}>
          {t('Find or start a conversation')}
        </button>
      </div>
      <div className="sidebar-scroll">
        <div className="nav-list">
          <button className={cn('nav-item', isPage('friends') && 'is-active')} onClick={() => nav('friends')}>
            <Users />
            <span className="grow">{t('Friends')}</span>
            {pending > 0 && <span className="mention-badge">{pending}</span>}
          </button>
          <button className={cn('nav-item',isPage('discover')&&'is-active')} onClick={()=>nav('discover')}><Compass/><span className="grow">{t('Discover')}</span></button>
          <button className="nav-item" onClick={() => openSettings({ kind: 'user', section: 'profile' })}>
            <Palette />
            <span className="grow">{t('Customize')}</span>
            <span className="nav-free">{t('Free')}</span>
          </button>
          {FEATURES.onyxPlus && <button className={cn('nav-item', (isPage('plus') || isPage('supporters')) && 'is-active')} onClick={() => nav('plus')}>
            <GemMark size={21} className="nav-gem" />
            <span className="grow">ONYX Plus</span>
          </button>}
          <button aria-label="OnyxServices" className={cn('nav-item nav-item-os', isPage('shop') && 'is-active')} onClick={() => nav('shop')}>
            <BorderLine style={{ avatar: false, card: true, color: '#3b82f6', color2: '#93c5fd', speed: 'slow' }} shape="rect" />
            <OnyxServicesLogo size={22} />
            <span className="grow">OnyxServices</span>
          </button>
        </div>
        <div className="dm-section">
          <SectionLabel>{t('Direct messages')}</SectionLabel>
          <IconButton label={t('Create DM')} size="sm" onClick={() => openModal({ type: 'newDM' })}>
            <Plus />
          </IconButton>
        </div>
        {list.length === 0 && (
          <div className="sidebar-empty">
            {t('No conversations yet.')}
            <button className="btn btn-link" style={{ display: 'block', margin: '8px auto 0' }} onClick={() => openModal({ type: 'newDM' })}>
              {t('Start a direct message')}
            </button>
          </div>
        )}
        {list.map((dm) => (
          <DMRow key={dm.id} dm={dm} />
        ))}
      </div>
      <SelfPanel />
    </aside>
  );
}
