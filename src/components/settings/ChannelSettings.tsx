import { Folder, LayoutDashboard, ShieldCheck, Trash, Timer } from 'lucide-react';
import type { ID } from '../../types';
import { useStore } from '../../store/store';
import { useUI, type CategorySettingsSection, type ChannelSettingsSection } from '../../store/ui';
import { slugifyChannel } from '../../lib/utils';
import { Button } from '../ui/Button';
import { SettingRow, Slider, Switch, TextArea, TextField } from '../ui/Field';
import { ChannelIcon } from '../ui/icons';
import { Dropdown } from '../ui/Menu';
import { t, tk, tx } from '../../i18n';
import { SettingsCard, SettingsHeader, SettingsLayout, SettingsSection, type NavGroup } from './SettingsLayout';
import { PermissionEditor } from './PermissionEditor';

const SLOWMODE = [
  { v: 0, label: tk('Off') },
  { v: 5, label: tk('5 seconds') },
  { v: 10, label: tk('10 seconds') },
  { v: 30, label: tk('30 seconds') },
  { v: 60, label: tk('1 minute') },
  { v: 300, label: tk('5 minutes') },
  { v: 900, label: tk('15 minutes') },
];

function Overview({ channelId }: { channelId: ID }) {
  const channel = useStore((s) => s.channels[channelId]);
  const server = useStore((s) => (channel ? s.servers[channel.serverId] : undefined));
  const update = useStore((s) => s.updateChannel);
  if (!channel || !server) return null;
  const isVoice = channel.type === 'voice';

  return (
    <>
      <SettingsHeader title={t('Overview')} description={t('Changes are applied instantly.')} />
      <TextField
        label={t('Channel name')}
        value={channel.name}
        maxLength={100}
        prefix={<ChannelIcon type={channel.type} size={16} />}
        onChange={(e) => update(channelId, { name: isVoice ? e.target.value : slugifyChannel(e.target.value) })}
        onBlur={() => !channel.name.trim() && update(channelId, { name: isVoice ? t('Voice channel') : t('channel') })}
      />
      {!isVoice && (
        <TextArea
          label={t('Channel topic')}
          value={channel.topic ?? ''}
          maxLength={1024}
          showCounter
          rows={3}
          placeholder={t('What is this channel about?')}
          onChange={(e) => update(channelId, { topic: e.target.value || undefined })}
        />
      )}
      {!isVoice && (
        <SettingsSection title={t('Slowmode')} description={t('Members can only post once per interval. Moderators are exempt.')}>
          <Dropdown
            align="start"
            items={SLOWMODE.map((s) => ({ type: 'radio' as const, label: t(s.label), checked: (channel.slowmode ?? 0) === s.v, onSelect: () => update(channelId, { slowmode: s.v || undefined }) }))}
            trigger={
              <button className="select-btn">
                <Timer size={16} />
                <span className="grow">{t(SLOWMODE.find((s) => s.v === (channel.slowmode ?? 0))?.label ?? 'Off')}</span>
              </button>
            }
          />
        </SettingsSection>
      )}
      {isVoice && (
        <SettingsSection
          title={t('User limit · {limit}', { limit: channel.userLimit ? String(channel.userLimit) : t('None') })}
          description={t('Limits how many people can be connected at the same time.')}
        >
          <Slider
            value={channel.userLimit ?? 0}
            min={0}
            max={25}
            onChange={(v) => update(channelId, { userLimit: v || undefined })}
            label={t('User limit')}
            format={(v) => (v ? `${v}` : '∞')}
            marks={[0, 2, 4, 10, 25].map((v) => ({ value: v, label: v ? String(v) : '∞' }))}
          />
        </SettingsSection>
      )}
      <SettingsSection>
        <SettingRow
          title={t('Age-restricted channel')}
          description={t('Users must confirm they are of legal age to see the content.')}
          control={<Switch checked={!!channel.ageRestricted} onChange={(v) => update(channelId, { ageRestricted: v })} label={t('Age-restricted')} />}
        />
        {channel.type !== 'voice' && (
          <SettingRow
            title={t('Announcement channel')}
            description={t('Highlights the channel in the list. Who can post is set under Permissions (“Send messages”).')}
            control={<Switch checked={channel.type === 'announcement'} onChange={(v) => update(channelId, { type: v ? 'announcement' : 'text' })} label={t('Announcement channel')} />}
          />
        )}
      </SettingsSection>
      {channel.type === 'announcement' && (
        <SettingsSection title={t('Who can post?')} description={t('Set “Send messages” per role under Permissions – for example deny it for @everyone and allow it for your team.')}>
          <Button variant="secondary" icon={<ShieldCheck />} onClick={() => useUI.getState().openSettings({ kind: 'channel', channelId, section: 'permissions' })}>
            {t('Open permissions')}
          </Button>
        </SettingsSection>
      )}
    </>
  );
}

function Permissions({ channelId }: { channelId: ID }) {
  return (
    <>
      <SettingsHeader
        title={t('Permissions')}
      />
      <PermissionEditor scope={{ kind: 'channel', channelId }} />
    </>
  );
}

function Danger({ channelId }: { channelId: ID }) {
  const channel = useStore((s) => s.channels[channelId]);
  const deleteChannel = useStore((s) => s.deleteChannel);
  if (!channel) return null;
  return (
    <>
      <SettingsHeader title={t('Delete channel')} />
      <SettingsCard className="danger-card">
        <p>{tx('Deleting {name} removes all messages in it. This cannot be undone.', { name: <strong>{channel.type === 'voice' ? channel.name : `#${channel.name}`}</strong> })}</p>
        <Button
          variant="danger"
          icon={<Trash />}
          onClick={() => {
            useUI.getState().closeSettings();
            deleteChannel(channelId);
          }}
        >
          {t('Delete channel')}
        </Button>
      </SettingsCard>
    </>
  );
}

export function ChannelSettings({ channelId, section }: { channelId: ID; section: ChannelSettingsSection }) {
  const channel = useStore((s) => s.channels[channelId]);
  const ui = useUI.getState();
  if (!channel) return null;
  const groups: NavGroup<ChannelSettingsSection>[] = [
    {
      label: (
        <span className="settings-server-label">
          <ChannelIcon type={channel.type} size={16} />
          <span className="truncate">{channel.name}</span>
        </span>
      ),
      items: [
        { id: 'overview', label: t('Overview'), icon: <LayoutDashboard /> },
        { id: 'permissions', label: t('Permissions'), icon: <ShieldCheck /> },
      ],
    },
    { items: [{ id: 'danger', label: t('Delete channel'), icon: <Trash />, danger: true }] },
  ];
  const content = { overview: <Overview channelId={channelId} />, permissions: <Permissions channelId={channelId} />, danger: <Danger channelId={channelId} /> }[section];
  return (
    <SettingsLayout
      title={`${t('Channel settings')} · ${channel.name}`}
      groups={groups}
      active={section}
      onSelect={(id) => ui.openSettings({ kind: 'channel', channelId, section: id })}
      onClose={ui.closeSettings}
    >
      {content}
    </SettingsLayout>
  );
}

/* ---------------------------------------------------------------- */
/* Category settings                                                  */
/* ---------------------------------------------------------------- */

export function CategorySettings({ serverId, categoryId, section }: { serverId: ID; categoryId: ID; section: CategorySettingsSection }) {
  const category = useStore((s) => s.servers[serverId]?.categories.find((c) => c.id === categoryId));
  const rename = useStore((s) => s.renameCategory);
  const ui = useUI.getState();
  if (!category) return null;
  const groups: NavGroup<CategorySettingsSection>[] = [
    {
      label: (
        <span className="settings-server-label">
          <Folder size={16} />
          <span className="truncate">{category.name}</span>
        </span>
      ),
      items: [
        { id: 'overview', label: t('Overview'), icon: <LayoutDashboard /> },
        { id: 'permissions', label: t('Permissions'), icon: <ShieldCheck /> },
      ],
    },
  ];
  return (
    <SettingsLayout
      title={`${t('Category settings')} · ${category.name}`}
      groups={groups}
      active={section}
      onSelect={(id) => ui.openSettings({ kind: 'category', serverId, categoryId, section: id })}
      onClose={ui.closeSettings}
    >
      {section === 'overview' ? (
        <>
          <SettingsHeader title={t('Overview')} description={t('Changes are applied instantly.')} />
          <TextField
            label={t('Category name')}
            value={category.name}
            maxLength={40}
            onChange={(e) => rename(serverId, categoryId, e.target.value)}
            onBlur={() => !category.name.trim() && rename(serverId, categoryId, t('Category'))}
          />
        </>
      ) : (
        <>
          <SettingsHeader title={t('Category permissions')} description={t('Every channel in this category inherits these settings. A channel can still set single permissions differently.')} />
          <PermissionEditor scope={{ kind: 'category', serverId, categoryId }} />
        </>
      )}
    </SettingsLayout>
  );
}
