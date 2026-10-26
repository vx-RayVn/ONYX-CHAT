import {GuestTag} from '../ui/GuestTag';
import { useMemo, useState } from 'react';
import {ChannelDragContext,useChannelDrag,useChannelReorder} from '../../hooks/useChannelReorder';
import {
  ArrowDown,
  ArrowUp,
  BadgeCheck,
  Check,
  ChevronDown,
  ChevronsUpDown,
  Copy,
  FolderPlus,
  GripVertical,
  HeadphoneOff,
  Link,
  LogOut,
  MicOff,
  Pencil,
  Plus,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Trash,
  UserPlus,
  Video,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import type { Category, Channel, ID, VoiceParticipant } from '../../types';
import { sortedChannels, useStore } from '../../store/store';
import { useUI, showMainPane, toast } from '../../store/ui';
import { canSee, canServer, channelUnread, memberDisplayName, myChannelPermissions, scopeMuted, serverUnread, useCanManage } from '../../store/selectors';
import { channelNotifyMenu, muteEntry, mutedText, serverNotifyMenu } from '../notifications/notifyMenus';
import { isPrivateChannel } from '../../lib/permissions';
import { useIsSpeaking } from '../../store/speaking';
import { cn, copyText } from '../../lib/utils';
import { t, tx } from '../../i18n';
import { ChannelIcon } from '../ui/icons';
import { IconButton } from '../ui/Button';
import { ContextMenu, Dropdown, type MenuSpec } from '../ui/Menu';
import { Avatar } from '../ui/Avatar';
import { Banner } from '../ui/Banner';
import { Tooltip } from '../ui/Tooltip';
import { SelfPanel } from './SelfPanel';
import { UserPopover } from '../profile/UserPopover';
import { userMenu } from '../profile/userMenu';
import { StyledName } from '../cosmetics/StyledName';
import { CLOUD } from '../../backend/config';

/* ---------------------------------------------------------------- */
/* Menus                                                              */
/* ---------------------------------------------------------------- */

export function channelMenu(channel: Channel): MenuSpec {
  const s = useStore.getState();
  const ui = useUI.getState();
  const perms = myChannelPermissions(s, channel.id);
  const manage = !!perms?.has('manageChannels');
  const managePerms = !!perms?.has('manageRoles');
  const { unread } = channelUnread(s, channel.id);
  const siblings = sortedChannels(s.channels, channel.serverId).filter((c) => c.categoryId === channel.categoryId);
  const idx = siblings.findIndex((c) => c.id === channel.id);
  return [
    channel.type !== 'voice' && { label: t('Mark as read'), icon: <Check />, disabled: !unread, onSelect: () => s.markRead(channel.id) },
    channel.type !== 'voice' && { type: 'separator' },
    perms?.has('createInvites') && { label: t('Invite people'), icon: <UserPlus />, onSelect: () => ui.openModal({ type: 'invite', serverId: channel.serverId, channelId: channel.id }) },
    { label: t('Copy link'), icon: <Link />, onSelect: () => copyText(`onyx.gg/channels/${channel.serverId}/${channel.id}`).then(() => toast({ title: t('Link copied') })) },
    channel.type !== 'voice' && { type: 'separator' },
    channel.type !== 'voice' && muteEntry(channel.id, 'channel'),
    channel.type !== 'voice' && channelNotifyMenu(channel.id),
    (manage || managePerms) && { type: 'separator' },
    manage && { label: t('Edit channel'), icon: <Settings />, onSelect: () => ui.openSettings({ kind: 'channel', channelId: channel.id, section: 'overview' }) },
    managePerms && { label: t('Edit permissions'), icon: <ShieldCheck />, onSelect: () => ui.openSettings({ kind: 'channel', channelId: channel.id, section: 'permissions' }) },
    manage && idx > 0 && { label: t('Move up'), icon: <ArrowUp />, onSelect: () => s.moveChannel(channel.id, -1) },
    manage && idx < siblings.length - 1 && { label: t('Move down'), icon: <ArrowDown />, onSelect: () => s.moveChannel(channel.id, 1) },
    manage && {
      label: t('Delete channel'),
      icon: <Trash />,
      danger: true,
      onSelect: () =>
        ui.openModal({
          type: 'confirm',
          title: t('Delete channel'),
          body: tx('Do you really want to delete {name}? All messages in it will be removed.', { name: <strong>{channel.type === 'voice' ? channel.name : `#${channel.name}`}</strong> }),
          confirmLabel: t('Delete channel'),
          danger: true,
          onConfirm: () => s.deleteChannel(channel.id),
        }),
    },
    { type: 'separator' },
    { label: t('Copy channel ID'), icon: <Copy />, onSelect: () => copyText(channel.id).then(() => toast({ title: t('Channel ID copied') })) },
  ];
}

function categoryMenu(serverId: ID, category: Category, collapsed: boolean): MenuSpec {
  const s = useStore.getState();
  const ui = useUI.getState();
  const manage = canServer(s, serverId, 'manageChannels');
  const managePerms = canServer(s, serverId, 'manageRoles');
  const cats = [...s.servers[serverId].categories].sort((a, b) => a.position - b.position);
  const idx = cats.findIndex((c) => c.id === category.id);
  return [
    { label: collapsed ? t('Expand category') : t('Collapse category'), icon: <ChevronsUpDown />, onSelect: () => s.toggleCategory(category.id) },
    (manage || managePerms) && { type: 'separator' },
    manage && { label: t('Create channel'), icon: <Plus />, onSelect: () => ui.openModal({ type: 'createChannel', serverId, categoryId: category.id }) },
    manage && {
      label: t('Rename category'),
      icon: <Pencil />,
      onSelect: () =>
        ui.openModal({
          type: 'prompt',
          title: t('Rename category'),
          label: t('Category name'),
          initial: category.name,
          maxLength: 40,
          confirmLabel: t('Save'),
          onSubmit: (v) => s.renameCategory(serverId, category.id, v),
        }),
    },
    managePerms && { label: t('Edit category permissions'), icon: <ShieldCheck />, onSelect: () => ui.openSettings({ kind: 'category', serverId, categoryId: category.id, section: 'permissions' }) },
    manage && idx > 0 && { label: t('Move up'), icon: <ArrowUp />, onSelect: () => s.moveCategory(serverId, category.id, -1) },
    manage && idx < cats.length - 1 && { label: t('Move down'), icon: <ArrowDown />, onSelect: () => s.moveCategory(serverId, category.id, 1) },
    manage && {
      label: t('Delete category'),
      icon: <Trash />,
      danger: true,
      onSelect: () =>
        ui.openModal({
          type: 'confirm',
          title: t('Delete category'),
          body: tx('{name} will be deleted. Its channels stay and move to the top of the list without a category.', { name: <strong>{category.name}</strong> }),
          confirmLabel: t('Delete category'),
          danger: true,
          onConfirm: () => s.deleteCategory(serverId, category.id),
        }),
    },
  ];
}

/* ---------------------------------------------------------------- */
/* Rows                                                               */
/* ---------------------------------------------------------------- */

function VoiceUser({ userId, serverId, muted, deafened, serverMuted, serverDeafened, video, streaming }: VoiceParticipant & { serverId: ID }) {
  const user = useStore((s) => s.users[userId]);
  const name = useStore((s) => memberDisplayName(s, userId, serverId));
  const speaking = useIsSpeaking(userId);
  const byServer = (deafened ? serverDeafened : serverMuted) && t('Muted by a moderator');
  return (
    <ContextMenu items={() => userMenu(userId, serverId)}>
      <div>
        <UserPopover userId={userId} serverId={serverId} side="right" align="start">
          <div className={cn('voice-user anim-host', speaking && 'is-speaking')} role="button" tabIndex={0}>
            <Avatar user={user} size={24} speaking={speaking} />
            <span className="voice-user-name truncate">
              <StyledName style={user?.nameStyle}>{name}</StyledName><GuestTag guest={user?.guest}/>
            </span>
            <span className="voice-user-icons" title={byServer || undefined}>
              {streaming && <span className="live-tag">{t('LIVE')}</span>}
              {video && <Video />}
              {(serverMuted || serverDeafened) && <ShieldAlert className="is-red" />}
              {muted && !deafened && <MicOff className="is-red" />}
              {deafened && <HeadphoneOff className="is-red" />}
            </span>
          </div>
        </UserPopover>
      </div>
    </ContextMenu>
  );
}

function ChannelRow({ channel }: { channel: Channel }) {
  const drag=useChannelDrag();
  const reorder=useStore(s=>canServer(s,channel.serverId,'manageChannels'));
  const active = useStore((s) => s.view.kind === 'server' && s.view.channelId === channel.id);
  const { unread, mentions } = useStore(useShallow((s) => channelUnread(s, channel.id)));
  const muted = useStore((s) => scopeMuted(s, channel.id));
  const quiet = useStore((s) => muted || scopeMuted(s, channel.serverId));
  const mutedHint = useStore((s) => (muted ? mutedText(s.notifyPrefs[channel.id], s.settings.use24h) : ''));
  const participants = useStore((s) => s.voice[channel.id]);
  const inThis = useStore((s) => s.voiceSelf.channelId === channel.id);
  const manage = useStore((s) => !!myChannelPermissions(s, channel.id)?.has('manageChannels'));
  const invite = useStore((s) => !!myChannelPermissions(s, channel.id)?.has('createInvites'));
  const locked = useStore((s) => (s.servers[channel.serverId] ? isPrivateChannel(s.servers[channel.serverId], channel) : false));
  const selectChannel = useStore((s) => s.selectChannel);
  const joinVoice = useStore((s) => s.joinVoice);
  const isVoice = channel.type === 'voice';
  const count = participants?.length ?? 0;

  const open = () => {
    if (isVoice && !inThis) joinVoice(channel.id);
    selectChannel(channel.serverId, channel.id);
    showMainPane();
  };

  return (
    <>
      <ContextMenu items={() => channelMenu(channel)}>
        <div
          data-reorder-channel={channel.id}
          className={cn('channel', active && 'is-active', !isVoice && unread > 0 && !quiet && 'is-unread', muted && 'is-muted', inThis && 'is-connected',drag?.drag?.id===channel.id&&'is-reordering',drag?.drag?.target?.row===channel.id&&(drag.drag.target.after?'is-insert-after':'is-insert-before'))}
          title={mutedHint || undefined}
          role="button"
          tabIndex={0}
          aria-current={active ? 'page' : undefined}
          onClick={open}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open())}
        >
          {reorder&&<button className="channel-drag-handle" aria-label={t('Move channel')} onClick={e=>e.stopPropagation()} onContextMenu={e=>e.preventDefault()} onPointerDown={e=>drag?.start(e,channel.id)} onPointerMove={drag?.move} onPointerUp={drag?.end} onPointerCancel={drag?.cancel} onLostPointerCapture={drag?.cancel} onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape')drag?.cancel();if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();useStore.getState().moveChannel(channel.id,e.key==='ArrowUp'?-1:1);}}}><GripVertical size={13}/></button>}
          <ChannelIcon type={channel.type} isPrivate={locked} />
          <span className="channel-name truncate">{channel.name}</span>
          <span className="channel-actions" onClick={(e) => e.stopPropagation()}>
            {invite && (
              <IconButton label={t('Create invite')} size="sm" onClick={() => useUI.getState().openModal({ type: 'invite', serverId: channel.serverId, channelId: channel.id })}>
                <UserPlus />
              </IconButton>
            )}
            {manage && (
              <IconButton label={t('Edit channel')} size="sm" onClick={() => useUI.getState().openSettings({ kind: 'channel', channelId: channel.id, section: 'overview' })}>
                <Settings />
              </IconButton>
            )}
          </span>
          {isVoice && channel.userLimit ? (
            <span className="voice-count">
              {String(count).padStart(2, '0')}/{String(channel.userLimit).padStart(2, '0')}
            </span>
          ) : null}
          {!isVoice && mentions > 0 && <span className="mention-badge">{mentions}</span>}
        </div>
      </ContextMenu>
      {isVoice && count > 0 && (
        <div className="voice-users">
          {participants!.map((p) => (
            <VoiceUser key={p.userId} serverId={channel.serverId} {...p} />
          ))}
        </div>
      )}
    </>
  );
}

function CategoryBlock({ serverId, category, channels }: { serverId: ID; category: Category; channels: Channel[] }) {
  const collapsed = useStore((s) => !!s.collapsedCategories[category.id]);
  const toggle = useStore((s) => s.toggleCategory);
  const manage = useStore((s) => canServer(s, serverId, 'manageChannels'));
  const activeId = useStore((s) => (s.view.kind === 'server' ? s.view.channelId : null));
  const unreadIds = useStore(
    useShallow((s) => channels.filter((c) => c.type !== 'voice' && channelUnread(s, c.id).unread > 0 && !scopeMuted(s, c.id) && !scopeMuted(s, serverId)).map((c) => c.id)),
  );
  const voiceSelf = useStore((s) => s.voiceSelf.channelId);
  const visible = collapsed ? channels.filter((c) => c.id === activeId || unreadIds.includes(c.id) || c.id === voiceSelf) : channels;

  return (
    <div className={cn('category', collapsed && 'is-collapsed')}>
      <ContextMenu items={() => categoryMenu(serverId, category, collapsed)}>
        <div className="category-head" data-reorder-category={category.id}>
          <button className="category-toggle" onClick={() => toggle(category.id)} aria-expanded={!collapsed}>
            <ChevronDown strokeWidth={2.6} />
            <span className="truncate">{category.name}</span>
          </button>
          {manage && (
            <IconButton label={t('Create channel')} size="sm" className="category-add" onClick={() => useUI.getState().openModal({ type: 'createChannel', serverId, categoryId: category.id })}>
              <Plus />
            </IconButton>
          )}
        </div>
      </ContextMenu>
      {visible.map((c) => (
        <ChannelRow key={c.id} channel={c} />
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Sidebar                                                            */
/* ---------------------------------------------------------------- */

export function ServerSidebar({ serverId }: { serverId: ID }) {
  const drag=useChannelReorder(serverId);
  const server = useStore((s) => s.servers[serverId]);
  const channelsMap = useStore((s) => s.channels);
  const manage = useCanManage(serverId);
  const manageChannels = useStore((s) => canServer(s, serverId, 'manageChannels'));
  const inviteAllowed = useStore((s) => canServer(s, serverId, 'createInvites'));
  // Channels the local user can see (channel permissions and “View server as role”).
  const visibleIds = useStore(
    useShallow((s) =>
      Object.values(s.channels)
        .filter((c) => c.serverId === serverId && canSee(s, c.id))
        .map((c) => c.id),
    ),
  );
  const meId = useStore((s) => s.meId);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const { uncategorized, groups } = useMemo(() => {
    const all = sortedChannels(channelsMap, serverId).filter((c) => visibleIds.includes(c.id));
    const cats = server ? [...server.categories].sort((a, b) => a.position - b.position) : [];
    return {
      uncategorized: all.filter((c) => !c.categoryId || !cats.some((k) => k.id === c.categoryId)),
      // Categories without a visible channel are hidden, except for people who manage channels.
      groups: cats.map((cat) => ({ cat, channels: all.filter((c) => c.categoryId === cat.id) })).filter((g) => g.channels.length > 0 || manageChannels),
    };
  }, [channelsMap, serverId, server, visibleIds, manageChannels]);

  if (!server) return null;
  const isOwner = server.ownerId === meId;
  const ui = useUI.getState();
  const s = useStore.getState();

  const headerMenu: MenuSpec = [
    inviteAllowed && { label: t('Invite people'), icon: <UserPlus />, onSelect: () => ui.openModal({ type: 'invite', serverId }) },
    manage && { label: t('Server settings'), icon: <Settings />, onSelect: () => ui.openSettings({ kind: 'server', serverId, section: 'overview' }) },
    manageChannels && { label: t('Create channel'), icon: <Plus />, onSelect: () => ui.openModal({ type: 'createChannel', serverId, categoryId: null }) },
    manageChannels && { label: t('Create category'), icon: <FolderPlus />, onSelect: () => ui.openModal({ type: 'createCategory', serverId }) },
    { type: 'separator' },
    { label: t('Mark as read'), icon: <Check />, disabled: !serverUnread(s, serverId).unread, onSelect: () => s.markServerRead(serverId) },
    muteEntry(serverId, 'server'),
    serverNotifyMenu(serverId),
    {
      label: t('Server profile'),
      icon: <Pencil />,
      hint: t('Set a server nickname'),
      onSelect: () =>
        ui.openModal({
          type: 'prompt',
          title: t('Server nickname'),
          label: t('Nickname (only visible in this server)'),
          initial: server.members[meId]?.nickname ?? '',
          placeholder: s.users[meId].displayName,
          maxLength: 32,
          confirmLabel: t('Save'),
          onSubmit: (v) => s.setNickname(serverId, meId, v),
        }),
    },
    { type: 'separator' },
    ...(!server.isOfficial ? [isOwner
      ? {
          label: t('Delete server'),
          icon: <Trash />,
          danger: true,
          onSelect: () =>
            ui.openModal({
              type: 'confirm',
              title: t('Delete “{name}”', { name: server.name }),
              body: CLOUD ? t('All channels and messages will be deleted for all members.') : t('All channels and messages will be removed from your local demo.'),
              confirmLabel: t('Delete server'),
              danger: true,
              onConfirm: () => s.deleteServer(serverId),
            }),
        }
      : {
          label: t('Leave server'),
          icon: <LogOut />,
          danger: true,
          onSelect: () =>
            ui.openModal({
              type: 'confirm',
              title: t('Leave “{name}”', { name: server.name }),
              body: t('You can rejoin later with an invite.'),
              confirmLabel: t('Leave'),
              danger: true,
              onConfirm: () => s.leaveServer(serverId),
            }),
        }] : []),
  ];

  const hasBanner = !!server.banner;

  return (
    <aside className={cn('sidebar', hasBanner && 'has-banner', (scrolled || menuOpen) && 'is-scrolled')} aria-label={t('Channels of {name}', { name: server.name })}>
      <div className="sidebar-header">
        <Dropdown
          open={menuOpen}
          onOpenChange={setMenuOpen}
          align="center"
          className="server-menu"
          trigger={
            <button className="server-header-btn">
              {server.verified && (
                <Tooltip content={t('Verified community')}>
                  <span className="verified-mark">
                    <BadgeCheck size={18} />
                  </span>
                </Tooltip>
              )}
              <span className="truncate">{server.name}</span>
              <ChevronDown size={18} className="chev" />
            </button>
          }
          items={headerMenu}
        />
      </div>
      <div className="sidebar-scroll" onScroll={(e) => setScrolled((e.target as HTMLElement).scrollTop > 64)}>
        {hasBanner && (
          <div className="sidebar-banner anim-host">
            <Banner source={server.banner} />
          </div>
        )}
        <ChannelDragContext.Provider value={drag}><div className={cn('channel-list',drag.drag&&'is-dragging-channel')}>
          {uncategorized.length > 0 && (
            <div className="category">
              {uncategorized.map((c) => (
                <ChannelRow key={c.id} channel={c} />
              ))}
            </div>
          )}
          {groups.map(({ cat, channels }) => (
            <CategoryBlock key={cat.id} serverId={serverId} category={cat} channels={channels} />
          ))}
          {uncategorized.length === 0 && groups.every((g) => g.channels.length === 0) && (
            <div className="sidebar-empty">
              {t('No channels yet.')}
              {manageChannels && (
                <button className="btn btn-link" style={{ display: 'block', margin: '8px auto 0' }} onClick={() => ui.openModal({ type: 'createChannel', serverId, categoryId: null })}>
                  {t('Create the first channel')}
                </button>
              )}
            </div>
          )}
          {drag.drag&&<div className="channel-drop-root" data-reorder-category="">{t('Move here')}</div>}
        </div></ChannelDragContext.Provider>
      </div>
      <SelfPanel />
    </aside>
  );
}
