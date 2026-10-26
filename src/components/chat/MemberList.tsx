import {GuestTag} from '../ui/GuestTag';
import {ServerTagPill} from '../profile/ServerTag';
import { memo, useEffect, useMemo, useState } from 'react';
import { CLOUD } from '../../backend/config';
import { supabase } from '../../backend/client';
import { botApps,botInstalls,type BotApp } from '../../backend/bots';
import { BotPopover } from '../profile/BotPopover';
import { Crown } from 'lucide-react';
import type { ID, User } from '../../types';
import { useStore } from '../../store/store';
import { hoistRole, memberDisplayName, topColor } from '../../store/selectors';
import { cn } from '../../lib/utils';
import { Avatar } from '../ui/Avatar';
import { BotTag, SectionLabel } from '../ui/misc';
import { Tooltip } from '../ui/Tooltip';
import { ContextMenu } from '../ui/Menu';
import { UserPopover } from '../profile/UserPopover';
import { userMenu } from '../profile/userMenu';
import { StyledName } from '../cosmetics/StyledName';
import { locale, t, tx } from '../../i18n';
import {useLiveActivity,currentActivity} from '../../backend/activity';
import { PlusCheck,PlusPill } from '../ui/PlusCheck';

export function activityLine(u: User, showActivity = true) {
  if (u.status === 'offline') return null;
  if (currentActivity(u.activity) && showActivity) {
    const a = u.activity!;
    if (a.type === 'streaming') return { text: tx('Streaming {name}', { name: <b>{a.name}</b> }), streaming: true };
    if (a.type === 'listening') return { text: tx('Listening to {name}', { name: <b>{a.details ?? a.name}</b> }), streaming: false };
    if (a.type === 'watching') return { text: tx('Watching {name}', { name: <b>{a.name}</b> }), streaming: false };
    return { text: tx('Playing {name}', { name: <b>{a.name}</b> }), streaming: false };
  }
  if (u.customStatus)
    return {
      text: (
        <>
          {u.customStatus.emoji && <span className="emoji">{u.customStatus.emoji} </span>}
          {u.customStatus.text}
        </>
      ),
      streaming: false,
    };
  return null;
}

const MemberRow = memo(function MemberRow({ userId, serverId, isOwner }: { userId: ID; serverId?: ID; isOwner: boolean }) {
  useLiveActivity(userId);
  const user = useStore((s) => s.users[userId]);
  const name = useStore((s) => memberDisplayName(s, userId, serverId));
  const color = useStore((s) => (s.settings.showRoleColors && serverId ? topColor(s.servers[serverId], userId) : undefined));
  const meId = useStore((s) => s.meId);
  const showActivity = useStore((s) => (userId === s.meId ? s.settings.showActivity : true));
  if (!user) return null;
  const line = activityLine(user, showActivity);
  return (
    <ContextMenu items={() => userMenu(userId, serverId)}>
      <div>
        <UserPopover userId={userId} serverId={serverId} side="left" align="start">
          <button className={cn('member anim-host', user.status === 'offline' && 'is-offline', userId === meId && 'is-me')}>
            <Avatar user={user} size={32} status={user.status} frame />
            <span className="member-text">
              <span className="member-name-row">
                <span className="member-name truncate">
                  <StyledName style={user.nameStyle} color={color}>
                    {name}
                  </StyledName>
                </span>
                <ServerTagPill userId={user.id} /><PlusCheck since={user.plusSince} until={user.plusUntil} size={14} interactive={false} /><PlusPill since={user.plusSince} until={user.plusUntil}/>
                <GuestTag guest={user.guest}/>{user.bot && <BotTag />}
                {isOwner && (
                  <Tooltip content={t('Server owner')}>
                    <Crown size={14} className="member-crown" />
                  </Tooltip>
                )}
              </span>
              {line && <span className={cn('member-sub truncate', line.streaming && 'is-streaming')}>{line.text}</span>}
            </span>
          </button>
        </UserPopover>
      </div>
    </ContextMenu>
  );
});

export function MemberList({ serverId, dmId }: { serverId?: ID; dmId?: ID }) {
  const server = useStore((s) => (serverId ? s.servers[serverId] : undefined));
  const dm = useStore((s) => (dmId ? s.dms[dmId] : undefined));
  const users = useStore((s) => s.users);

  const groups = useMemo(() => {
    const ids = server ? Object.keys(server.members) : (dm?.participantIds ?? []);
    const list = ids.map((id) => users[id]).filter(Boolean);
    const byName = (a: User, b: User) =>
      memberDisplayName({ servers: server ? { [server.id]: server } : {}, users }, a.id, server?.id).localeCompare(
        memberDisplayName({ servers: server ? { [server.id]: server } : {}, users }, b.id, server?.id),
        locale(),
      );
    const online = list.filter((u) => u.status !== 'offline');
    const offline = list.filter((u) => u.status === 'offline').sort(byName);
    const out: { key: string; label: string; color?: string | null; ids: ID[] }[] = [];
    if (server) {
      const hoisted = [...server.roles].filter((r) => r.hoist && !r.isDefault).sort((a, b) => b.position - a.position);
      const taken = new Set<ID>();
      hoisted.forEach((role) => {
        const members = online.filter((u) => !taken.has(u.id) && hoistRole(server, u.id)?.id === role.id).sort(byName);
        members.forEach((u) => taken.add(u.id));
        if (members.length) out.push({ key: role.id, label: role.name, color: role.color, ids: members.map((u) => u.id) });
      });
      const rest = online.filter((u) => !taken.has(u.id)).sort(byName);
      if (rest.length) out.push({ key: 'online', label: t('Online'), ids: rest.map((u) => u.id) });
    } else if (online.length) {
      out.push({ key: 'online', label: t('Online'), ids: online.sort(byName).map((u) => u.id) });
    }
    if (offline.length) out.push({ key: 'offline', label: t('Offline'), ids: offline.map((u) => u.id) });
    return out;
  }, [server, dm, users]);

  return (
    <aside className="members" aria-label={t('Members')}>
      {groups.map((g) => (
        <section key={g.key}>
          <SectionLabel className="members-group">
            <span className="truncate">
              {g.label} — {g.ids.length}
            </span>
          </SectionLabel>
          {g.ids.map((id) => (
            <MemberRow key={id} userId={id} serverId={server?.id} isOwner={server?.ownerId === id || dm?.ownerId === id} />
          ))}
        </section>
      ))}
      {serverId && <InstalledBots serverId={serverId}/>}
    </aside>
  );
}

function InstalledBots({serverId}:{serverId:string}) {
  const [apps,setApps]=useState<BotApp[]>([]);
  useEffect(()=>{
    if(!CLOUD)return;let active=true,version=0;
    const load=()=>{const request=++version;void Promise.all([botApps(),botInstalls()]).then(([bots,installs])=>{if(active&&request===version)setApps(bots.filter(b=>installs.some(i=>i.bot_id===b.id&&i.server_id===serverId)));}).catch(()=>{if(active&&request===version)setApps([]);});};
    load();const channel=supabase().channel(`member-bots:${serverId}`).on('postgres_changes',{event:'*',schema:'public',table:'bot_apps'},load).on('postgres_changes',{event:'*',schema:'public',table:'bot_installs',filter:`server_id=eq.${serverId}`},load).subscribe(status=>{if(status==='SUBSCRIBED')load();});
    return()=>{active=false;void supabase().removeChannel(channel);};
  },[serverId]);
  if(!apps.length)return null;
  return <section><SectionLabel className="members-group">{t('Bots')} — {apps.length}</SectionLabel>{apps.map(bot=><BotPopover key={bot.id} bot={bot}><button className="member"><Avatar user={{displayName:bot.name,avatarColor:'#64748b',avatar:bot.avatar?{kind:'image',src:bot.avatar}:undefined}} size={32}/><span className="member-name truncate">{bot.name}</span><BotTag verified={false}/></button></BotPopover>)}</section>;
}
