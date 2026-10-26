import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ID } from '../../types';
import { useStore } from '../../store/store';
import { showMainPane, useUI } from '../../store/ui';
import { dmOther } from '../../store/selectors';
import { cn } from '../../lib/utils';
import { t, tn } from '../../i18n';
import { ProfileCard } from './ProfileCard';
import { ServerIcon } from '../layout/ServerRail';
import { Avatar } from '../ui/Avatar';

function Collapsible({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn('collapse', open && 'is-open')}>
      <button className="collapse-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>{title}</span>
        <ChevronDown size={16} />
      </button>
      {open && <div className="collapse-body">{children}</div>}
    </div>
  );
}

export function DMProfilePanel({ dmId }: { dmId: ID }) {
  const dm = useStore((s) => s.dms[dmId]);
  const user = useStore((s) => (dm ? dmOther(s, dm) : undefined));
  const servers = useStore((s) => s.servers);
  const serverOrder = useStore((s) => s.serverOrder);
  const relationships = useStore((s) => s.relationships);
  const users = useStore((s) => s.users);
  const { selectServer, openDMWithUser } = useStore.getState();

  const mutualServers = useMemo(() => (user ? serverOrder.map((id) => servers[id]).filter((s) => s?.members[user.id]) : []), [user, servers, serverOrder]);
  // Demo approximation: friends who share a server with this user.
  const mutualFriends = useMemo(
    () =>
      user
        ? Object.values(relationships)
            .filter((r) => r.type === 'friend' && r.userId !== user.id)
            .map((r) => users[r.userId])
            .filter((f) => f && mutualServers.some((s) => s.members[f.id]))
            .slice(0, 8)
        : [],
    [user, relationships, users, mutualServers],
  );

  if (!user) return null;
  return (
    <aside className="dm-profile scroll-thin" aria-label={t('Profile of {name}', { name: user.displayName })}>
      <ProfileCard user={user} variant="panel" panelFooter={
        <button className="btn btn-secondary btn-block pcard-expand" onClick={() => useUI.getState().openModal({ type: 'profile', userId: user.id })}>
          {t('Full profile')}
        </button>
      }>
        {(mutualServers.length > 0 || mutualFriends.length > 0) && (
          <div className="pcard-extra">
            {mutualServers.length > 0 && (
              <Collapsible title={tn(mutualServers.length, '{count} mutual server', '{count} mutual servers')}>
                {mutualServers.map((s) => (
                  <button key={s.id} className="mutual-row" onClick={() => (selectServer(s.id), showMainPane())}>
                    <ServerIcon server={s} size={32} />
                    <span className="truncate">{s.name}</span>
                  </button>
                ))}
              </Collapsible>
            )}
            {mutualFriends.length > 0 && (
              <Collapsible title={tn(mutualFriends.length, '{count} mutual friend', '{count} mutual friends')}>
                {mutualFriends.map((f) => (
                  <button key={f.id} className="mutual-row" onClick={() => (openDMWithUser(f.id), showMainPane())}>
                    <Avatar user={f} size={32} status={f.status} />
                    <span className="truncate">{f.displayName}</span>
                  </button>
                ))}
              </Collapsible>
            )}
          </div>
        )}
      </ProfileCard>
    </aside>
  );
}
