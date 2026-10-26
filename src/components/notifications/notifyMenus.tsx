/**
 * "Notifications" and "Mute" entries for the context menus of servers,
 * channels and DMs (and the bell in the chat header).
 */
import type { ReactNode } from 'react';
import { AtSign, Bell, BellOff, BellRing, Volume2 } from 'lucide-react';
import type { ID, NotifyLevel, NotifyPref } from '../../types';
import { useStore } from '../../store/store';
import { toast } from '../../store/ui';
import { MUTE_DURATIONS, isMuted } from '../../lib/notifyRules';
import { formatClock, isSameDay } from '../../lib/utils';
import { locale, t, tk } from '../../i18n';
import type { MenuEntry, MenuSpec } from '../ui/Menu';

export const LEVEL_LABEL: Record<NotifyLevel, string> = {
  all: tk('All messages'),
  mentions: tk('Only @mentions'),
  nothing: tk('Nothing'),
};

export const LEVEL_ICON: Record<NotifyLevel, ReactNode> = {
  all: <BellRing />,
  mentions: <AtSign />,
  nothing: <BellOff />,
};

export function durationLabel(ms: number | null) {
  switch (ms) {
    case 15 * 60_000:
      return t('For 15 minutes');
    case 60 * 60_000:
      return t('For 1 hour');
    case 8 * 60 * 60_000:
      return t('For 8 hours');
    case 24 * 60 * 60_000:
      return t('For 24 hours');
    default:
      return t('Until I turn it back on');
  }
}

/** "Muted until 14:30", "Muted until Tue 09:15" or just "Muted". */
export function mutedText(pref: NotifyPref | undefined, use24h = useStore.getState().settings.use24h) {
  if (!pref?.muted) return '';
  if (!pref.muteUntil) return t('Muted');
  const time = isSameDay(pref.muteUntil, Date.now())
    ? formatClock(pref.muteUntil, use24h)
    : new Intl.DateTimeFormat(locale(), { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: !use24h }).format(pref.muteUntil);
  return t('Muted until {time}', { time });
}

type ScopeKind = 'server' | 'channel' | 'dm';

const MUTE_LABEL: Record<ScopeKind, [string, string]> = {
  server: [tk('Mute server'), tk('Unmute server')],
  channel: [tk('Mute channel'), tk('Unmute channel')],
  dm: [tk('Mute conversation'), tk('Unmute conversation')],
};

/** "Mute …" with durations, or "Unmute …" with the end time as hint. */
export function muteEntry(scopeId: ID, kind: ScopeKind): MenuEntry {
  const s = useStore.getState();
  const pref = s.notifyPrefs[scopeId];
  const [mute, unmute] = MUTE_LABEL[kind];
  if (isMuted(pref, Date.now())) return { label: t(unmute), icon: <Bell />, hint: mutedText(pref), onSelect: () => s.unmuteScope(scopeId) };
  return {
    type: 'sub',
    label: t(mute),
    icon: <BellOff />,
    items: MUTE_DURATIONS.map((d) => ({
      label: durationLabel(d),
      onSelect: () => {
        useStore.getState().muteScope(scopeId, d);
        toast({ title: t('Muted'), body: d === null ? t('Until you turn it back on.') : mutedText(useStore.getState().notifyPrefs[scopeId]) });
      },
    })),
  };
}

function levelRadios(current: NotifyLevel | undefined, inherited: NotifyLevel, inheritLabel: string, set: (l: NotifyLevel | undefined) => void): MenuSpec {
  return [
    { type: 'radio', label: inheritLabel, hint: t(LEVEL_LABEL[inherited]), checked: !current, onSelect: () => set(undefined) },
    ...(['all', 'mentions', 'nothing'] as const).map<MenuEntry>((l) => ({ type: 'radio', label: t(LEVEL_LABEL[l]), icon: LEVEL_ICON[l], checked: current === l, onSelect: () => set(l) })),
  ];
}

/** Level and suppression of a server (“Mute server” sits next to it in the menus). */
export function serverNotifyItems(serverId: ID): MenuSpec {
  const s = useStore.getState();
  const pref = s.notifyPrefs[serverId];
  return [
    { type: 'label', label: t('Notify me about') },
    ...levelRadios(pref?.level, s.notifyDefault, t('Default'), (l) => s.setNotifyLevel(serverId, l)),
    { type: 'separator' },
    { type: 'check', label: t('Suppress @everyone and @here'), checked: !!pref?.suppressEveryone, keepOpen: true, onSelect: () => s.setSuppress(serverId, 'suppressEveryone', !useStore.getState().notifyPrefs[serverId]?.suppressEveryone) },
    { type: 'check', label: t('Suppress role mentions'), checked: !!pref?.suppressRoles, keepOpen: true, onSelect: () => s.setSuppress(serverId, 'suppressRoles', !useStore.getState().notifyPrefs[serverId]?.suppressRoles) },
  ];
}

export function serverNotifyMenu(serverId: ID): MenuEntry {
  return { type: 'sub', label: t('Notification settings'), icon: <Bell />, items: serverNotifyItems(serverId) };
}

/** Level of a channel (inherits from the server); with `withMute` also the mute entry (bell in the chat header). */
export function channelNotifyItems(channelId: ID, withMute = true): MenuSpec {
  const s = useStore.getState();
  const channel = s.channels[channelId];
  if (!channel) return [];
  const pref = s.notifyPrefs[channelId];
  const serverLevel = s.notifyPrefs[channel.serverId]?.level ?? s.notifyDefault;
  const serverMuted = isMuted(s.notifyPrefs[channel.serverId], Date.now());
  return [
    withMute && muteEntry(channelId, 'channel'),
    serverMuted && { label: t('The whole server is muted'), icon: <Volume2 />, hint: t('Unmute server'), onSelect: () => s.unmuteScope(channel.serverId) },
    (withMute || serverMuted) && { type: 'separator' },
    { type: 'label', label: t('Notify me about') },
    ...levelRadios(pref?.level, serverLevel, t('Use server setting'), (l) => s.setNotifyLevel(channelId, l)),
  ];
}

export function channelNotifyMenu(channelId: ID): MenuEntry {
  return { type: 'sub', label: t('Notification settings'), icon: <Bell />, items: channelNotifyItems(channelId, false) };
}
