import {DirectorySettings} from './DirectorySettings';
import {PromotionSettings} from './PromotionSettings';
import { ServerTagSettings } from './CommunitySettings';
import { inviteUrl } from '../../lib/invites';
import { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Award,
  Camera,
  Eye,
  ShieldCheck,
  Check,
  Copy,
  Crown,
  FolderPlus,
  Hash,
  LayoutDashboard,
  Link2,
  Pencil,
  Plus,
  Search,
  Settings,
  Sparkles,
  Shield,
  FaceSlightlySmiling as Smile,
  Trash,
  Upload,
  UserX,
  Users,
  ChevronRight,
  Gavel,
  X,
} from 'lucide-react';
import type { ID, Permission, Role } from '../../types';
import { sortedChannels, useStore } from '../../store/store';
import { useUI, toast, type ServerSettingsSection } from '../../store/ui';
import { canServer, memberDisplayName, memberRoles } from '../../store/selectors';
import { isPrivateChannel } from '../../lib/permissions';
import { SearchPicker } from '../ui/SearchPicker';

import { ROLE_COLORS } from '../../data/art';
import { itemsOf } from '../../data/cosmetics';
import { locale, t, tk, tn, tx } from '../../i18n';
import { prepareProfileImage, pickFile, UploadError } from '../../lib/image';
import { cn, copyText, formatNumber, formatRelative, formatShortDate } from '../../lib/utils';
import { Avatar } from '../ui/Avatar';
import { Banner } from '../ui/Banner';
import { Button, IconButton } from '../ui/Button';
import { SettingRow, Switch, TextArea, TextField } from '../ui/Field';
import { ChannelIcon, FreeTag } from '../ui/icons';
import { Dropdown } from '../ui/Menu';
import { EmptyArt, EmptyState } from '../ui/misc';
import { Tooltip } from '../ui/Tooltip';
import { ColorPicker } from '../ui/ColorPicker';
import { ServerIcon } from '../layout/ServerRail';
import { SettingsCard, SettingsHeader, SettingsLayout, SettingsSection, type NavGroup } from './SettingsLayout';
import { CLOUD } from '../../backend/config';

/* ---------------------------------------------------------------- */
/* Overview                                                           */
/* ---------------------------------------------------------------- */

function Overview({ serverId }: { serverId: ID }) {
  const server = useStore((s) => s.servers[serverId]);
  const channels = useStore((s) => s.channels);
  const update = useStore((s) => s.updateServer);
  const textChannels = useMemo(() => sortedChannels(channels, serverId).filter((c) => c.type !== 'voice'), [channels, serverId]);

  const uploadIcon = async () => {
    const [file] = await pickFile('image/*');
    if (!file) return;
    try {
      const img = await prepareProfileImage(file, 'icon');
      update(serverId, { icon: img.src });
    } catch (e) {
      toast({ tone: 'danger', title: t('Icon not applied'), body: e instanceof UploadError ? e.message : undefined });
    }
  };

  const uploadBanner = async () => {
    const [file] = await pickFile('image/*');
    if (!file) return;
    try {
      const img = await prepareProfileImage(file, 'banner');
      update(serverId, { banner: { kind: 'image', src: img.src, poster: img.poster, animated: img.animated } });
    } catch (e) {
      toast({ tone: 'danger', title: t('Banner not applied'), body: e instanceof UploadError ? e.message : undefined });
    }
  };

  if (!server) return null;
  const system = server.systemChannelId ? channels[server.systemChannelId] : undefined;
  return (
    <>
      <SettingsHeader title={t('Server overview')} description={t('Changes are applied instantly.')} />
      <div className="server-overview">
        <div className="server-icon-edit">
          <button className="server-icon-btn" onClick={uploadIcon} aria-label={t('Change server icon')}>
            <ServerIcon server={server} size={96} />
            <span className="server-icon-hover">
              <Camera size={20} />
              {t('Change')}
            </span>
          </button>
          {server.icon && (
            <button className="btn btn-link btn-sm" onClick={() => update(serverId, { icon: undefined })}>
              {t('Remove')}
            </button>
          )}
          <span className="field-hint">{t('At least 128 × 128 px recommended.')}</span>
        </div>
        <div className="grow">
          <TextField
            label={t('Server name')}
            value={server.name}
            maxLength={100}
            onChange={(e) => update(serverId, { name: e.target.value })}
            onBlur={() => !server.name.trim() && update(serverId, { name: t('New server') })}
          />
          <TextArea
            label={t('Description')}
            value={server.description ?? ''}
            maxLength={240}
            showCounter
            rows={3}
            placeholder={t('What is your server about?')}
            onChange={(e) => update(serverId, { description: e.target.value || undefined })}
          />
        </div>
      </div>
      <SettingsSection title={t('Server banner')} tag={<FreeTag />} description={t('Appears at the top of the channel list. Animated banners are free on ONYX – no boosts needed.')}>
        <div className="row-actions">
          <Button icon={<Upload />} onClick={uploadBanner}>
            {t('Upload banner')}
          </Button>
          {server.banner && (
            <Button variant="ghost" icon={<Trash />} onClick={() => update(serverId, { banner: undefined })}>
              {t('Remove')}
            </Button>
          )}
        </div>
        <div className="preset-grid preset-banners">
          {itemsOf('banner')
            .filter((b) => b.collection === 'essentials')
            .map((b) => {
              const active = server.banner?.kind === 'preset' && server.banner.id === b.id;
              return (
                <button key={b.id} className={cn('preset preset-banner anim-host', active && 'is-active')} onClick={() => update(serverId, { banner: { kind: 'preset', id: b.id } })}>
                  <Banner source={{ kind: 'preset', id: b.id }} />
                  <span className="preset-banner-label">
                    {t(b.name)}
                    {b.animated && <span className="anim-badge">{t('Animated')}</span>}
                  </span>
                  {active && (
                    <span className="preset-check">
                      <Check size={12} strokeWidth={3} />
                    </span>
                  )}
                </button>
              );
            })}
        </div>
      </SettingsSection>
      <SettingsSection title={t('System messages')} description={t('ONYX welcomes new members in this channel.')}>
        <Dropdown
          align="start"
          items={textChannels.map((c) => ({ type: 'radio' as const, label: `#${c.name}`, checked: c.id === server.systemChannelId, onSelect: () => update(serverId, { systemChannelId: c.id }) }))}
          trigger={
            <button className="select-btn">
              <Hash size={16} />
              <span className="grow truncate">{system ? system.name : t('No channel')}</span>
            </button>
          }
        />
      </SettingsSection>
    </>
  );
}

/* ---------------------------------------------------------------- */
/* Roles                                                              */
/* ---------------------------------------------------------------- */

const PERMISSIONS: { group: string; items: { id: Permission; label: string; desc: string }[] }[] = [
  {
    group: tk('General'),
    items: [
      { id: 'administrator', label: tk('Administrator'), desc: tk('All permissions. Only give this to people you trust.') },
      { id: 'viewChannel', label: tk('View channels'), desc: tk('See channels by default. Private channels can still hide themselves.') },
      { id: 'manageServer', label: tk('Manage server'), desc: tk('Change name, icon, banner and description.') },
      { id: 'manageChannels', label: tk('Manage channels'), desc: tk('Create, edit and delete channels.') },
      { id: 'manageRoles', label: tk('Manage roles & permissions'), desc: tk('Create, edit and assign roles and change channel permissions.') },
      { id: 'manageBadges', label: tk('Manage server badges'), desc: tk('Create, edit and award this server’s badges.') },
      { id: 'createInvites', label: tk('Create invites'), desc: tk('Invite new members.') },
    ],
  },
  {
    group: tk('Members'),
    items: [
      { id: 'kickMembers', label: tk('Kick members'), desc: tk('Remove members from the server.') },
      { id: 'banMembers', label: tk('Ban members'), desc: tk('Remove members for good – they can’t rejoin until someone unbans them.') },
    ],
  },
  {
    group: tk('Text'),
    items: [
      { id: 'sendMessages', label: tk('Send messages'), desc: tk('Write in text channels.') },
      { id: 'readHistory', label: tk('Read message history'), desc: tk('See messages that were sent before opening a channel.') },
      { id: 'attachFiles', label: tk('Attach files'), desc: tk('Upload images and files.') },
      { id: 'sendVoiceMessages', label: tk('Send voice messages'), desc: tk('Record and send voice messages.') },
      { id: 'addReactions', label: tk('Add reactions'), desc: tk('React to messages with emojis.') },
      { id: 'mentionEveryone', label: tk('Mention @everyone'), desc: tk('Notify all members or everyone with a role at once.') },
      { id: 'manageMessages', label: tk('Manage messages'), desc: tk('Delete and pin other people’s messages.') },
    ],
  },
  {
    group: tk('Voice'),
    items: [
      { id: 'connect', label: tk('Connect'), desc: tk('Join voice channels.') },
      { id: 'speak', label: tk('Speak'), desc: tk('Talk in voice channels.') },
      { id: 'video', label: tk('Video'), desc: tk('Turn on the camera in voice channels.') },
      { id: 'screenShare', label: tk('Share screen'), desc: tk('Share the screen, a window or a browser tab.') },
    ],
  },
  {
    group: tk('Voice moderation'),
    items: [
      { id: 'muteMembers', label: tk('Mute members'), desc: tk('Server-mute others in voice channels (only members below your highest role).') },
      { id: 'deafenMembers', label: tk('Deafen members'), desc: tk('Server-deafen others in voice channels, so they hear nothing.') },
      { id: 'moveMembers', label: tk('Move members'), desc: tk('Disconnect others from voice channels or move them – also into full channels.') },
    ],
  },
];

/** Preview the server with exactly this role (and @everyone). */
function viewServerAs(serverId: ID, role: Role) {
  const store = useStore.getState();
  useUI.getState().closeSettings();
  store.selectServer(serverId);
  store.setViewAs({ serverId, roleIds: role.isDefault ? [] : [role.id] });
}

function RoleEditor({ serverId, role }: { serverId: ID; role: Role }) {
  const [tab, setTab] = useState<'look' | 'perms' | 'members'>('look');
  const server = useStore((s) => s.servers[serverId]);
  const users = useStore((s) => s.users);
  const { updateRole, deleteRole, toggleMemberRole } = useStore.getState();
  const members = Object.values(server.members).filter((m) => m.roleIds.includes(role.id));
  const nonMembers = Object.values(server.members).filter((m) => !m.roleIds.includes(role.id));

  return (
    <div className="role-editor">
      <div className="role-editor-head">
        <h3>
          <span className="role-dot lg" style={{ background: role.color ?? '#94a3b8' }} />
          <span className="truncate">{role.name}</span>
        </h3>
        <span className="row-actions">
          <Button size="sm" variant="secondary" icon={<Eye />} onClick={() => viewServerAs(serverId, role)}>
            {t('View server as role')}
          </Button>
          {!role.isDefault && (
            <IconButton
              label={t('Delete role')}
              danger
              onClick={() =>
                useUI.getState().openModal({
                  type: 'confirm',
                  title: t('Delete role “{name}”', { name: role.name }),
                  body: t('The role is removed from all members.'),
                  confirmLabel: t('Delete'),
                  danger: true,
                  onConfirm: () => deleteRole(serverId, role.id),
                })
              }
            >
              <Trash />
            </IconButton>
          )}
        </span>
      </div>
      <nav className="mini-tabs">
        <button className={cn(tab === 'look' && 'is-active')} onClick={() => setTab('look')}>
          {t('Display')}
        </button>
        <button className={cn(tab === 'perms' && 'is-active')} onClick={() => setTab('perms')}>
          {t('Permissions')}
        </button>
        {!role.isDefault && (
          <button className={cn(tab === 'members' && 'is-active')} onClick={() => setTab('members')}>
            {t('Members ({count})', { count: members.length })}
          </button>
        )}
      </nav>
      {tab === 'look' && (
        <>
          <TextField label={t('Role name')} value={role.name} disabled={role.isDefault} maxLength={32} onChange={(e) => updateRole(serverId, role.id, { name: e.target.value })} />
          {!role.isDefault && (
            <>
              <div className="field" style={{ marginTop: 18 }}>
                <span className="field-label">{t('Role color')}</span>
                <div className="color-swatches">
                  <Tooltip content={t('No color')}>
                    <button className={cn('color-swatch is-none', !role.color && 'is-active')} onClick={() => updateRole(serverId, role.id, { color: null })} aria-label={t('No color')} />
                  </Tooltip>
                  {ROLE_COLORS.map((c) => (
                    <button
                      key={c}
                      className={cn('color-swatch', role.color === c && 'is-active')}
                      style={{ background: c }}
                      onClick={() => updateRole(serverId, role.id, { color: c })}
                      aria-label={c}
                    >
                      {role.color === c && <Check size={14} strokeWidth={3} />}
                    </button>
                  ))}
                  <ColorPicker
                    value={role.color ?? '#94a3b8'}
                    onChange={(v) => updateRole(serverId, role.id, { color: v })}
                    label={t('Custom color')}
                    presets={ROLE_COLORS}
                    trigger={
                      <button
                        className={cn('color-swatch is-custom', role.color && !ROLE_COLORS.includes(role.color) && 'is-active')}
                        style={role.color && !ROLE_COLORS.includes(role.color) ? { background: role.color } : undefined}
                        aria-label={t('Custom color')}
                      >
                        <Pencil size={13} />
                      </button>
                    }
                  />
                </div>
              </div>
              <SettingRow
                title={t('Display role members separately')}
                description={t('Members with this role appear in their own group in the member list.')}
                control={<Switch checked={role.hoist} onChange={(v) => updateRole(serverId, role.id, { hoist: v })} label={t('Display separately')} />}
              />
            </>
          )}
          <div className="role-preview">
            <span className="field-label">{t('Preview')}</span>
            <div className="role-preview-msg">
              <Avatar user={users[useStore.getState().meId]} size={32} />
              <div>
                <span style={{ color: role.color ?? undefined, fontWeight: 650 }}>{users[useStore.getState().meId].displayName}</span>
                <span className="role-preview-text">{t('This is how a name with this role looks.')}</span>
              </div>
            </div>
          </div>
        </>
      )}
      {tab === 'perms' && (
        <div className="perm-list">
          {PERMISSIONS.map((g) => (
            <div key={g.group}>
              <h4 className="perm-group">{t(g.group)}</h4>
              {g.items.map((p) => (
                <SettingRow
                  key={p.id}
                  title={t(p.label)}
                  description={t(p.desc)}
                  control={
                    <Switch
                      checked={role.permissions.includes(p.id)}
                      onChange={(v) => updateRole(serverId, role.id, { permissions: v ? [...role.permissions, p.id] : role.permissions.filter((x) => x !== p.id) })}
                      label={t(p.label)}
                    />
                  }
                />
              ))}
            </div>
          ))}
        </div>
      )}
      {tab === 'members' && (
        <div>
          <Dropdown
            align="start"
            items={nonMembers.slice(0, 30).map((m) => ({
              label: memberDisplayName({ servers: { [serverId]: server }, users }, m.userId, serverId),
              icon: <Avatar user={users[m.userId]} size={18} />,
              onSelect: () => toggleMemberRole(serverId, m.userId, role.id),
            }))}
            trigger={
              <Button variant="secondary" size="sm" icon={<Plus />}>
                {t('Add members')}
              </Button>
            }
          />
          <div className="role-members">
            {members.length === 0 && <div className="invite-empty">{t('Nobody has this role yet.')}</div>}
            {members.map((m) => (
              <div key={m.userId} className="role-member">
                <Avatar user={users[m.userId]} size={28} />
                <span className="grow truncate">{memberDisplayName({ servers: { [serverId]: server }, users }, m.userId, serverId)}</span>
                <IconButton label={t('Remove role')} size="sm" onClick={() => toggleMemberRole(serverId, m.userId, role.id)}>
                  <X />
                </IconButton>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Roles({ serverId, initialRole }: { serverId: ID; initialRole?: ID }) {
  const server = useStore((s) => s.servers[serverId]);
  const { createRole, moveRole } = useStore.getState();
  const roles = useMemo(() => [...server.roles].sort((a, b) => b.position - a.position), [server.roles]);
  const [selected, setSelected] = useState<ID>(initialRole ?? roles.find((r) => !r.isDefault)?.id ?? roles[0]?.id);
  const role = roles.find((r) => r.id === selected) ?? roles[0];
  const counts = (id: ID) => Object.values(server.members).filter((m) => m.roleIds.includes(id)).length;

  return (
    <>
      <SettingsHeader title={t('Roles')} description={t('Roles bundle permissions and give members color. Higher roles are listed further up.')} />
      <div className="roles-layout">
        <div className="roles-list">
          <Button
            size="sm"
            block
            icon={<Plus />}
            onClick={() => {
              const id = createRole(serverId);
              setSelected(id);
            }}
          >
            {t('Create role')}
          </Button>
          <div className="roles-items">
            {roles.map((r, i) => (
              <div key={r.id} className={cn('role-item', r.id === role?.id && 'is-active')}>
                <button className="role-item-main" onClick={() => setSelected(r.id)}>
                  <span className="role-dot" style={{ background: r.color ?? '#94a3b8' }} />
                  <span className="grow truncate">{r.name}</span>
                  <span className="role-count">{r.isDefault ? Object.keys(server.members).length : counts(r.id)}</span>
                </button>
                {!r.isDefault && (
                  <span className="role-move">
                    <button disabled={i === 0} onClick={() => moveRole(serverId, r.id, -1)} aria-label={t('Move up')}>
                      <ArrowUp size={13} />
                    </button>
                    <button disabled={i >= roles.length - 2} onClick={() => moveRole(serverId, r.id, 1)} aria-label={t('Move down')}>
                      <ArrowDown size={13} />
                    </button>
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
        {role && <RoleEditor key={role.id} serverId={serverId} role={role} />}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- */
/* Emojis                                                             */
/* ---------------------------------------------------------------- */

function Emojis({ serverId }: { serverId: ID }) {
  const server = useStore((s) => s.servers[serverId]);
  const { addEmoji, removeEmoji, renameEmoji } = useStore.getState();
  const upload = async () => {
    const files = await pickFile('image/png,image/gif,image/webp,image/jpeg', true);
    for (const file of files) {
      try {
        const img = await prepareProfileImage(file, 'emoji');
        const base =
          file.name
            .replace(/\.[^.]+$/, '')
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, '_')
            .slice(0, 32) || 'emoji';
        addEmoji(serverId, { name: base, src: img.src, animated: img.animated });
      } catch (e) {
        toast({ tone: 'danger', title: t('Emoji not added'), body: e instanceof UploadError ? e.message : file.name });
      }
    }
  };
  return (
    <>
      <SettingsHeader title={t('Emojis')} tag={<FreeTag />} description={t('Every member can use custom emojis in all servers on ONYX – animated ones too, no subscription.')} />
      <div className="row-actions">
        <Button icon={<Upload />} onClick={upload}>
          {t('Upload emoji')}
        </Button>
        <span className="field-hint">{t('PNG, GIF or WebP · resized to 128 px · use it in chat with :name:')}</span>
      </div>
      {server.emojis.length === 0 ? (
        <EmptyState compact art={<EmptyArt icon={<Smile />} />} title={t('No emojis yet')} body={t('Upload images to create custom emojis for your community.')} />
      ) : (
        <div className="emoji-table">
          <div className="emoji-row emoji-head">
            <span>{t('Image')}</span>
            <span>{t('Name')}</span>
            <span />
          </div>
          {server.emojis.map((e) => (
            <div key={e.id} className="emoji-row">
              <img src={e.src} alt="" />
              <input className="emoji-name" value={e.name} onChange={(ev) => renameEmoji(serverId, e.id, ev.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 32))} aria-label={t('Emoji name')} />
              <IconButton label={t('Remove emoji')} size="sm" danger onClick={() => removeEmoji(serverId, e.id)}>
                <Trash />
              </IconButton>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- */
/* Channels                                                           */
/* ---------------------------------------------------------------- */

function Channels({ serverId }: { serverId: ID }) {
  const server = useStore((s) => s.servers[serverId]);
  const channels = useStore((s) => s.channels);
  const { moveChannel, moveCategory, renameCategory, updateChannel } = useStore.getState();
  const ui = useUI.getState();
  const cats = [...server.categories].sort((a, b) => a.position - b.position);
  const all = sortedChannels(channels, serverId);
  const groups = [{ id: null as ID | null, name: t('No category') }, ...cats.map((c) => ({ id: c.id as ID | null, name: c.name }))];

  return (
    <>
      <SettingsHeader title={t('Channels')} description={t('Arrange channels and categories, rename them or open channel settings.')} />
      <div className="row-actions">
        <Button icon={<Plus />} onClick={() => ui.openModal({ type: 'createChannel', serverId, categoryId: null })}>
          {t('Create channel')}
        </Button>
        <Button variant="secondary" icon={<FolderPlus />} onClick={() => ui.openModal({ type: 'createCategory', serverId })}>
          {t('Create category')}
        </Button>
      </div>
      <div className="channel-admin">
        {groups.map((g, gi) => {
          const list = all.filter((c) => c.categoryId === g.id);
          if (g.id === null && list.length === 0) return null;
          return (
            <div key={g.id ?? 'none'} className="ca-group">
              <div className="ca-cat">
                <span className="grow truncate">{g.name}</span>
                {g.id && (
                  <>
                    <IconButton label={t('Move up')} size="sm" disabled={gi <= 1} onClick={() => moveCategory(serverId, g.id!, -1)}>
                      <ArrowUp />
                    </IconButton>
                    <IconButton label={t('Move down')} size="sm" disabled={gi >= groups.length - 1} onClick={() => moveCategory(serverId, g.id!, 1)}>
                      <ArrowDown />
                    </IconButton>
                    <IconButton label={t('Category permissions')} size="sm" onClick={() => ui.openSettings({ kind: 'category', serverId, categoryId: g.id!, section: 'permissions' })}>
                      <ShieldCheck />
                    </IconButton>
                    <IconButton
                      label={t('Rename')}
                      size="sm"
                      onClick={() =>
                        ui.openModal({
                          type: 'prompt',
                          title: t('Rename category'),
                          label: t('Name'),
                          initial: g.name,
                          maxLength: 40,
                          onSubmit: (v) => v.trim() && renameCategory(serverId, g.id!, v.trim()),
                        })
                      }
                    >
                      <Pencil />
                    </IconButton>
                  </>
                )}
              </div>
              {list.map((c, i) => (
                <div key={c.id} className="ca-channel">
                  <ChannelIcon type={c.type} size={18} isPrivate={isPrivateChannel(server, c)} />
                  <span className="grow truncate">{c.name}</span>
                  <IconButton label={t('Move up')} size="sm" disabled={i === 0} onClick={() => moveChannel(c.id, -1)}>
                    <ArrowUp />
                  </IconButton>
                  <IconButton label={t('Move down')} size="sm" disabled={i === list.length - 1} onClick={() => moveChannel(c.id, 1)}>
                    <ArrowDown />
                  </IconButton>
                  <Dropdown
                    align="end"
                    items={[
                      { label: t('No category'), onSelect: () => updateChannel(c.id, { categoryId: null, position: 999 }) },
                      ...cats.map((k) => ({ label: k.name, onSelect: () => updateChannel(c.id, { categoryId: k.id, position: 999 }) })),
                    ]}
                    trigger={
                      <button className="icon-btn icon-btn-sm" aria-label={t('Change category')}>
                        <ChevronRight />
                      </button>
                    }
                  />
                  <IconButton label={t('Channel permissions')} size="sm" onClick={() => ui.openSettings({ kind: 'channel', channelId: c.id, section: 'permissions' })}>
                    <ShieldCheck />
                  </IconButton>
                  <IconButton label={t('Channel settings')} size="sm" onClick={() => ui.openSettings({ kind: 'channel', channelId: c.id, section: 'overview' })}>
                    <Settings />
                  </IconButton>
                </div>
              ))}
              {list.length === 0 && <div className="ca-empty">{t('No channels in this category')}</div>}
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- */
/* Members                                                            */
/* ---------------------------------------------------------------- */

/** Asks before handing the server to another member (Members list and Danger section). */
function confirmTransfer(serverId: ID, userId: ID) {
  const s = useStore.getState();
  const server = s.servers[serverId];
  if (!server) return;
  const name = memberDisplayName(s, userId, serverId);
  useUI.getState().openModal({
    type: 'confirm',
    title: t('Transfer {server} to {name}?', { server: server.name, name }),
    body: t('{name} becomes the owner and gets every permission. You stay a member, but only the new owner can give the server back to you.', { name }),
    confirmLabel: t('Transfer ownership'),
    danger: true,
    onConfirm: () => {
      s.transferServer(serverId, userId);
      toast({ tone: 'success', title: t('{name} now owns {server}', { name, server: server.name }) });
    },
  });
}

function Members({ serverId }: { serverId: ID }) {
  const server = useStore((s) => s.servers[serverId]);
  const users = useStore((s) => s.users);
  const meId = useStore((s) => s.meId);
  const { toggleMemberRole, kickMember } = useStore.getState();
  const canBan = useStore((s) => canServer(s, serverId, 'banMembers'));
  const [query, setQuery] = useState('');
  const roles = [...server.roles].filter((r) => !r.isDefault).sort((a, b) => b.position - a.position);
  const list = Object.values(server.members)
    .filter((m) => {
      const u = users[m.userId];
      const q = query.toLowerCase();
      return u && (!q || u.displayName.toLowerCase().includes(q) || u.username.includes(q));
    })
    .sort((a, b) => (users[a.userId]?.displayName ?? '').localeCompare(users[b.userId]?.displayName ?? '', locale()));

  return (
    <>
      <SettingsHeader title={t('Members')} description={tn(Object.keys(server.members).length, '{count} member in {name}.', '{count} members in {name}.', { name: server.name })} />
      <div className="settings-search">
        <Search size={16} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Search members')} aria-label={t('Search members')} />
      </div>
      <div className="member-table">
        {list.map((m) => {
          const u = users[m.userId];
          const mRoles = memberRoles(server, m.userId);
          const isOwner = server.ownerId === m.userId;
          return (
            <div key={m.userId} className="mt-row">
              <Avatar user={u} size={36} status={u.status} />
              <div className="mt-name">
                <strong className="truncate">{memberDisplayName({ servers: { [serverId]: server }, users }, m.userId, serverId)}</strong>
                <span className="truncate">
                  {u.username} · {t('joined {date}', { date: formatShortDate(m.joinedAt) })}
                </span>
              </div>
              <div className="mt-roles">
                {mRoles.slice(0, 3).map((r) => (
                  <span key={r.id} className="role-chip">
                    <span className="role-dot" style={{ background: r.color ?? '#94a3b8' }} />
                    {r.name}
                  </span>
                ))}
                {mRoles.length > 3 && <span className="role-chip">+{mRoles.length - 3}</span>}
              </div>
              <Dropdown
                align="end"
                items={[
                  { type: 'label', label: t('Roles') },
                  ...roles.map((r) => ({
                    type: 'check' as const,
                    label: r.name,
                    color: r.color ?? '#94a3b8',
                    checked: m.roleIds.includes(r.id),
                    keepOpen: true,
                    onSelect: () => toggleMemberRole(serverId, m.userId, r.id),
                  })),
                  !isOwner && m.userId !== meId && { type: 'separator' as const },
                  server.ownerId === meId &&
                    m.userId !== meId && {
                      label: t('Transfer ownership'),
                      icon: <Crown />,
                      onSelect: () => confirmTransfer(serverId, m.userId),
                    },
                  !isOwner &&
                    m.userId !== meId && {
                      label: t('Kick'),
                      icon: <UserX />,
                      danger: true,
                      onSelect: () =>
                        useUI.getState().openModal({
                          type: 'confirm',
                          title: t('Kick {name}', { name: u.displayName }),
                          body: t('The member is removed from the server.'),
                          confirmLabel: t('Kick'),
                          danger: true,
                          onConfirm: () => kickMember(serverId, m.userId),
                        }),
                    },
                  !isOwner &&
                    m.userId !== meId &&
                    canBan && {
                      label: t('Ban'),
                      icon: <Gavel />,
                      danger: true,
                      onSelect: () => useUI.getState().openModal({ type: 'ban', serverId, userId: m.userId }),
                    },
                ]}
                trigger={
                  <Button variant="secondary" size="sm">
                    {t('Manage')}
                  </Button>
                }
              />
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- */
/* Bans                                                               */
/* ---------------------------------------------------------------- */

function Bans({ serverId }: { serverId: ID }) {
  const server = useStore((s) => s.servers[serverId]);
  const users = useStore((s) => s.users);
  const unban = useStore((s) => s.unbanMember);
  const [query, setQuery] = useState('');
  const bans = server.bans ?? [];
  const q = query.trim().toLowerCase();
  const list = bans.filter((b) => {
    const u = users[b.userId];
    return !q || u?.displayName.toLowerCase().includes(q) || u?.username.includes(q) || b.reason?.toLowerCase().includes(q);
  });

  return (
    <>
      <SettingsHeader title={t('Bans')} description={t('Banned people can’t rejoin – not even with an invite – until someone unbans them.')} />
      {bans.length > 0 && (
        <div className="settings-search">
          <Search size={16} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Search bans')} aria-label={t('Search bans')} />
        </div>
      )}
      {bans.length === 0 ? (
        <EmptyState compact art={<EmptyArt icon={<Gavel />} />} title={t('No bans')} body={t('Nobody is banned from this server.')} />
      ) : (
        <div className="member-table">
          {list.map((b) => {
            const u = users[b.userId];
            const by = b.bannedBy ? users[b.bannedBy] : undefined;
            const name = u?.displayName ?? t('Unknown account');
            return (
              <div key={b.userId} className="mt-row ban-row">
                <Avatar user={u} size={36} />
                <div className="mt-name">
                  <strong className="truncate">{name}</strong>
                  <span className="truncate">
                    {by ? t('Banned by {name} · {date}', { name: by.displayName, date: formatShortDate(b.createdAt) }) : t('Banned · {date}', { date: formatShortDate(b.createdAt) })}
                  </span>
                </div>
                <div className="ban-reason">{b.reason ? <span>{b.reason}</span> : <span className="muted">{t('No reason given')}</span>}</div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    useUI.getState().openModal({
                      type: 'confirm',
                      title: t('Unban {name}', { name }),
                      body: t('{name} can rejoin {server} with an invite again.', { name, server: server.name }),
                      confirmLabel: t('Unban'),
                      onConfirm: () => unban(serverId, b.userId),
                    })
                  }
                >
                  {t('Unban')}
                </Button>
              </div>
            );
          })}
          {list.length === 0 && <div className="ca-empty">{t('No results')}</div>}
        </div>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- */
/* Invites                                                            */
/* ---------------------------------------------------------------- */

function Invites({ serverId }: { serverId: ID }) {
  const server = useStore((s) => s.servers[serverId]);
  const users = useStore((s) => s.users);
  const channels = useStore((s) => s.channels);
  const revoke = useStore((s) => s.revokeInvite);
  return (
    <>
      <SettingsHeader title={t('Invites')} />
      <div className="row-actions">
        <Button icon={<Link2 />} onClick={() => useUI.getState().openModal({ type: 'invite', serverId })}>
          {t('Create invite')}
        </Button>
      </div>
      {server.invites.length === 0 ? (
        <EmptyState compact art={<EmptyArt icon={<Link2 />} />} title={t('No active invites')} body={t('Create a link to invite friends.')} />
      ) : (
        <div className="invite-table">
          <div className="it-row it-head">
            <span>{t('Invite')}</span>
            <span>{t('Created by')}</span>
            <span>{t('Uses')}</span>
            <span>{t('Expires')}</span>
            <span />
          </div>
          {server.invites.map((inv) => (
            <div key={inv.code} className="it-row">
              <span className="it-code">
                <code>{inv.code}</code>
                <span className="muted">#{channels[inv.channelId]?.name ?? t('channel')}</span>
              </span>
              <span className="it-user">
                <Avatar user={users[inv.inviterId]} size={20} />
                <span className="truncate">{users[inv.inviterId]?.displayName}</span>
              </span>
              <span className="tnum">
                {formatNumber(inv.uses)}
                {inv.maxUses ? ` / ${inv.maxUses}` : ''}
              </span>
              <span>{inv.expiresAt ? formatRelative(inv.expiresAt) : t('Never')}</span>
              <span className="it-actions">
                <IconButton label={t('Copy link')} size="sm" onClick={() => copyText(inviteUrl(inv.code)).then(() => toast({ title: t('Link copied') }))}>
                  <Copy />
                </IconButton>
                <IconButton label={t('Revoke invite')} size="sm" danger onClick={() => revoke(serverId, inv.code)}>
                  <X />
                </IconButton>
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- */
/* Danger                                                             */
/* ---------------------------------------------------------------- */

function Danger({ serverId }: { serverId: ID }) {
  const server = useStore((s) => s.servers[serverId]);
  const isOwner = useStore((s) => s.servers[serverId]?.ownerId === s.meId);
  const users = useStore((s) => s.users);
  const meId = useStore((s) => s.meId);
  if (!server) return null;
  const dangerCard = <DangerCard serverId={serverId} isOwner={isOwner} />;
  const candidates = Object.values(server.members)
    .filter((m) => m.userId !== meId && users[m.userId])
    .map((m) => ({
      id: m.userId,
      label: memberDisplayName({ servers: { [serverId]: server }, users }, m.userId, serverId),
      hint: users[m.userId].username,
      icon: <Avatar user={users[m.userId]} size={20} />,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, locale()));
  return (
    <>
      <SettingsHeader title={isOwner ? t('Transfer or delete server') : t('Leave server')} />
      {isOwner && (
        <SettingsSection
          title={t('Transfer ownership')}
          description={t('Hand the server over to another member. You stay a member, but lose the owner rights. Needed, for example, before you delete your account.')}
        >
          <div className="transfer-row">
            <SearchPicker
              options={candidates}
              placeholder={t('Search members')}
              onSelect={(userId) => confirmTransfer(serverId, userId)}
              trigger={
                <Button variant="secondary" icon={<Crown />} disabled={candidates.length === 0}>
                  {t('Choose a new owner')}
                </Button>
              }
            />
            {candidates.length === 0 && <span className="field-hint">{t('Invite someone first – only members can become the owner.')}</span>}
          </div>
        </SettingsSection>
      )}
      {!server.isOfficial && (isOwner ? <SettingsSection title={t('Delete server')}>{dangerCard}</SettingsSection> : dangerCard)}
    </>
  );
}

function DangerCard({ serverId, isOwner }: { serverId: ID; isOwner: boolean }) {
  const server = useStore((s) => s.servers[serverId]);
  const [confirm, setConfirm] = useState('');
  const { deleteServer, leaveServer } = useStore.getState();
  if (!server || server.isOfficial) return null;
  return (
    <SettingsCard className="danger-card">
      {isOwner ? (
        <>
          <p>
            {CLOUD
              ? tx('Deleting {name} removes all channels, messages, roles and emojis for all members. This cannot be undone.', { name: <strong>{server.name}</strong> })
              : tx('Deleting {name} removes all channels, messages, roles and emojis from your local demo. This cannot be undone.', { name: <strong>{server.name}</strong> })}
          </p>
          <TextField label={t('Type the server name to confirm')} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={server.name} />
          <div className="row-actions">
            <Button
              variant="danger"
              icon={<Trash />}
              disabled={confirm.trim() !== server.name.trim()}
              onClick={() => {
                useUI.getState().closeSettings();
                deleteServer(serverId);
                toast({ title: t('Server deleted') });
              }}
            >
              {t('Delete server permanently')}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p>{t('You can rejoin at any time with an invite.')}</p>
          <Button
            variant="danger"
            onClick={() => {
              useUI.getState().closeSettings();
              leaveServer(serverId);
            }}
          >
            {t('Leave server')}
          </Button>
        </>
      )}
    </SettingsCard>
  );
}

export function ServerSettings({ serverId, section, roleId }: { serverId: ID; section: ServerSettingsSection; roleId?: ID }) {
  const server = useStore((s) => s.servers[serverId]);
  const isOwner = useStore((s) => s.servers[serverId]?.ownerId === s.meId);
  const canBan = useStore((s) => canServer(s, serverId, 'banMembers'));
  const ui = useUI.getState();
  if (!server) return null;
  const groups: NavGroup<ServerSettingsSection>[] = [
    {
      label: (
        <span className="settings-server-label">
          <ServerIcon server={server} size={18} />
          <span className="truncate">{server.name}</span>
        </span>
      ),
      items: [
        { id: 'overview', label: t('Overview'), icon: <LayoutDashboard /> },
        { id: 'roles', label: t('Roles'), icon: <Shield /> },
        { id: 'emojis', label: t('Emojis'), icon: <Smile /> },
        { id: 'badges', label: t('Server tag'), icon: <Award /> },
        { id: 'channels', label: t('Channels'), icon: <Hash /> },
      ],
    },
    {
      label: t('Community'),
      items: [
        ...(isOwner ? [{id:'discover' as const,label:t('Discover'),icon:<Eye/>}] : []),
        ...(isOwner ? [{id:'promote' as const,label:t('Promote server'),icon:<Sparkles/>}] : []),
        { id: 'members', label: t('Members'), icon: <Users /> },
        ...(canBan ? [{ id: 'bans' as const, label: t('Bans'), icon: <Gavel /> }] : []),
        { id: 'invites', label: t('Invites'), icon: <Link2 /> },
      ],
    },
    ...(!server.isOfficial ? [{ items: [{ id: 'danger' as const, label: isOwner ? t('Delete server') : t('Leave server'), icon: <Trash />, danger: true }] }] : []),
  ];
  const content = {
    discover: <DirectorySettings key={serverId} serverId={serverId}/>,
    promote: <PromotionSettings key={serverId} serverId={serverId}/>,
    overview: <Overview serverId={serverId} />,
    roles: <Roles serverId={serverId} initialRole={roleId} />,
    emojis: <Emojis serverId={serverId} />,
    badges: <ServerTagSettings key={serverId} serverId={serverId} />,
    channels: <Channels serverId={serverId} />,
    members: <Members serverId={serverId} />,
    bans: <Bans serverId={serverId} />,
    invites: <Invites serverId={serverId} />,
    danger: <Danger serverId={serverId} />,
  }[section];
  return (
    <SettingsLayout
      title={`${t('Server settings')} · ${server.name}`}
      groups={groups}
      active={section}
      onSelect={(id) => ui.openSettings({ kind: 'server', serverId, section: id })}
      onClose={ui.closeSettings}
    >
      {content}
    </SettingsLayout>
  );
}
