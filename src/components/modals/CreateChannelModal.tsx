import { useState } from 'react';
import { Hash, Megaphone, Volume2 } from 'lucide-react';
import type { ChannelType, ID } from '../../types';
import { useStore } from '../../store/store';
import { useUI, showMainPane } from '../../store/ui';
import { slugifyChannel } from '../../lib/utils';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { RadioCard, SettingRow, Switch, TextField } from '../ui/Field';
import { ChannelIcon } from '../ui/icons';
import { t } from '../../i18n';

export function CreateChannelModal({ serverId, categoryId, channelType = 'text' }: { serverId: ID; categoryId: ID | null; channelType?: ChannelType }) {
  const close = useUI((s) => s.closeModal);
  const category = useStore((s) => s.servers[serverId]?.categories.find((c) => c.id === categoryId));
  const createChannel = useStore((s) => s.createChannel);
  const joinVoice = useStore((s) => s.joinVoice);
  const [type, setType] = useState<ChannelType>(channelType);
  const [name, setName] = useState('');
  const [isPrivate, setPrivate] = useState(false);

  const finalName = type === 'voice' ? name.trim() : slugifyChannel(name.trim());
  const submit = () => {
    if (!finalName) return;
    const id = createChannel(serverId, { name: finalName, type, categoryId, private: isPrivate });
    if (type === 'voice') {
      joinVoice(id);
      useStore.getState().selectChannel(serverId, id);
    }
    close();
    showMainPane();
  };

  return (
    <Modal
      open
      onClose={close}
      size="md"
      title={t('Create channel')}
      description={category ? t('in {name}', { name: category.name }) : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t('Cancel')}
          </Button>
          <Button onClick={submit} disabled={!finalName}>
            {t('Create channel')}
          </Button>
        </>
      }
    >
      <div className="field-label" style={{ marginBottom: 8 }}>
        {t('Channel type')}
      </div>
      <div role="radiogroup" aria-label={t('Channel type')}>
        <RadioCard checked={type === 'text'} onSelect={() => setType('text')} icon={<Hash />} title={t('Text')} description={t('Messages, images, GIFs, emojis, opinions and puns')} />
        <RadioCard checked={type === 'voice'} onSelect={() => setType('voice')} icon={<Volume2 />} title={t('Voice')} description={t('Hang out together – with voice, video and screen share')} />
        <RadioCard checked={type === 'announcement'} onSelect={() => setType('announcement')} icon={<Megaphone />} title={t('Announcements')} description={t('Important news that only selected roles can post in')} />
      </div>
      <div style={{ height: 20 }} />
      <TextField
        label={t('Channel name')}
        value={name}
        maxLength={100}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder={type === 'voice' ? t('New voice channel') : t('new-channel')}
        prefix={<ChannelIcon type={type} size={16} />}
        hint={type !== 'voice' && name && finalName !== name ? t('Will be saved as #{name}', { name: finalName }) : undefined}
      />
      <SettingRow
        title={t('Private channel')}
        description={t('Only selected members and roles can see this channel. (Permissions are enforced with the backend.)')}
        control={<Switch checked={isPrivate} onChange={setPrivate} label={t('Private channel')} />}
      />
    </Modal>
  );
}

export function CreateCategoryModal({ serverId }: { serverId: ID }) {
  const close = useUI((s) => s.closeModal);
  const createCategory = useStore((s) => s.createCategory);
  const [name, setName] = useState('');
  const submit = () => {
    if (!name.trim()) return;
    createCategory(serverId, name.trim());
    close();
  };
  return (
    <Modal
      open
      onClose={close}
      size="sm"
      title={t('Create category')}
      description={t('Categories keep your channel list tidy.')}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t('Cancel')}
          </Button>
          <Button onClick={submit} disabled={!name.trim()}>
            {t('Create category')}
          </Button>
        </>
      }
    >
      <TextField label={t('Category name')} value={name} maxLength={40} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder={t('New category')} />
    </Modal>
  );
}
