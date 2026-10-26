import {BotCommands} from './BotCommands';
import { HeaderTools } from '../layout/HeaderTools';
import { useState, type DragEvent, type ReactNode } from 'react';
import { Popover } from 'radix-ui';
import { ArrowLeft, CircleUserRound, Phone, Pin, Search, UserPlus, Users, Video, X, Upload } from 'lucide-react';
import type { ID } from '../../types';
import { useStore } from '../../store/store';
import { useUI, showNavPane } from '../../store/ui';
import { dmOther, dmTitle } from '../../store/selectors';
import { isPrivateChannel } from '../../lib/permissions';
import { cn } from '../../lib/utils';
import { useIsMobile, useMediaQuery } from '../../hooks/useMediaQuery';
import { ChannelIcon, StatusGlyph, statusLabel } from '../ui/icons';
import { t } from '../../i18n';
import { IconButton } from '../ui/Button';
import { Tooltip } from '../ui/Tooltip';
import { Avatar } from '../ui/Avatar';
import { MessageList } from './MessageList';
import { Composer, addFiles } from './Composer';
import { MemberList } from './MemberList';
import { PinnedList } from './PinnedList';
import { SearchPanel } from './SearchPanel';
import { DMProfilePanel } from '../profile/DMProfilePanel';
import { CallPanel } from '../voice/CallPanel';
import { GroupIcon } from '../layout/HomeSidebar';
import { BRAND } from '../../config/brand';
import { NotifyBell } from '../notifications/NotifyBits';
import { CLOUD } from '../../backend/config';

function HeaderSearch({ scope }: { scope: ID }) {
  const search = useUI((s) => (s.search?.scope === scope ? s.search : null));
  const setSearch = useUI((s) => s.setSearch);
  const [value, setValue] = useState(search?.query ?? '');
  return (
    <form
      className={cn('header-search', value && 'has-value')}
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) setSearch({ scope, query: value.trim() });
      }}
    >
      <Search />
      <input
        value={value}
        placeholder={t('Search')}
        aria-label={t('Search messages')}
        onChange={(e) => {
          setValue(e.target.value);
          if (e.target.value.trim().length >= 2) setSearch({ scope, query: e.target.value.trim() });
          else if (!e.target.value) setSearch(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setValue('');
            setSearch(null);
          }
        }}
      />
      {value && (
        <IconButton
          label={t('Clear search')}
          size="sm"
          className="clear"
          tooltip={false}
          onClick={() => {
            setValue('');
            setSearch(null);
          }}
        >
          <X />
        </IconButton>
      )}
    </form>
  );
}

function PinsButton({ channelId }: { channelId: ID }) {
  const count = useStore((s) => s.messages[channelId]?.filter((m) => m.pinned).length ?? 0);
  return (
    <Popover.Root>
      <Tooltip content={t('Pinned messages')} side="bottom">
        <Popover.Trigger asChild>
          <button className="icon-btn has-dot-wrap" aria-label={t('Pinned messages')}>
            <Pin />
            {count > 0 && <span className="icon-dot">{count}</span>}
          </button>
        </Popover.Trigger>
      </Tooltip>
      <Popover.Portal>
        <Popover.Content className="popover pins-pop" align="end" sideOffset={8} collisionPadding={12}>
          <PinnedList channelId={channelId} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function MobileBack() {
  return (
    <IconButton label={t('Back to navigation')} className="mobile-only mobile-back" onClick={showNavPane} tooltip={false}>
      <ArrowLeft />
    </IconButton>
  );
}

function ServerHeader({ channelId }: { channelId: ID }) {
  const channel = useStore((s) => s.channels[channelId]);
  const locked = useStore((s) => (channel && s.servers[channel.serverId] ? isPrivateChannel(s.servers[channel.serverId], channel) : false));
  const membersOpen = useStore((s) => s.memberListOpen);
  const { toggleMemberList } = useStore.getState();
  const isMobile = useMediaQuery('(max-width: 1099px)');
  const mobileMembers = useUI((s) => s.mobileMembers);
  if (!channel) return null;
  return (
    <header className="view-header">
      <MobileBack />
      <div className="view-header-title">
        <ChannelIcon type={channel.type} isPrivate={locked} size={22} />
        <h1 className="truncate">{channel.name}</h1>
      </div>
      {channel.topic && (
        <>
          <span className="view-header-divider hide-sm" />
          <button className="view-header-topic truncate hide-sm" onClick={() => useUI.getState().openModal({ type: 'preview', title: `#${channel.name}`, body: channel.topic!, icon: 'link' })}>
            {channel.topic}
          </button>
        </>
      )}
      <HeaderTools>
        <PinsButton channelId={channelId} />
        <NotifyBell scopeId={channelId} kind="channel" className="hide-sm" />
        <IconButton
          label={membersOpen ? t('Hide member list') : t('Show member list')}
          tooltipSide="bottom"
          active={isMobile ? mobileMembers : membersOpen}
          onClick={() => (isMobile ? useUI.getState().setMobileMembers(!mobileMembers) : toggleMemberList())}
        >
          <Users />
        </IconButton>
        <HeaderSearch scope={channel.serverId} />
      </HeaderTools>
      </header>
  );
}

function DMHeader({ dmId }: { dmId: ID }) {
  const compact = useIsMobile();
  const dm = useStore((s) => s.dms[dmId]);
  const other = useStore((s) => (dm ? dmOther(s, dm) : undefined));
  const title = useStore((s) => (dm ? dmTitle(s, dm) : ''));
  const profileOpen = useStore((s) => s.dmProfileOpen);
  const membersOpen = useStore((s) => s.memberListOpen);
  const inThisCall = useStore((s) => s.call?.dmId === dmId);
  const canCall = useStore((s) => !!dm && (dm.type === 'group' || !dm.participantIds.some((id) => id !== s.meId && s.relationships[id]?.type === 'blocked')));
  const { setDMProfileOpen, toggleMemberList, startCall } = useStore.getState();
  if (!dm) return null;
  const isGroup = dm.type === 'group';
  // Calls need the server; the demo has nobody to call (honest instead of a fake call).
  const callHint = !CLOUD ? t('Calls need an ONYX account') : !canCall ? t('You can’t call in this conversation.') : null;

  return (
    <header className="view-header">
      <MobileBack />
      <div className="view-header-title">
        {isGroup ? <GroupIcon dm={dm} size={26} /> : <Avatar user={other} size={26} status={other?.status} />}
        <h1 className="truncate">{title}</h1>
        {!isGroup && other && other.status !== 'offline' && (
          <Tooltip content={statusLabel(other.status)}>
            <span className="header-status">
              <StatusGlyph status={other.status} size={10} />
            </span>
          </Tooltip>
        )}
      </div>
      <HeaderTools primary={<IconButton label={callHint ?? t('Start voice call')} tooltipSide="bottom" onClick={() => startCall(dmId)} disabled={!!callHint || inThisCall}>
          <Phone />
        </IconButton>}>
        <IconButton label={callHint ?? t('Start video call')} tooltipSide="bottom" onClick={() => startCall(dmId, { video: true })} disabled={!!callHint || inThisCall} className="hide-sm">
          <Video />
        </IconButton>
        <PinsButton channelId={dmId} />
        <NotifyBell scopeId={dmId} kind="dm" className="hide-sm" />
        <IconButton label={isGroup ? t('Add friends to group') : t('Create group')} tooltipSide="bottom" onClick={() => useUI.getState().openModal({ type: 'newDM', addTo: dmId })} className="hide-sm">
          <UserPlus />
        </IconButton>
        {isGroup ? (
          <IconButton label={t('Members')} tooltipSide="bottom" active={membersOpen} onClick={toggleMemberList}>
            <Users />
          </IconButton>
        ) : (
          <IconButton label={compact ? t('Full profile') : profileOpen ? t('Hide profile') : t('Show profile')} tooltipSide="bottom" active={!compact && profileOpen} onClick={() => compact && other ? useUI.getState().openModal({type:'profile',userId:other.id}) : setDMProfileOpen(!profileOpen)} className="hide-sm">
            <CircleUserRound />
          </IconButton>
        )}
        <HeaderSearch scope={dmId} />
      </HeaderTools>
      </header>
  );
}

export function ChatView({ channelId }: { channelId: ID }) {
  const channel = useStore((s) => s.channels[channelId]);
  const dm = useStore((s) => s.dms[channelId]);
  const serverId = channel?.serverId ?? null;
  const memberListOpen = useStore((s) => s.memberListOpen);
  const dmProfileOpen = useStore((s) => s.dmProfileOpen);
  // Own call here, or a call running without us (bar to join it).
  const call = useStore((s) => s.call?.dmId === channelId || (!!s.dms[channelId] && (s.voice[channelId]?.length ?? 0) > 0));
  const search = useUI((s) => s.search);
  const mobileMembers = useUI((s) => s.mobileMembers);
  const wide = useMediaQuery('(min-width: 1100px)');
  const isMobile = useMediaQuery('(max-width: 1099px)');
  const [dragging, setDragging] = useState(false);

  const searchScope = serverId ?? channelId;
  const showSearch = search?.scope === searchScope;

  let side: ReactNode = null;
  if (showSearch) side = <SearchPanel scope={searchScope} />;
  else if (channel && (isMobile ? mobileMembers : memberListOpen)) side = <MemberList serverId={channel.serverId} />;
  else if (dm?.type === 'group' && memberListOpen) side = <MemberList dmId={dm.id} />;
  else if (dm?.type === 'dm' && dmProfileOpen && wide) side = <DMProfilePanel dmId={dm.id} />;

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) addFiles(channelId, files);
  };

  return (
    <div className="chat">
      {channel ? <ServerHeader channelId={channelId} /> : <DMHeader dmId={channelId} />}
      <div className="view-body">
        <div
          className="chat-main"
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('Files')) {
              e.preventDefault();
              setDragging(true);
            }
          }}
          onDragLeave={(e) => {
            if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDragging(false);
          }}
          onDrop={onDrop}
        >
          {call && <CallPanel dmId={channelId} />}
          <MessageList channelId={channelId} serverId={serverId} />
          {serverId && <BotCommands channelId={channelId} />}
          <Composer channelId={channelId} serverId={serverId} />
          {dragging && (
            <div className="drop-overlay">
              <div className="drop-card">
                <span className="drop-icon">
                  <Upload />
                </span>
                <strong>{channel ? t('Upload to #{name}', { name: channel.name }) : t('Upload to this conversation')}</strong>
                <span>{t('Images are stored locally · up to {size} MB per file', { size: BRAND.uploadLimitMb })}</span>
              </div>
            </div>
          )}
        </div>
        {side && <div className={cn('side-panel', isMobile && 'is-drawer')}>{side}</div>}
        {isMobile && side && !showSearch && (
          <button
            className="drawer-scrim"
            aria-label={t('Close sidebar')}
            onClick={() => {
              useUI.getState().setMobileMembers(false);
              if (dm) useStore.getState().setMemberListOpen(false);
            }}
          />
        )}
      </div>
    </div>
  );
}
