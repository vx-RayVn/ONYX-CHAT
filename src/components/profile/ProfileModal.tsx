import {useCommunity,badgeName,badgeDescription} from '../../backend/community';
import { useMemo, useState } from 'react';
import { Ellipsis, MessageCircle, UserPlus, Check, Clock } from 'lucide-react';
import type { ID } from '../../types';
import { addFriend, useStore } from '../../store/store';
import { useUI, showMainPane } from '../../store/ui';
import { cn, formatShortDate } from '../../lib/utils';
import { t, tn } from '../../i18n';
import { BADGE_BY_ID } from '../../data/badges';
import { Modal } from '../ui/Modal';
import { Avatar } from '../ui/Avatar';
import { Banner } from '../ui/Banner';
import { Button } from '../ui/Button';
import { BotTag, UserBadges } from '../ui/misc';
import { BadgeIcon, GemMark } from '../ui/icons';
import { Dropdown } from '../ui/Menu';
import { MessageContent } from '../chat/MessageContent';
import { ServerIcon } from '../layout/ServerRail';
import { userMenu } from './userMenu';
import { ActivityCard, MemberIdentity, themeStyle } from './ProfileCard';
import { ProfileEffect } from '../cosmetics/Effects';
import { BorderLine, ProfileFrame } from '../cosmetics/Frames';
import { StyledName } from '../cosmetics/StyledName';
import { activityLine } from '../chat/MemberList';
import { PlusCheck,PlusPill } from '../ui/PlusCheck';
import {useLiveActivity} from '../../backend/activity';
import { ProfileConnections } from './ProfileConnections';

type Tab = 'about' | 'badges' | 'servers' | 'friends';

export function ProfileModal({ userId, serverId }: { userId: ID; serverId?: ID }) {
  useLiveActivity(userId);
  const close = useUI((s) => s.closeModal);
  useCommunity(s=>s.revision);
  const user = useStore((s) => s.users[userId]);
  const meId = useStore((s) => s.meId);
  const rel = useStore((s) => s.relationships[userId]);
  const servers = useStore((s) => s.servers);
  const serverOrder = useStore((s) => s.serverOrder);
  const relationships = useStore((s) => s.relationships);
  const users = useStore((s) => s.users);
  const note = useStore((s) => s.notes[userId]);
  const [tab, setTab] = useState<Tab>('about');
  const { openDMWithUser, acceptFriend, selectServer } = useStore.getState();

  const mutualServers = useMemo(() => serverOrder.map((id) => servers[id]).filter((s) => s?.members[userId] && s.members[meId]), [servers, serverOrder, userId, meId]);
  const mutualFriends = useMemo(
    () =>
      Object.values(relationships)
        .filter((r) => r.type === 'friend' && r.userId !== userId)
        .map((r) => users[r.userId])
        .filter((f) => f && mutualServers.some((s) => s.members[f.id])),
    [relationships, users, mutualServers, userId],
  );

  if (!user) return null;
  const profileBadges=user.badges.filter(badge=>!!BADGE_BY_ID[badge]);
  const isMe = userId === meId;
  const line = activityLine(user);

  return (
    <Modal open onClose={close} size="lg" className="profile-modal" hideClose>
      <div className={cn('pmodal anim-host', user.profileColors?.length && 'is-themed', user.profileFrame && 'has-frame')} style={themeStyle(user)}>
        <div className="pmodal-banner">
          <Banner source={user.banner} color={user.profileColors?.[0] ?? user.avatarColor} />
        </div>
        {user.profileEffect && <ProfileEffect effect={user.profileEffect} />}
        <div className="pmodal-head">
          <div className="pmodal-avatar">
            <Avatar user={user} size={120} status={user.status} frame />
          </div>
          <div className="pmodal-actions">
            {!isMe && !user.bot && (
              <Button
                icon={<MessageCircle />}
                onClick={() => {
                  openDMWithUser(userId);
                  close();
                  showMainPane();
                }}
              >
                {t('Message')}
              </Button>
            )}
            {!isMe && !user.bot && !rel && (
              <Button variant="secondary" icon={<UserPlus />} onClick={() => addFriend(user.username)}>
                {t('Add friend')}
              </Button>
            )}
            {rel?.type === 'incoming' && (
              <Button variant="secondary" icon={<Check />} onClick={() => acceptFriend(userId)}>
                {t('Accept request')}
              </Button>
            )}
            {rel?.type === 'outgoing' && (
              <Button variant="secondary" icon={<Clock />} disabled>
                {t('Request sent')}
              </Button>
            )}
            {isMe && (
              <Button variant="secondary" onClick={() => useUI.getState().openSettings({ kind: 'user', section: 'profile' })}>
                {t('Edit profile')}
              </Button>
            )}
            <Dropdown
              align="end"
              items={userMenu(userId, serverId)}
              trigger={
                <button className="icon-btn icon-btn-lg pmodal-more" aria-label={t('More options')}>
                  <Ellipsis />
                </button>
              }
            />
          </div>
        </div>
        <div className="pmodal-body">
          <div className="pmodal-names">
            <h2>
              <StyledName style={user.nameStyle}>{user.displayName}</StyledName>
              <PlusCheck since={user.plusSince} until={user.plusUntil} size={20} /><PlusPill since={user.plusSince} until={user.plusUntil}/>
              {user.bot && <BotTag />}
            </h2>
            <div className="pcard-username">
              <span>{user.username}</span>
              {user.pronouns && (
                <>
                  <span className="pcard-dot">•</span>
                  <span>{user.pronouns}</span>
                </>
              )}
            </div>
            <div className="pcard-idrow">
              <MemberIdentity user={user} />
              {profileBadges.length > 0 && <UserBadges badges={profileBadges} size={22} className="pcard-badges" />}
            </div>
            {line && !user.activity && <div className="pmodal-activity">{line.text}</div>}
            {user.activity&&user.status!=='offline'&&<ActivityCard user={user}/>}
          </div>
          <nav className="pmodal-tabs">
            <button className={cn('ptab', tab === 'about' && 'is-active')} onClick={() => setTab('about')}>
              {t('About me')}
            </button>
            {profileBadges.length > 0 && (
              <button className={cn('ptab', tab === 'badges' && 'is-active')} onClick={() => setTab('badges')}>
                {tn(profileBadges.length, '{count} badge', '{count} badges')}
              </button>
            )}
            {!isMe && (
              <>
                <button className={cn('ptab', tab === 'servers' && 'is-active')} onClick={() => setTab('servers')}>
                  {tn(mutualServers.length, '{count} mutual server', '{count} mutual servers')}
                </button>
                <button className={cn('ptab', tab === 'friends' && 'is-active')} onClick={() => setTab('friends')}>
                  {tn(mutualFriends.length, '{count} mutual friend', '{count} mutual friends')}
                </button>
              </>
            )}
          </nav>
          <div className="pmodal-content">
            {tab === 'about' && (
              <div className="pmodal-about">
                {user.bio ? (
                  <div className="pcard-bio" dir="auto">
                    <MessageContent content={user.bio} />
                  </div>
                ) : (
                  <div className="pmodal-empty">{isMe ? t('Tell people about yourself – in your profile settings.') : t('No description yet.')}</div>
                )}
                <h3 className="pcard-h">{t('Member since')}</h3>
                <div className="pcard-since">
                  <span className="since-item">
                    <GemMark size={16} /> {formatShortDate(user.createdAt)}
                  </span>
                </div>
                <ProfileConnections userId={userId} />
                {note && (
                  <>
                    <h3 className="pcard-h">{t('Note')}</h3>
                    <div className="pmodal-note">{note}</div>
                  </>
                )}
              </div>
            )}
            {tab === 'badges' && (
              <div className="pmodal-badges">
                {profileBadges
                  .filter((b) => BADGE_BY_ID[b])
                  .map((b) => (
                    <div key={b} className="pmodal-badge">
                      <BadgeIcon badge={b} size={36} />
                      <div className="grow">
                        <strong>{badgeName(b)??t(BADGE_BY_ID[b].name)}</strong>
                        <span>{badgeDescription(b)??t(BADGE_BY_ID[b].description)}</span>
                      </div>
                    </div>
                  ))}
              </div>
            )}
            {tab === 'servers' &&
              (mutualServers.length ? (
                mutualServers.map((s) => (
                  <button
                    key={s.id}
                    className="mutual-row"
                    onClick={() => {
                      selectServer(s.id);
                      close();
                      showMainPane();
                    }}
                  >
                    <ServerIcon server={s} size={36} />
                    <span className="grow truncate">
                      <strong>{s.name}</strong>
                      {s.members[userId]?.nickname && <span>{s.members[userId]?.nickname}</span>}
                    </span>
                  </button>
                ))
              ) : (
                <div className="pmodal-empty">{t('No mutual servers.')}</div>
              ))}
            {tab === 'friends' &&
              (mutualFriends.length ? (
                mutualFriends.map((f) => (
                  <button key={f.id} className="mutual-row" onClick={() => useUI.getState().openModal({ type: 'profile', userId: f.id })}>
                    <Avatar user={f} size={36} status={f.status} />
                    <span className="grow truncate">
                      <strong>
                        <StyledName style={f.nameStyle}>{f.displayName}</StyledName>
                      </strong>
                      <span>{f.username}</span>
                    </span>
                  </button>
                ))
              ) : (
                <div className="pmodal-empty">{t('No mutual friends.')}</div>
              ))}
          </div>
        </div>
        {user.profileFrame && <ProfileFrame id={user.profileFrame} />}
        {user.borderLine?.card && <BorderLine style={user.borderLine} shape="rect" />}
      </div>
    </Modal>
  );
}
