import {GuestTag} from '../ui/GuestTag';
import { ServerTagPill } from './ServerTag';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Ellipsis, Plus, Radio, UserPlus, Clock, Check, Gamepad2 } from 'lucide-react';
import type { ID, User } from '../../types';
import { addFriend, useStore } from '../../store/store';
import { showMainPane, previewNotice } from '../../store/ui';
import { canServer, memberRoles } from '../../store/selectors';
import { cn, formatShortDate, hashString, luminance, withAlpha } from '../../lib/utils';
import { formatMemberNumber } from '../../data/badges';
import { t } from '../../i18n';
import { Avatar } from '../ui/Avatar';
import { Banner } from '../ui/Banner';
import { BotTag, UserBadges } from '../ui/misc';
import { GemMark } from '../ui/icons';
import { Flag } from '../ui/Flag';
import { Dropdown } from '../ui/Menu';
import { IconButton } from '../ui/Button';
import { Tooltip } from '../ui/Tooltip';
import { MessageContent } from '../chat/MessageContent';
import { ServerIcon } from '../layout/ServerRail';
import { StyledName } from '../cosmetics/StyledName';
import { ProfileEffect } from '../cosmetics/Effects';
import { BorderLine, ProfileFrame, frameHasBottom } from '../cosmetics/Frames';
import { PlusCheck,PlusPill } from '../ui/PlusCheck';
import { userMenu } from './userMenu';
import { prepareOutgoing } from '../chat/outgoing';
import {currentActivity,useLiveActivity,useGameArtwork} from '../../backend/activity';
import { ProfileConnections } from './ProfileConnections';

/* ---------------------------------------------------------------- */
/* Pieces                                                             */
/* ---------------------------------------------------------------- */

export function ActivityCard({ user }: { user: User }) {
  const a = user.activity!;
  const localArtwork=useGameArtwork(user.id,a.artworkHash);
  const steamGame=a.gameKey?.match(/^steam:\d{1,10}$/);
  const artwork=steamGame?'https://cdn.cloudflare.steamstatic.com/steam/apps/'+a.gameKey!.slice(6)+'/header.jpg':localArtwork;
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 1_000);
    return () => window.clearInterval(id);
  }, []);
  if(!currentActivity(a))return null;
  const label = a.type === 'streaming' ? t('Live on ONYX') : a.type === 'listening' ? t('Listening to') : a.type === 'watching' ? t('Watching') : t('Playing');
  const hue = hashString(a.name) % 360;
  const seconds=Math.max(0,Math.floor((Date.now()-(a.since??Date.now()))/1000)),pad=(n:number)=>String(n).padStart(2,'0');
  const elapsed=(seconds>=3600?pad(Math.floor(seconds/3600))+':':'')+pad(Math.floor(seconds/60)%60)+':'+pad(seconds%60);
  return (
    <div className={cn('activity', a.type === 'streaming' && 'is-streaming')}>
      <div className="activity-label">
        {a.type === 'streaming' && <span className="live-dot" />}
        {label}
      </div>
      <div className="activity-row">
        <div
          className="activity-art"
          style={{
            background: `linear-gradient(140deg, hsl(${hue} 70% 55%), hsl(${(hue + 40) % 360} 70% 28%))`,
          }}
        >
          <Gamepad2 size={25}/>{artwork&&<img key={artwork} src={artwork} alt="" style={{objectFit:steamGame?'cover':'contain'}} onError={e=>{e.currentTarget.style.display='none';}}/>}
        </div>
        <div className="activity-text">
          <strong className="truncate">{a.name}</strong>
          {a.details && <span className="truncate">{a.details}</span>}
          {a.state && <span className="truncate">{a.state}</span>}
          {a.since && (
            <span className="activity-time">
              <Clock size={12} /> {a.timing==='observed'?t('Detected {time} ago',{time:elapsed}):elapsed}
            </span>
          )}
        </div>
      </div>
      {a.gameKey?.match(/^steam:\d{1,10}$/)&&<a className="btn btn-secondary btn-sm btn-block activity-btn" href={'https://store.steampowered.com/app/'+a.gameKey.slice(6)+'/'} target="_blank" rel="noopener noreferrer">{t('View game')}</a>}
      {a.type === 'streaming' && (
        <button
          className="btn btn-secondary btn-sm btn-block activity-btn"
          onClick={() =>
            previewNotice(
              t('Watch stream'),
              t('Livestreams in voice channels are part of the real-time infrastructure and will follow in a later version. This shows how streams appear in profiles.'),
              'voice',
            )
          }
        >
          <Radio size={15} /> {t('Watch stream')}
        </button>
      )}
    </div>
  );
}

function RolesSection({ userId, serverId }: { userId: ID; serverId: ID }) {
  const server = useStore((s) => s.servers[serverId]);
  const canEdit = useStore((s) => canServer(s, serverId, 'manageRoles'));
  const toggle = useStore((s) => s.toggleMemberRole);
  if (!server?.members[userId]) return null;
  const roles = memberRoles(server, userId);
  const assignable = [...server.roles].filter((r) => !r.isDefault).sort((a, b) => b.position - a.position);
  if (!roles.length && !canEdit) return null;
  return (
    <section className="pcard-section">
      <h3 className="pcard-h">{t('Roles')}</h3>
      <div className="role-chips">
        {roles.map((r) => (
          <span key={r.id} className="role-chip">
            <span className="role-dot" style={{ background: r.color ?? '#94a3b8' }} />
            {r.name}
          </span>
        ))}
        {canEdit && (
          <Dropdown
            align="start"
            items={assignable.map((r) => ({
              type: 'check' as const,
              label: r.name,
              color: r.color ?? '#94a3b8',
              checked: server.members[userId]?.roleIds.includes(r.id) ?? false,
              keepOpen: true,
              onSelect: () => toggle(serverId, userId, r.id),
            }))}
            trigger={
              <button className="role-chip role-chip-add" aria-label={t('Add role')}>
                <Plus size={13} />
              </button>
            }
          />
        )}
      </div>
    </section>
  );
}

function NoteField({ userId }: { userId: ID }) {
  const note = useStore((s) => s.notes[userId] ?? '');
  const setNote = useStore((s) => s.setNote);
  const [value, setValue] = useState(note);
  return (
    <section className="pcard-section">
      <h3 className="pcard-h">{t('Note')}</h3>
      <textarea
        className="pcard-note"
        value={value}
        placeholder={t('Click to add a note (only visible to you)')}
        maxLength={256}
        rows={1}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => value !== note && setNote(userId, value)}
        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), (e.target as HTMLTextAreaElement).blur())}
      />
    </section>
  );
}

function QuickMessage({ user, onSent }: { user: User; onSent?: () => void }) {
  const [value, setValue] = useState('');
  return (
    <form
      className="pcard-msg"
      onSubmit={(e) => {
        e.preventDefault();
        const s = useStore.getState();
        const dmId = s.openDMWithUser(user.id);
        if (value.trim()) s.sendMessage(dmId, prepareOutgoing(value.trim(), null, dmId));
        showMainPane();
        onSent?.();
      }}
    >
      <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={t('Message @{name}', { name: user.username })} aria-label={t('Message {name}', { name: user.displayName })} />
    </form>
  );
}

/** "Member #000247" chip plus registration flag. */
export function MemberIdentity({ user, forceCountry }: { user: Pick<User, 'id' | 'memberNumber' | 'country' | 'guest'>; forceCountry?: boolean }) {
  const isMe = useStore((s) => s.meId === user.id);
  const showCountry = useStore((s) => s.settings.showCountry);
  const country = user.country && (forceCountry || !isMe || showCountry) ? user.country : undefined;
  if (!user.memberNumber && !country) return null;
  return (
    <span className="member-ident">
      {user.memberNumber !== undefined && (
        <Tooltip content={t('Registration number on ONYX')} arrow={false} className="badge-tooltip-surface">
          <span className="member-no" tabIndex={0}>
            <GemMark size={13} />
            {t('Member {number}', {
              number: formatMemberNumber(user.memberNumber),
            })}
          </span>
        </Tooltip>
      )}
      {country && <Flag code={country} size={18} />}
    </span>
  );
}

/* ---------------------------------------------------------------- */
/* Card                                                               */
/* ---------------------------------------------------------------- */

interface CardProps {
  user: User;
  serverId?: ID;
  variant?: 'popout' | 'panel' | 'preview';
  footer?: ReactNode;
  panelFooter?: ReactNode;
  onClose?: () => void;
  /** Override for previews in settings. */
  hideSections?: boolean;
  /** Extra content inside the card (mutual servers, "full profile" …) so it shares the profile design. */
  children?: ReactNode;
}

/**
 * CSS variables for a themed profile. Every part of the profile (sections,
 * collapsibles, buttons, inputs, tabs) reads these, so the whole card keeps
 * one design. Light colours get a darker veil to keep text readable.
 */
export function themeStyle(user: Pick<User, 'profileColors'>): CSSProperties | undefined {
  const colors = user.profileColors;
  if (!colors?.length) return undefined;
  const [a, b = a] = colors;
  const lum = Math.max(luminance(a), luminance(b));
  return {
    ['--pc-a' as string]: a,
    ['--pc-b' as string]: b,
    ['--pc-grad' as string]: `linear-gradient(170deg, ${colors.length > 1 ? colors.join(', ') : `${a}, ${a}`})`,
    ['--pc-glow' as string]: withAlpha(a, 0.35),
    ['--pc-veil' as string]: lum > 0.45 ? 'rgba(8, 11, 13, 0.78)' : lum > 0.2 ? 'rgba(9, 12, 14, 0.68)' : 'rgba(10, 13, 15, 0.58)',
  } as CSSProperties;
}

export function ProfileCard({ user, serverId, variant = 'popout', footer, panelFooter, onClose, hideSections, children }: CardProps) {
  const meId = useStore((s) => s.meId);
  const guestViewer=useStore(s=>s.users[s.meId]?.guest);
  const member = useStore((s) => (serverId ? s.servers[serverId]?.members[user.id] : undefined));
  const server = useStore((s) => (serverId ? s.servers[serverId] : undefined));
  const rel = useStore((s) => s.relationships[user.id]);
  useLiveActivity(user.id);
  const showActivity = useStore((s) => (user.id === s.meId ? s.settings.showActivity : true));
  const isMe = user.id === meId;
  const themed = !!user.profileColors?.length;
  const nickname = member?.nickname;
  const line = user.borderLine?.card ? user.borderLine : undefined;

  return (
    <div
      className={cn('pcard', `pcard-${variant}`, themed && 'is-themed', user.profileFrame && 'has-frame', frameHasBottom(user.profileFrame) && 'has-frame-bottom', 'anim-host')}
      style={themeStyle(user)}
    >
      <div className="pcard-banner">
        <Banner source={user.banner} color={user.profileColors?.[0] ?? withAlpha(user.avatarColor, 0.55)} />
      </div>
      {/* Effects play behind avatar and text so names and badges stay readable. */}
      {user.profileEffect && <ProfileEffect effect={user.profileEffect} />}
      <div className="pcard-top">
        <div className="pcard-avatar">
          <Avatar user={user} size={variant === 'panel' ? 80 : 84} status={user.status} frame />
        </div>
        <div className="pcard-top-tools">
          {!isMe && !user.bot && !user.guest && !rel && (
            <IconButton label={t('Add friend')} size="sm" onClick={() => addFriend(user.username)}>
              <UserPlus />
            </IconButton>
          )}
          {rel?.type === 'outgoing' && (
            <Tooltip content={t('Friend request sent')}>
              <span className="pcard-pending">
                <Check size={14} />
              </span>
            </Tooltip>
          )}
          {variant !== 'preview' && (
            <Dropdown
              align="end"
              items={userMenu(user.id, serverId)}
              trigger={
                <button className="icon-btn icon-btn-sm" aria-label={t('More options')}>
                  <Ellipsis />
                </button>
              }
            />
          )}
        </div>
      </div>
      <div className="pcard-inner">
        <div className="pcard-names">
          <h2 className="pcard-name">
            <StyledName style={user.nameStyle} className="truncate">
              {nickname || user.displayName}
            </StyledName>
            <ServerTagPill userId={user.id} />
            <PlusCheck since={user.plusSince} until={user.plusUntil} size={18} interactive={variant !== 'preview'} /><PlusPill since={user.plusSince} until={user.plusUntil}/>
            <GuestTag guest={user.guest}/>{user.bot && <BotTag />}
          </h2>
          <div className="pcard-username">
            <span>{user.guest?t('Guest account'):user.username}</span>
            {user.pronouns && (
              <>
                <span className="pcard-dot">•</span>
                <span>{user.pronouns}</span>
              </>
            )}
          </div>
          <div className="pcard-idrow">
            <MemberIdentity user={user} />
            {user.badges.length > 0 && <UserBadges badges={user.badges} size={20} className="pcard-badges" />}
          </div>
        </div>
        {user.customStatus && user.status !== 'offline' && (
          <div className="pcard-status">
            {user.customStatus.emoji && <span className="emoji">{user.customStatus.emoji}</span>}
            <span>{user.customStatus.text}</span>
          </div>
        )}
        {!hideSections && (
          <div className="pcard-sections">
            {user.activity && showActivity && user.status !== 'offline' && <ActivityCard user={user} />}
            {user.bio && (
              <section className="pcard-section">
                <h3 className="pcard-h">{t('About me')}</h3>
                <div className="pcard-bio" dir="auto">
                  <MessageContent content={user.bio} />
                </div>
              </section>
            )}
            <section className="pcard-section">
              <h3 className="pcard-h">{t('Member since')}</h3>
              <div className="pcard-since">
                <Tooltip content={t('On ONYX since')}>
                  <span className="since-item">
                    <GemMark size={16} />
                    {formatShortDate(user.createdAt)}
                  </span>
                </Tooltip>
                {server && member && (
                  <>
                    <span className="since-sep" />
                    <Tooltip content={t('In {name} since', { name: server.name })}>
                      <span className="since-item">
                        <ServerIcon server={server} size={16} />
                        {formatShortDate(member.joinedAt)}
                      </span>
                    </Tooltip>
                  </>
                )}
              </div>
            </section>
            {serverId && <RolesSection userId={user.id} serverId={serverId} />}
            <ProfileConnections userId={user.id} />
            {!isMe && !guestViewer && variant !== 'preview' && <NoteField userId={user.id} />}
          </div>
        )}
        {footer ?? (!isMe && !user.bot && variant === 'popout' && rel?.type !== 'blocked' && !user.guest && !guestViewer && <QuickMessage user={user} onSent={onClose} />)}
        {children}
      </div>
      {panelFooter && <div className="pcard-panel-footer">{panelFooter}</div>}
      {user.profileFrame && <ProfileFrame id={user.profileFrame} />}
      {line && <BorderLine style={line} shape="rect" />}
    </div>
  );
}
