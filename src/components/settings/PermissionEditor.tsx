/**
 * Channel / category permission editor (Discord-like overwrites).
 *
 * Each permission of a role or member can be denied, inherited or allowed. When
 * inherited, the editor shows where the value comes from: the category, the
 * server role permissions, or (for members) their roles.
 */
import { useMemo, useState } from 'react';
import { Check, Eye, Link2, Lock, Plus, RotateCcw, Slash, Trash, Unlink, X } from 'lucide-react';
import type { ID, Permission, PermissionOverwrite } from '../../types';
import { useStore, type PermissionScope } from '../../store/store';
import { useUI } from '../../store/ui';
import { memberDisplayName } from '../../store/selectors';
import { CATEGORY_PERMISSIONS, channelPermissions, channelPermissionSet, everyoneRole, inheritedValue, ruleIn, subjectFor, type Inherited } from '../../lib/permissions';
import { cn } from '../../lib/utils';
import { t, tk, tn } from '../../i18n';
import { Avatar } from '../ui/Avatar';
import { Button, IconButton } from '../ui/Button';
import { SettingRow, Switch } from '../ui/Field';
import { Tooltip } from '../ui/Tooltip';
import { SearchPicker } from '../ui/SearchPicker';
import { SettingsCard } from './SettingsLayout';

const INFO: Partial<Record<Permission, { label: string; desc: string }>> = {
  viewChannel: { label: tk('View channel'), desc: tk('See the channel in the list and open it.') },
  manageChannels: { label: tk('Manage channel'), desc: tk('Change name, topic and settings, or delete the channel.') },
  manageRoles: { label: tk('Manage permissions'), desc: tk('Change the permissions on this page.') },
  createInvites: { label: tk('Create invites'), desc: tk('Invite people to the server through this channel.') },
  sendMessages: { label: tk('Send messages'), desc: tk('Write messages. Without it, files, voice messages and @everyone are not possible either.') },
  readHistory: { label: tk('Read message history'), desc: tk('See messages that were sent before opening the channel.') },
  attachFiles: { label: tk('Attach files'), desc: tk('Upload images and files.') },
  sendVoiceMessages: { label: tk('Send voice messages'), desc: tk('Record and send voice messages.') },
  addReactions: { label: tk('Add reactions'), desc: tk('Add new reactions. Joining an existing reaction is always possible.') },
  mentionEveryone: { label: tk('Mention @everyone'), desc: tk('@everyone, @here and role mentions notify all of them.') },
  manageMessages: { label: tk('Manage messages'), desc: tk('Delete and pin other people’s messages.') },
  connect: { label: tk('Connect'), desc: tk('Join the voice channel.') },
  speak: { label: tk('Speak'), desc: tk('Talk in the voice channel. Without it, members join muted.') },
  video: { label: tk('Video'), desc: tk('Turn on the camera in the voice channel.') },
  screenShare: { label: tk('Share screen'), desc: tk('Share the screen, a window or a browser tab.') },
  muteMembers: { label: tk('Mute members'), desc: tk('Server-mute others here (only members below your highest role).') },
  deafenMembers: { label: tk('Deafen members'), desc: tk('Server-deafen others here, so they hear nothing.') },
  moveMembers: { label: tk('Move members'), desc: tk('Disconnect others or move them to another voice channel – also into full ones.') },
};

const GROUPS: { label: string; perms: Permission[] }[] = [
  { label: tk('General'), perms: ['viewChannel', 'manageChannels', 'manageRoles', 'createInvites'] },
  { label: tk('Text'), perms: ['sendMessages', 'readHistory', 'attachFiles', 'sendVoiceMessages', 'addReactions', 'mentionEveryone', 'manageMessages'] },
  { label: tk('Voice'), perms: ['connect', 'speak', 'video', 'screenShare'] },
  { label: tk('Voice moderation'), perms: ['muteMembers', 'deafenMembers', 'moveMembers'] },
];

type Target = Pick<PermissionOverwrite, 'type' | 'id'>;
const key = (x: Target) => `${x.type}:${x.id}`;

function inheritedText(inh: Inherited, categoryName?: string) {
  const v = inh.value ? t('allowed') : t('denied');
  switch (inh.source) {
    case 'category':
      return t('Inherited from category “{name}”: {value}', { name: categoryName ?? '', value: v });
    case 'admin':
      return t('Administrator: always allowed');
    case 'owner':
      return t('Server owner: always allowed');
    case 'roles':
      return t('From their roles: {value}', { value: v });
    default:
      return t('From the role’s server permissions: {value}', { value: v });
  }
}

function TriState({ value, onChange, disabled, label }: { value: 'allow' | 'deny' | undefined; onChange: (v: 'allow' | 'deny' | null) => void; disabled?: boolean; label: string }) {
  const opts = [
    { v: 'deny' as const, icon: <X size={15} strokeWidth={2.6} />, text: t('Deny') },
    { v: null, icon: <Slash size={13} strokeWidth={2.6} />, text: t('Inherit') },
    { v: 'allow' as const, icon: <Check size={15} strokeWidth={2.6} />, text: t('Allow') },
  ];
  return (
    <div className="tri" role="radiogroup" aria-label={label}>
      {opts.map((o) => {
        const active = (value ?? null) === o.v;
        return (
          <Tooltip key={String(o.v)} content={o.text}>
            <button
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`${label}: ${o.text}`}
              disabled={disabled}
              className={cn('tri-btn', `is-${o.v ?? 'inherit'}`, active && 'is-active')}
              onClick={() => onChange(o.v)}
            >
              {o.icon}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

export function PermissionEditor({ scope }: { scope: PermissionScope }) {
  const channel = useStore((s) => (scope.kind === 'channel' ? s.channels[scope.channelId] : undefined));
  const serverId = scope.kind === 'channel' ? channel?.serverId : scope.serverId;
  const server = useStore((s) => (serverId ? s.servers[serverId] : undefined));
  const users = useStore((s) => s.users);
  const meId = useStore((s) => s.meId);
  const viewAs = useStore((s) => s.viewAs);
  const store = useStore.getState();
  const [selected, setSelected] = useState<string | null>(null);

  const category =
    server && (scope.kind === 'category' ? server.categories.find((c) => c.id === scope.categoryId) : channel?.categoryId ? server.categories.find((c) => c.id === channel.categoryId) : undefined);
  const own = scope.kind === 'channel' ? channel?.overwrites : category?.overwrites;
  const inheritedList = scope.kind === 'channel' ? category?.overwrites : undefined;
  const everyone = server ? everyoneRole(server) : undefined;

  const targets = useMemo<Target[]>(() => {
    if (!server || !everyone) return [];
    const seen = new Set<string>([key({ type: 'role', id: everyone.id })]);
    const list: Target[] = [{ type: 'role', id: everyone.id }];
    const add = (o: Target) => {
      if (seen.has(key(o))) return;
      if (o.type === 'role' && !server.roles.some((r) => r.id === o.id)) return;
      if (o.type === 'member' && !server.members[o.id]) return;
      seen.add(key(o));
      list.push({ type: o.type, id: o.id });
    };
    const roles = [...server.roles].sort((a, b) => b.position - a.position);
    for (const r of roles) if (own?.some((o) => o.type === 'role' && o.id === r.id) || inheritedList?.some((o) => o.type === 'role' && o.id === r.id)) add({ type: 'role', id: r.id });
    [...(own ?? []), ...(inheritedList ?? [])].filter((o) => o.type === 'member').forEach(add);
    return list;
  }, [server, everyone, own, inheritedList]);

  if (!server || !everyone || (scope.kind === 'channel' && !channel) || (scope.kind === 'category' && !category)) return null;

  const sub = subjectFor(server, meId, viewAs, meId);
  const canEdit = channelPermissions(sub, channel, category).has('manageRoles');
  const current = targets.find((x) => key(x) === selected) ?? targets[0];
  const perms = scope.kind === 'channel' ? channelPermissionSet(channel!.type) : CATEGORY_PERMISSIONS;
  const groups = GROUPS.map((g) => ({ ...g, perms: g.perms.filter((p) => perms.includes(p)) })).filter((g) => g.perms.length);
  const ownCount = (x: Target) => {
    const o = own?.find((y) => y.type === x.type && y.id === x.id);
    return o ? o.allow.length + o.deny.length : 0;
  };
  const roleOf = (id: ID) => server.roles.find((r) => r.id === id);
  const targetName = (x: Target) => (x.type === 'role' ? (roleOf(x.id)?.name ?? '?') : memberDisplayName({ servers: { [server.id]: server }, users }, x.id, server.id));
  const isPrivate =
    (scope.kind === 'channel' ? (ruleIn(own, 'role', everyone.id, 'viewChannel') ?? ruleIn(inheritedList, 'role', everyone.id, 'viewChannel')) : ruleIn(own, 'role', everyone.id, 'viewChannel')) ===
    'deny';
  const synced = scope.kind === 'channel' && !(own && own.some((o) => o.allow.length + o.deny.length > 0));
  const differing = (own ?? []).reduce((n, o) => n + o.allow.length + o.deny.length, 0);

  // How the selected target ends up in this place (used for the "cannot see" hint).
  const effective = (() => {
    if (current.type === 'member') return channelPermissions(subjectFor(server, current.id), channel, category);
    if (roleOf(current.id)?.permissions.includes('administrator')) return null;
    return channelPermissions({ server, userId: '__preview__', roleIds: current.id === everyone.id ? [] : [current.id], isOwner: false }, channel, category);
  })();

  const addOptions = [
    ...[...server.roles]
      .filter((r) => !targets.some((x) => x.type === 'role' && x.id === r.id))
      .sort((a, b) => b.position - a.position)
      .map((r) => ({ id: `role:${r.id}`, label: r.name, group: t('Roles'), icon: <span className="role-dot" style={{ background: r.color ?? '#94a3b8' }} /> })),
    ...Object.values(server.members)
      .filter((m) => users[m.userId] && !targets.some((x) => x.type === 'member' && x.id === m.userId))
      .map((m) => ({
        id: `member:${m.userId}`,
        label: memberDisplayName({ servers: { [server.id]: server }, users }, m.userId, server.id),
        hint: users[m.userId].username,
        group: t('Members'),
        icon: <Avatar user={users[m.userId]} size={20} />,
      })),
  ];

  const viewAsRole = (roleId: ID) => {
    const roleIds = roleId === everyone.id ? [] : [roleId];
    const ui = useUI.getState();
    ui.closeSettings();
    if (channel && channel.type !== 'voice') store.selectChannel(server.id, channel.id);
    else store.selectServer(server.id);
    store.setViewAs({ serverId: server.id, roleIds });
  };

  return (
    <div className="pe">
      {scope.kind === 'channel' && category && (
        <SettingsCard className={cn('pe-sync', synced && 'is-synced')}>
          {synced ? <Link2 size={20} /> : <Unlink size={20} />}
          <div className="grow">
            <strong>
              {synced
                ? t('Synced with category “{name}”', { name: category.name })
                : tn(differing, '1 setting differs from “{name}”', '{count} settings differ from “{name}”', { name: category.name })}
            </strong>
            <span>{synced ? t('This channel uses the category’s permissions. A change here only applies to this channel.') : t('Everything you don’t set here still comes from the category.')}</span>
          </div>
          {synced ? (
            <Button size="sm" variant="secondary" onClick={() => useUI.getState().openSettings({ kind: 'category', serverId: server.id, categoryId: category.id, section: 'permissions' })}>
              {t('Category permissions')}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              icon={<RotateCcw />}
              disabled={!canEdit}
              onClick={() =>
                useUI.getState().openModal({
                  type: 'confirm',
                  title: t('Sync with category?'),
                  body: t('All settings of this channel are removed. It then uses the permissions of “{name}” again.', { name: category.name }),
                  confirmLabel: t('Sync'),
                  onConfirm: () => store.resetChannelOverwrites(channel!.id),
                })
              }
            >
              {t('Sync with category')}
            </Button>
          )}
        </SettingsCard>
      )}

      <SettingsCard>
        <SettingRow
          title={
            <>
              <Lock size={16} /> {scope.kind === 'channel' ? t('Private channel') : t('Private category')}
            </>
          }
          description={
            scope.kind === 'channel'
              ? t('Only roles and members you allow below (“View channel”) can see this channel.')
              : t('Channels in this category are only visible to roles and members you allow below.')
          }
          control={
            <Switch
              checked={isPrivate}
              disabled={!canEdit}
              onChange={(v) =>
                store.setOverwrite(
                  scope,
                  { type: 'role', id: everyone.id },
                  'viewChannel',
                  v ? 'deny' : scope.kind === 'channel' && ruleIn(inheritedList, 'role', everyone.id, 'viewChannel') === 'deny' ? 'allow' : null,
                )
              }
              label={scope.kind === 'channel' ? t('Private channel') : t('Private category')}
            />
          }
        />
      </SettingsCard>

      {!canEdit && <p className="pe-readonly">{t('You can view these settings, but changing them needs the “Manage permissions” permission.')}</p>}

      <div className="roles-layout pe-layout">
        <div className="roles-list">
          <div className="pe-list-head">
            <span>{t('Roles & members')}</span>
            {canEdit && (
              <SearchPicker
                align="start"
                placeholder={t('Add a role or member')}
                options={addOptions}
                onSelect={(id) => {
                  const [type, rid] = id.split(':') as [Target['type'], ID];
                  store.addOverwriteTarget(scope, { type, id: rid });
                  setSelected(`${type}:${rid}`);
                }}
                trigger={
                  <IconButton label={t('Add a role or member')} size="sm">
                    <Plus />
                  </IconButton>
                }
              />
            )}
          </div>
          <div className="roles-items">
            {targets.map((x) => {
              const role = x.type === 'role' ? roleOf(x.id) : undefined;
              const n = ownCount(x);
              return (
                <div key={key(x)} className={cn('role-item', key(x) === key(current) && 'is-active')}>
                  <button className="role-item-main" onClick={() => setSelected(key(x))}>
                    {role ? <span className="role-dot" style={{ background: role.color ?? '#94a3b8' }} /> : <Avatar user={users[x.id]} size={20} />}
                    <span className="grow truncate">{targetName(x)}</span>
                    {n > 0 && (
                      <Tooltip content={tn(n, '1 setting here', '{count} settings here')}>
                        <span className="pe-count">{n}</span>
                      </Tooltip>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="role-editor pe-editor">
          <div className="role-editor-head">
            <h3>
              {current.type === 'role' ? <span className="role-dot lg" style={{ background: roleOf(current.id)?.color ?? '#94a3b8' }} /> : <Avatar user={users[current.id]} size={24} />}
              <span className="truncate">{targetName(current)}</span>
            </h3>
            <div className="row-actions">
              {current.type === 'role' && (
                <Button size="sm" variant="secondary" icon={<Eye />} onClick={() => viewAsRole(current.id)}>
                  {t('View as this role')}
                </Button>
              )}
              {canEdit && key(current) !== `role:${everyone.id}` && own?.some((o) => key(o) === key(current)) && (
                <IconButton
                  label={t('Remove from this list')}
                  danger
                  onClick={() => {
                    store.removeOverwriteTarget(scope, current);
                    setSelected(null);
                  }}
                >
                  <Trash />
                </IconButton>
              )}
            </div>
          </div>
          {effective && !effective.has('viewChannel') && (
            <p className="pe-hint">{scope.kind === 'channel' ? t('Can’t see this channel – the other permissions have no effect.') : t('Can’t see the channels of this category by default.')}</p>
          )}
          {groups.map((g) => (
            <div key={g.label}>
              <h4 className="perm-group">{t(g.label)}</h4>
              {g.perms.map((p) => {
                const info = INFO[p]!;
                const rule = ruleIn(own, current.type, current.id, p);
                const inh = inheritedValue(server, { channel, category }, current, p);
                return (
                  <div key={p} className="pe-row">
                    <div className="pe-row-text">
                      <span className="pe-row-title">{p === 'viewChannel' && scope.kind === 'category' ? t('View channels') : t(info.label)}</span>
                      <span className="pe-row-desc">{p === 'viewChannel' && scope.kind === 'category' ? t('See the channels of this category in the list.') : t(info.desc)}</span>
                      <span className={cn('pe-row-source', rule && `is-${rule}`)}>
                        {rule ? (
                          <>
                            {rule === 'allow' ? t('Allowed here') : t('Denied here')}
                            {canEdit && (
                              <button className="pe-reset" onClick={() => store.setOverwrite(scope, current, p, null)}>
                                <RotateCcw size={12} />
                                {t('Reset to inherited')}
                              </button>
                            )}
                          </>
                        ) : (
                          inheritedText(inh, category?.name)
                        )}
                      </span>
                    </div>
                    <TriState value={rule} disabled={!canEdit} label={t(info.label)} onChange={(v) => store.setOverwrite(scope, current, p, v)} />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
