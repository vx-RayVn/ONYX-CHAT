import { useMemo } from 'react';
import { Pencil, UserPlus, Ban, UserMinus, Users } from 'lucide-react';
import type { ID } from '../../types';
import { addFriend, useStore } from '../../store/store';
import { useUI } from '../../store/ui';
import { dmOther, dmTitle, useCanManage } from '../../store/selectors';
import { t, tn, tx } from '../../i18n';
import { ChannelIcon } from '../ui/icons';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { GroupIcon } from '../layout/HomeSidebar';
import { ServerIcon } from '../layout/ServerRail';

function ServerChannelWelcome({ channelId }: { channelId: ID }) {
  const channel = useStore((s) => s.channels[channelId]);
  const manage = useCanManage(channel?.serverId);
  const ui = useUI.getState();
  if (!channel) return null;
  return (
    <div className="welcome">
      <div className="welcome-icon">
        <ChannelIcon type={channel.type} size={38} />
      </div>
      <h2 className="welcome-title">{t('Welcome to #{name}!', { name: channel.name })}</h2>
      <p className="welcome-text">
        {tx('This is the start of the #{name} channel.', { name: <strong>{channel.name}</strong> })}
        {channel.topic ? ` ${channel.topic}` : ''}
      </p>
      <div className="welcome-actions">
        {manage && (
          <Button variant="secondary" size="sm" icon={<Pencil />} onClick={() => ui.openSettings({ kind: 'channel', channelId, section: 'overview' })}>
            {t('Edit channel')}
          </Button>
        )}
        <Button variant="secondary" size="sm" icon={<UserPlus />} onClick={() => ui.openModal({ type: 'invite', serverId: channel.serverId, channelId })}>
          {t('Invite friends')}
        </Button>
      </div>
    </div>
  );
}

function DMWelcome({ dmId }: { dmId: ID }) {
  const dm = useStore((s) => s.dms[dmId]);
  const other = useStore((s) => (dm ? dmOther(s, dm) : undefined));
  const title = useStore((s) => (dm ? dmTitle(s, dm) : ''));
  const rel = useStore((s) => (other ? s.relationships[other.id] : undefined));
  const servers = useStore((s) => s.servers);
  const serverOrder = useStore((s) => s.serverOrder);
  const mutual = useMemo(() => (other ? serverOrder.filter((id) => servers[id]?.members[other.id]).map((id) => servers[id]) : []), [other, servers, serverOrder]);
  const { removeRelationship, blockUser } = useStore.getState();
  const ui = useUI.getState();
  if (!dm) return null;

  if (dm.type === 'group') {
    return (
      <div className="welcome">
        <div className="welcome-group">
          <GroupIcon dm={dm} size={80} />
        </div>
        <h2 className="welcome-title">{title}</h2>
        <p className="welcome-text">
          {tx('Welcome to the beginning of the group {name}', { name: <strong>{title}</strong> })} · {tn(dm.participantIds.length, '{count} member', '{count} members')}
        </p>
        <div className="welcome-actions">
          <Button variant="secondary" size="sm" icon={<Users />} onClick={() => ui.openModal({ type: 'newDM', addTo: dm.id })}>
            {t('Add friends')}
          </Button>
        </div>
      </div>
    );
  }

  if (!other) return null;
  return (
    <div className="welcome welcome-dm anim-host">
      <Avatar user={other} size={88} frame />
      <h2 className="welcome-title">{other.displayName}</h2>
      <div className="welcome-username">{other.username}</div>
      <p className="welcome-text">
        {tx('This is the beginning of your direct messages with {name}.', { name: <strong>{other.displayName}</strong> })}
      </p>
      <div className="welcome-actions">
        {mutual.length > 0 && (
          <span className="welcome-mutual">
            <span className="welcome-mutual-icons">
              {mutual.slice(0, 3).map((srv) => (
                <ServerIcon key={srv!.id} server={srv!} size={20} />
              ))}
            </span>
            {tn(mutual.length, '{count} mutual server', '{count} mutual servers')}
          </span>
        )}
        {rel?.type === 'friend' ? (
          <Button
            variant="secondary"
            size="sm"
            icon={<UserMinus />}
            onClick={() =>
              ui.openModal({
                type: 'confirm',
                title: t('Remove {name}', { name: other.displayName }),
                body: t('Do you really want to remove {name} from your friends list?', { name: other.displayName }),
                confirmLabel: t('Remove friend'),
                danger: true,
                onConfirm: () => removeRelationship(other.id),
              })
            }
          >
            {t('Remove friend')}
          </Button>
        ) : rel?.type === 'outgoing' ? (
          <Button variant="secondary" size="sm" disabled>
            {t('Request sent')}
          </Button>
        ) : rel?.type !== 'blocked' ? (
          <Button variant="primary" size="sm" icon={<UserPlus />} onClick={() => addFriend(other.username)}>
            {t('Add friend')}
          </Button>
        ) : null}
        {rel?.type !== 'blocked' && (
          <Button variant="secondary" size="sm" icon={<Ban />} onClick={() => blockUser(other.id)}>
            {t('Block')}
          </Button>
        )}
      </div>
    </div>
  );
}

export function ChannelWelcome({ channelId }: { channelId: ID }) {
  const isDM = useStore((s) => !!s.dms[channelId]);
  return isDM ? <DMWelcome dmId={channelId} /> : <ServerChannelWelcome channelId={channelId} />;
}
