import { AtSign, Ban, Copy, Flag, Gavel, MessageSquare, Pencil, Phone, Shield, ShieldAlert, UserMinus, UserPlus, UserRound, UserX, NotebookPen } from 'lucide-react';
import type { ID } from '../../types';
import { addFriend, useStore } from '../../store/store';
import { useUI, showMainPane, toast } from '../../store/ui';
import { canServer } from '../../store/selectors';
import { copyText } from '../../lib/utils';
import type { MenuSpec } from '../ui/Menu';
import { t } from '../../i18n';
import { CLOUD } from '../../backend/config';
import { DELETED_USER_ID } from '../../backend/map';
import { useAccount } from '../../backend/moderation';
import { voiceMenuEntries } from '../voice/voiceMenu';

export function userMenu(userId: ID, serverId?: ID): MenuSpec {
  const s = useStore.getState();
  const ui = useUI.getState();
  const user = s.users[userId];
  if (!user) return [];
  const isMe = userId === s.meId;
  const rel = s.relationships[userId];
  const server = serverId ? s.servers[serverId] : undefined;
  const canRoles = server && canServer(s, server.id, 'manageRoles');
  const canKick = server && !isMe && server.ownerId !== userId && canServer(s, server.id, 'kickMembers');
  const member = server?.members[userId];
  const canBan = server && member && !isMe && server.ownerId !== userId && canServer(s, server.id, 'banMembers');
  // Reports and suspensions go to the ONYX team – only in cloud mode (the demo has no team behind it).
  const realPerson = CLOUD && !isMe && !user.bot && userId !== DELETED_USER_ID;
  const platformAdmin = realPerson && useAccount.getState().admin;
  const roles = server ? [...server.roles].filter((r) => !r.isDefault).sort((a, b) => b.position - a.position) : [];

  const message = () => {
    s.openDMWithUser(userId);
    showMainPane();
  };

  return [
    { label: t('Profile'), icon: <UserRound />, onSelect: () => ui.openModal({ type: 'profile', userId, serverId }) },
    !isMe && !user.bot && { label: t('Message'), icon: <MessageSquare />, onSelect: message },
    // Calls need the server (cloud mode); the demo has nobody to call.
    CLOUD &&
      !isMe &&
      !user.bot &&
      userId !== DELETED_USER_ID && {
        label: t('Call'),
        icon: <Phone />,
        onSelect: () => {
          const dmId = s.openDMWithUser(userId);
          showMainPane();
          if(dmId)s.startCall(dmId);
        },
      },
    !!serverId && {
      label: t('Mention'),
      icon: <AtSign />,
      onSelect: () => {
        const ch = s.view.kind === 'server' ? s.view.channelId : null;
        if (ch) ui.requestInsert(ch, `@${user.username} `);
      },
    },
    {
      label: s.notes[userId] ? t('Edit note') : t('Add note'),
      icon: <NotebookPen />,
      onSelect: () =>
        ui.openModal({
          type: 'prompt',
          title: t('Note about {name}', { name: user.displayName }),
          label: t('Only visible to you'),
          initial: s.notes[userId] ?? '',
          maxLength: 256,
          confirmLabel: t('Save'),
          onSubmit: (v) => s.setNote(userId, v),
        }),
    },
    ...voiceMenuEntries(userId, serverId),
    { type: 'separator' },
    server &&
      (isMe || canRoles) && {
        label: isMe ? t('Change server nickname') : t('Change nickname'),
        icon: <Pencil />,
        onSelect: () =>
          ui.openModal({
            type: 'prompt',
            title: t('Nickname'),
            label: t('Nickname in {name}', { name: server.name }),
            initial: member?.nickname ?? '',
            placeholder: user.displayName,
            maxLength: 32,
            confirmLabel: t('Save'),
            onSubmit: (v) => s.setNickname(server.id, userId, v),
          }),
      },
    canRoles &&
      member &&
      roles.length > 0 && {
        type: 'sub',
        label: t('Roles'),
        icon: <Shield />,
        items: roles.map((r) => ({
          type: 'check' as const,
          label: r.name,
          color: r.color ?? '#94a3b8',
          checked: member.roleIds.includes(r.id),
          keepOpen: true,
          onSelect: () => useStore.getState().toggleMemberRole(server!.id, userId, r.id),
        })),
      },
    !isMe && !user.bot && rel?.type !== 'blocked' && { type: 'separator' },
    !isMe && !user.bot && !rel && { label: t('Add friend'), icon: <UserPlus />, onSelect: () => addFriend(user.username) },
    !isMe && rel?.type === 'incoming' && { label: t('Accept request'), icon: <UserPlus />, onSelect: () => s.acceptFriend(userId) },
    !isMe &&
      rel?.type === 'friend' && {
        label: t('Remove friend'),
        icon: <UserMinus />,
        onSelect: () =>
          ui.openModal({
            type: 'confirm',
            title: t('Remove {name}', { name: user.displayName }),
            body: t('Do you really want to remove {name} from your friends list?', { name: user.displayName }),
            confirmLabel: t('Remove friend'),
            danger: true,
            onConfirm: () => s.removeRelationship(userId),
          }),
      },
    canKick && {
      label: t('Kick {name}', { name: user.displayName }),
      icon: <UserX />,
      danger: true,
      onSelect: () =>
        ui.openModal({
          type: 'confirm',
          title: t('Kick {name} from {server}', { name: user.displayName, server: server!.name }),
          body: t('The member is removed from the server and can rejoin with a new invite.'),
          confirmLabel: t('Kick'),
          danger: true,
          onConfirm: () => s.kickMember(server!.id, userId),
        }),
    },
    canBan && {
      label: t('Ban {name} …', { name: user.displayName }),
      icon: <Gavel />,
      danger: true,
      onSelect: () => ui.openModal({ type: 'ban', serverId: server!.id, userId }),
    },
    realPerson && { label: t('Report {name} …', { name: user.displayName }), icon: <Flag />, danger: true, onSelect: () => ui.openModal({ type: 'report', target: { kind: 'user', userId } }) },
    platformAdmin && { label: t('Suspend from ONYX …'), icon: <ShieldAlert />, danger: true, onSelect: () => ui.openModal({ type: 'suspend', userId }) },
    !isMe && !user.bot && rel?.type !== 'blocked' && { label: t('Block'), icon: <Ban />, danger: true, onSelect: () => s.blockUser(userId) },
    !isMe && rel?.type === 'blocked' && { label: t('Unblock'), icon: <Ban />, onSelect: () => s.removeRelationship(userId) },
    { type: 'separator' },
    { label: t('Copy user ID'), icon: <Copy />, onSelect: () => copyText(userId).then(() => toast({ title: t('User ID copied') })) },
  ];
}
