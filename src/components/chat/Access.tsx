import { HeaderTools } from '../layout/HeaderTools';
/**
 * Channel access: the "View server as role" banner and the screen shown when
 * a channel cannot be seen (hidden channel, or a preview without access).
 */
import { ArrowLeft, Eye, EyeOff, X } from 'lucide-react';
import type { ID } from '../../types';
import { useStore } from '../../store/store';
import { showNavPane } from '../../store/ui';
import { t } from '../../i18n';
import { Button, IconButton } from '../ui/Button';
import { SearchPicker } from '../ui/SearchPicker';
import { EmptyArt, EmptyState } from '../ui/misc';

/** Shown above the content while previewing a server with other roles. */
export function ViewAsBanner({ serverId }: { serverId: ID }) {
  const viewAs = useStore((s) => (s.viewAs?.serverId === serverId ? s.viewAs : null));
  const server = useStore((s) => s.servers[serverId]);
  const setViewAs = useStore((s) => s.setViewAs);
  if (!viewAs || !server) return null;
  const roles = [...server.roles].filter((r) => !r.isDefault).sort((a, b) => b.position - a.position);
  const names = viewAs.roleIds.map((id) => server.roles.find((r) => r.id === id)?.name).filter(Boolean);
  return (
    <div className="viewas" role="status">
      <Eye size={18} className="viewas-icon" />
      <div className="viewas-text">
        <strong>{t('Viewing the server as a role')}</strong>
        <span className="truncate">{names.length ? `@everyone + ${names.join(', ')}` : t('@everyone only')}</span>
      </div>
      <SearchPicker
        multi
        align="end"
        placeholder={t('Search roles')}
        options={roles.map((r) => ({ id: r.id, label: r.name, checked: viewAs.roleIds.includes(r.id), icon: <span className="role-dot" style={{ background: r.color ?? '#94a3b8' }} /> }))}
        onSelect={(id) => setViewAs({ serverId, roleIds: viewAs.roleIds.includes(id) ? viewAs.roleIds.filter((x) => x !== id) : [...viewAs.roleIds, id] })}
        trigger={
          <Button size="sm" variant="secondary">
            {t('Change roles')}
          </Button>
        }
      />
      <IconButton label={t('Stop preview')} size="sm" onClick={() => setViewAs(null)}>
        <X />
      </IconButton>
    </div>
  );
}

export function NoAccessView({ channelId }: { channelId: ID }) {
  const channel = useStore((s) => s.channels[channelId]);
  const previewing = useStore((s) => !!channel && s.viewAs?.serverId === channel.serverId);
  return (
    <div className="page-view no-access">
      <header className="view-header">
        <IconButton label={t('Back to navigation')} className="mobile-only mobile-back" onClick={showNavPane} tooltip={false}>
          <ArrowLeft />
        </IconButton>
        <div className="view-header-title">
          <EyeOff size={20} className="vh-icon" />
          <h1>{t('No access')}</h1>
        </div>
        <HeaderTools />
      </header>
      <EmptyState
        art={<EmptyArt icon={<EyeOff />} />}
        title={t('You can’t see this channel')}
        body={previewing ? t('The roles you are previewing don’t have “View channel” here.') : t('The server’s permissions hide this channel from you.')}
        action={
          previewing ? (
            <Button variant="secondary" onClick={() => useStore.getState().setViewAs(null)}>
              {t('Stop preview')}
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}
