import { HeaderTools } from '../layout/HeaderTools';
import { Hash, Plus } from 'lucide-react';
import type { ID } from '../../types';
import { useUI, showNavPane } from '../../store/ui';
import { useCanManage } from '../../store/selectors';
import { Button } from '../ui/Button';
import { EmptyArt, EmptyState } from '../ui/misc';
import { IconButton } from '../ui/Button';
import { ArrowLeft } from 'lucide-react';
import { t } from '../../i18n';

export function NoChannelView({ serverId }: { serverId: ID }) {
  const manage = useCanManage(serverId);
  return (
    <div className="chat">
      <header className="view-header">
        <IconButton label={t('Back')} className="mobile-only mobile-back" onClick={showNavPane} tooltip={false}>
          <ArrowLeft />
        </IconButton>
        <HeaderTools />
      </header>
      <EmptyState
        art={<EmptyArt icon={<Hash />} />}
        title={t('No text channels')}
        body={manage ? t('This server has no text channels yet. Create one so your community can talk.') : t('There are no text channels in this server that you can see yet.')}
        action={
          manage && (
            <Button icon={<Plus />} onClick={() => useUI.getState().openModal({ type: 'createChannel', serverId, categoryId: null, channelType: 'text' })}>
              {t('Create channel')}
            </Button>
          )
        }
      />
    </div>
  );
}
