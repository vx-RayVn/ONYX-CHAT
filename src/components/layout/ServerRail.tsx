import { useMemo, useState } from 'react';
import { BellOff, Check, Copy, LogOut, Plus, Settings, Trash, UserPlus, Volume2, Compass } from 'lucide-react';
import { muteEntry, serverNotifyMenu } from '../notifications/notifyMenus';
import { useShallow } from 'zustand/react/shallow';
import type { Server } from '../../types';
import { useStore } from '../../store/store';
import { useUI, showMainPane, toast } from '../../store/ui';
import { channelUnread, dmTitle, scopeMuted, serverUnread, usePendingFriendCount } from '../../store/selectors';
import { cn, copyText, serverInitials } from '../../lib/utils';
import { t, tx } from '../../i18n';
import { Tooltip } from '../ui/Tooltip';
import { ContextMenu, type MenuSpec } from '../ui/Menu';
import { Avatar } from '../ui/Avatar';
import { OnyxLogo } from '../ui/icons';
import {FolderGroup, folderMenuItems, folderDrop} from './ServerFolders';
import { CLOUD } from '../../backend/config';
import { useVoiceActivity } from '../../backend/voiceActivity';

export function ServerIcon({ server, size = 48, className }: { server: Pick<Server, 'name' | 'icon' | 'iconColor'>; size?: number; className?: string }) {
  if (server.icon) {
    return (
      <span className={cn('server-icon', className)} style={{ width: size, height: size }}>
        <img src={server.icon} alt="" draggable={false} />
      </span>
    );
  }
  const text = serverInitials(server.name);
  return (
    <span
      className={cn('server-icon', 'server-icon-initials', className)}
      style={{ width: size, height: size, background: server.iconColor, fontSize: Math.max(10, size * (text.length > 2 ? 0.28 : 0.34)) }}
    >
      {text}
    </span>
  );
}

export function serverMenu(server: Server): MenuSpec {
  const s = useStore.getState();
  const ui = useUI.getState();
  const isOwner = server.ownerId === s.meId;
  const { unread } = serverUnread(s, server.id);
  return [
    ...folderMenuItems(server.id),
    { label: t('Mark as read'), icon: <Check />, disabled: !unread, onSelect: () => s.markServerRead(server.id) },
    { type: 'separator' },
    { label: t('Invite people'), icon: <UserPlus />, onSelect: () => ui.openModal({ type: 'invite', serverId: server.id }) },
    { label: t('Server settings'), icon: <Settings />, onSelect: () => ui.openSettings({ kind: 'server', serverId: server.id, section: 'overview' }) },
    { type: 'separator' },
    muteEntry(server.id, 'server'),
    serverNotifyMenu(server.id),
    { type: 'separator' },
    { label: t('Copy server ID'), icon: <Copy />, onSelect: () => copyText(server.id).then(() => toast({ title: t('Server ID copied') })) },
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
              body: CLOUD
                ? t('The server with all channels and messages will be deleted for all members. This cannot be undone.')
                : t('The server with all channels and messages will be removed from your local demo. This cannot be undone.'),
              confirmLabel: t('Delete server'),
              danger: true,
              onConfirm: () => s.deleteServer(server.id),
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
              confirmLabel: t('Leave server'),
              danger: true,
              onConfirm: () => s.leaveServer(server.id),
            }),
        }] : []),
  ];
}

export function RailServer({ server, index, dragIndex, setDragIndex, dropIndex, setDropIndex }: {
  server: Server;
  index: number;
  dragIndex: number | null;
  setDragIndex: (i: number | null) => void;
  dropIndex: number | null;
  setDropIndex: (i: number | null) => void;
}) {
  const active = useStore((s) => s.view.kind === 'server' && s.view.serverId === server.id);
  const showBadges = useStore((s) => s.settings.showUnreadBadges);
  const { unread, mentions, muted } = useStore(useShallow((s) => serverUnread(s, server.id)));
  const selectServer = useStore((s) => s.selectServer);
  const reorder = useStore((s) => s.reorderServer);
  const voiceHere = useStore((s) => (s.voiceSelf.channelId ? s.channels[s.voiceSelf.channelId]?.serverId === server.id : false));
  const knownActivity = useStore((s) => !CLOUD && Object.entries(s.voice).some(([id, list]) => s.channels[id]?.serverId === server.id && list.length > 0));
  const cloudActivity = useVoiceActivity((s) => !!s.active[server.id]);
  const voiceActive = voiceHere || knownActivity || cloudActivity;

  return (
    <div
      className={cn('rail-item', active && 'is-active', showBadges && unread && 'is-unread', muted && 'is-muted', dropIndex === index && dragIndex !== index && 'is-drop-before')}
      draggable
      onDragStart={(e) => {
        setDragIndex(index);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', server.id);
      }}
      onDragOver={(e) => {
        if (dragIndex === null) return;
        e.preventDefault();
        setDropIndex(index);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (dragIndex !== null && dragIndex !== index) {
          const source = e.dataTransfer.getData('text/plain');
          if(!useStore.getState().servers[source])return;
          const bounds=e.currentTarget.getBoundingClientRect();
          if(e.clientY>bounds.top+bounds.height*.25 && e.clientY<bounds.bottom-bounds.height*.25){folderDrop(source,server.id);setDragIndex(null);setDropIndex(null);return;}
          const state=useStore.getState();state.setServerFolders(state.serverFolders.map(f=>({...f,serverIds:f.serverIds.filter(id=>id!==source)})));
          const draggedId = source;
          reorder(draggedId, dragIndex < index ? index - 1 : index);
        }
        setDragIndex(null);
        setDropIndex(null);
      }}
      onDragEnd={() => {
        setDragIndex(null);
        setDropIndex(null);
      }}
    >
      <span className="rail-pill" />
      <ContextMenu items={() => serverMenu(server)}>
        <span className="rail-context">
        <Tooltip
          side="right"
          content={
            <span className="rail-tooltip">
              <strong>{server.name}</strong>
              {muted && (
                <span className="rail-tooltip-sub">
                  <BellOff size={12} /> {t('Muted')}
                </span>
              )}
              {voiceActive && <span className="rail-tooltip-sub">{voiceHere ? t('Connected to voice') : t('Voice active')}</span>}
            </span>
          }
          delay={0}
        >
          <button className="rail-btn rail-btn-icon" aria-label={server.name} onClick={() => selectServer(server.id)}>
            <ServerIcon server={server} />
            {showBadges && mentions > 0 && <span className="rail-badge">{mentions > 99 ? '99+' : mentions}</span>}
            {voiceActive && (
              <span className="rail-voice-dot">
                <Volume2 size={11} strokeWidth={2.6} />
              </span>
            )}
          </button>
        </Tooltip>
        </span>
      </ContextMenu>
    </div>
  );
}

function UnreadDMs() {
  const dms = useStore((s) => s.dms);
  const unreadIds = useStore(
    useShallow((s) =>
      Object.values(s.dms)
        .filter((d) => channelUnread(s, d.id).unread > 0 && !scopeMuted(s, d.id))
        .sort((a, b) => b.lastActivityAt - a.lastActivityAt)
        .map((d) => d.id)
        .slice(0, 4),
    ),
  );
  const counts = useStore(useShallow((s) => unreadIds.map((id) => channelUnread(s, id).mentions)));
  const users = useStore((s) => s.users);
  const meId = useStore((s) => s.meId);
  const openDM = useStore((s) => s.openDM);
  const activeDm = useStore((s) => (s.view.kind === 'dm' ? s.view.dmId : null));

  if (unreadIds.length === 0) return null;
  return (
    <>
      {unreadIds.map((id, i) => {
        const dm = dms[id];
        const other = users[dm.participantIds.find((p) => p !== meId) ?? ''];
        if (activeDm === id) return null;
        const title = dmTitle({ users, meId }, dm);
        return (
          <div key={id} className="rail-item rail-dm is-unread">
            <span className="rail-pill" />
            <Tooltip side="right" content={title} delay={0}>
              <button
                className="rail-btn rail-btn-avatar"
                aria-label={t('Unread message from {name}', { name: title })}
                onClick={() => {
                  openDM(id);
                  showMainPane();
                }}
              >
                {dm.type === 'group' ? <span className="group-icon rail-group">{dm.name?.slice(0, 2) ?? 'G'}</span> : <Avatar user={other} size={48} />}
                {counts[i] > 0 && <span className="rail-badge">{counts[i] > 99 ? '99+' : counts[i]}</span>}
              </button>
            </Tooltip>
          </div>
        );
      })}
    </>
  );
}

export function ServerRail() {
  const serverOrder = useStore((s) => s.serverOrder);
  const servers = useStore((s) => s.servers);
  const folders = useStore((s) => s.serverFolders);
  const isHome = useStore((s) => s.view.kind !== 'server');
  const goHome = useStore((s) => s.goHome);
  const pending = usePendingFriendCount();
  const openModal = useUI((s) => s.openModal);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const list = useMemo(() => serverOrder.map((id) => servers[id]).filter(Boolean), [serverOrder, servers]);

  return (
    <nav className="rail scroll-thin" aria-label={t('Servers')}>
      <div className={cn('rail-item', isHome && 'is-active')}>
        <span className="rail-pill" />
        <Tooltip side="right" content={t('Direct messages')} delay={0}>
          <button
            className="rail-btn rail-home"
            aria-label={t('Direct messages')}
            onClick={() => {
              if (useStore.getState().view.kind === 'server') goHome('friends');
            }}
          >
            <span className="rail-home-logo">
              <OnyxLogo size={48} />
            </span>
            {pending > 0 && <span className="rail-badge">{pending}</span>}
          </button>
        </Tooltip>
      </div>
      <UnreadDMs />
      <div className="rail-sep" />
      {list.map((server, i) => {
        const folder=folders.find(f=>f.serverIds.includes(server.id));
        if(folder && folder.serverIds.filter(id=>servers[id]).sort((a,b)=>serverOrder.indexOf(a)-serverOrder.indexOf(b))[0]!==server.id)return null;
        const props={dragIndex,setDragIndex,dropIndex,setDropIndex};
        return folder ? <FolderGroup key={folder.id} folder={folder} {...props}/> : <RailServer key={server.id} server={server} index={i} {...props}/>;
      })}
      <div className="rail-item">
        <Tooltip side="right" content={t('Add a server')} delay={0}>
          <button className="rail-btn rail-action" aria-label={t('Add a server')} onClick={() => openModal({ type: 'createServer' })}>
            <Plus size={24} />
          </button>
        </Tooltip>
      </div>
      <div className="rail-item"><Tooltip side="right" content={t('Discover')} delay={0}><button className="rail-btn rail-action" aria-label={t('Discover')} onClick={()=>{goHome('discover');showMainPane();}}><Compass size={24}/></button></Tooltip></div>
      <span className="sr-only">{tx('{count} servers', { count: list.length })}</span>
    </nav>
  );
}
