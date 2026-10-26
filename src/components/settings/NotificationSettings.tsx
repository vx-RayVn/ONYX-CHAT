/**
 * Settings › Notifications: popups and sounds of this device, the default for
 * servers, badges, all servers/channels/DMs with their own settings, and (demo)
 * simulated messages to try everything out.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AtSign, Bell, BellOff, BellRing, CircleSlash, MessageCircle, MonitorSmartphone, Play, RotateCcw, Send, Volume2 } from 'lucide-react';
import type { ID, NotifyLevel, NotifyPref } from '../../types';
import { useStore } from '../../store/store';
import { dmTitle } from '../../store/selectors';
import { isMuted } from '../../lib/notifyRules';
import { notificationsSupported, notifyPermission, testNotification } from '../../notifications/notifier';
import { playSound } from '../../notifications/sounds';
import { playVoiceSound, startRingback, startRingtone, type VoiceSound } from '../../voice/sounds';
import { demoTarget, simulateIncoming, type DemoKind } from '../../notifications/demo';
import { CLOUD } from '../../backend/config';
import { currentPushSubscription, disablePush, enablePush, pushSupported } from '../../backend/push';
import { describeError } from '../../backend/queue';
import { toast } from '../../store/ui';
import { t } from '../../i18n';
import { Button } from '../ui/Button';
import { Segmented, SettingRow, Slider, Switch } from '../ui/Field';
import { ServerIcon } from '../layout/ServerRail';
import { GroupIcon } from '../layout/HomeSidebar';
import { Avatar } from '../ui/Avatar';
import { ChannelIcon } from '../ui/icons';
import { enableDesktopNotifications } from '../notifications/NotifyBits';
import { LEVEL_LABEL, mutedText } from '../notifications/notifyMenus';
import { SettingsCard, SettingsHeader, SettingsSection } from './SettingsLayout';

function useSetting<K extends 'desktopNotifications' | 'notifyPreview' | 'notifySounds' | 'notifyVolume' | 'notifyTabBadge' | 'showUnreadBadges'>(key: K) {
  const value = useStore((s) => s.settings[key]);
  const setSetting = useStore((s) => s.setSetting);
  return [value, (v: typeof value) => setSetting(key, v)] as const;
}

/** Browser permission, updated when it changes (also from the browser's site settings). */
function usePermission() {
  const [perm, setPerm] = useState(notifyPermission);
  useEffect(() => {
    let status: PermissionStatus | null = null;
    const update = () => setPerm(notifyPermission());
    navigator.permissions
      ?.query({ name: 'notifications' })
      .then((s) => {
        status = s;
        s.addEventListener('change', update);
      })
      .catch(() => {});
    window.addEventListener('focus', update);
    return () => {
      status?.removeEventListener('change', update);
      window.removeEventListener('focus', update);
    };
  }, []);
  return [perm, () => setPerm(notifyPermission())] as const;
}

/** Shown in cloud mode: which settings follow the account and which stay on this device. */
function ScopeTag({ synced }: { synced: boolean }) {
  if (!CLOUD) return null;
  return (
    <span className="notify-scope-tag">
      <MonitorSmartphone size={12} />
      {synced ? t('All your devices') : t('This device')}
    </span>
  );
}

/* ---------------------------------------------------------------- */
/* Desktop popups                                                     */
/* ---------------------------------------------------------------- */

function DesktopSection() {
  const [desktop, setDesktop] = useSetting('desktopNotifications');
  const [preview, setPreview] = useSetting('notifyPreview');
  const [perm, refresh] = usePermission();
  const [busy, setBusy] = useState(false);

  const allow = async () => {
    setBusy(true);
    await enableDesktopNotifications();
    setBusy(false);
    refresh();
  };

  return (
    <SettingsSection title={t('Desktop notifications')} tag={<ScopeTag synced={false} />}>
      {perm === 'unsupported' && <p className="settings-section-desc">{t('Your browser does not support notifications.')}</p>}
      {perm === 'default' && (
        <SettingsCard className="notify-permission">
          <BellRing className="notify-permission-icon" />
          <div className="notify-permission-text">
            <strong>{t('Get a notice when someone writes to you')}</strong>
            <span>{t('ONYX asks your browser for permission once. Click “Allow” in the small window that appears next to the address bar. You can take the permission back at any time in the site settings.')}</span>
          </div>
          <Button onClick={allow} loading={busy} icon={<Bell />}>
            {t('Allow notifications')}
          </Button>
        </SettingsCard>
      )}
      {perm === 'denied' && (
        <SettingsCard className="notify-permission is-denied">
          <BellOff className="notify-permission-icon" />
          <div className="notify-permission-text">
            <strong>{t('Notifications are blocked for this site')}</strong>
            <span>{t('Your browser doesn’t let ONYX show notifications. Click the icon left of the address, set Notifications to “Allow” and reload the page.')}</span>
          </div>
        </SettingsCard>
      )}
      {perm === 'granted' && (
        <SettingRow
          title={t('Show desktop notifications')}
          description={t('A short notice for DMs, mentions and – depending on your settings – other messages, while ONYX is in the background.')}
          control={<Switch checked={desktop} onChange={(v) => (v ? void allow() : setDesktop(false))} label={t('Show desktop notifications')} />}
        />
      )}
      <SettingRow
        title={t('Show message text')}
        description={t('Off: notifications only say who wrote where – useful when others can see your screen.')}
        control={<Switch checked={preview} onChange={setPreview} label={t('Show message text')} />}
        disabled={perm !== 'granted'}
      />
      {perm === 'granted' && desktop && (
        <div className="row-actions inset">
          <Button variant="secondary" size="sm" icon={<Send />} onClick={() => void testNotification()}>
            {t('Send test notification')}
          </Button>
        </div>
      )}
      <PushRow granted={perm === 'granted'} />
    </SettingsSection>
  );
}

/** Web Push (cloud): notices also while no ONYX tab is open – switched per device. */
function PushRow({ granted }: { granted: boolean }) {
  const [state, setState] = useState<'unknown' | 'on' | 'off'>('unknown');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!granted || !pushSupported()) return setState('off');
    let alive = true;
    currentPushSubscription()
      .then((sub) => alive && setState(sub ? 'on' : 'off'))
      .catch(() => alive && setState('off'));
    return () => {
      alive = false;
    };
  }, [granted]);
  if (!pushSupported()) return null;

  const toggle = async (on: boolean) => {
    setBusy(true);
    try {
      if (on) {
        await enablePush();
        toast({ tone: 'success', title: t('Push notifications are on for this device') });
      } else await disablePush();
      setState(on ? 'on' : 'off');
    } catch (e) {
      toast({ tone: 'danger', title: t('Couldn’t change push notifications'), body: describeError(e) });
    }
    setBusy(false);
  };

  return (
    <SettingRow
      title={t('Also when ONYX is closed')}
      description={t('Uses your browser’s push service, so notices arrive without an open ONYX tab. Turn it on separately on each device. The push service only passes the content on encrypted.')}
      control={<Switch checked={state === 'on'} onChange={(v) => void toggle(v)} disabled={!granted || busy || state === 'unknown'} label={t('Also when ONYX is closed')} />}
      disabled={!granted}
    />
  );
}

/* ---------------------------------------------------------------- */
/* Sounds                                                             */
/* ---------------------------------------------------------------- */

function SoundSection() {
  const [sounds, setSounds] = useSetting('notifySounds');
  const [volume, setVolume] = useSetting('notifyVolume');
  const stop = useRef<(() => void) | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [preview, setPreview] = useState<string | null>(null);
  const stopPreview = () => {
    stop.current?.();
    stop.current = undefined;
    clearTimeout(timer.current);
  };
  useEffect(() => () => stopPreview(), []);
  useEffect(() => { if (!sounds) { stopPreview(); setPreview(null); } }, [sounds]);
  const listen = (kind: VoiceSound | 'ring' | 'ringback') => {
    stopPreview();
    if (preview === kind) { setPreview(null); return; }
    setPreview(kind);
    if (kind === 'ring') stop.current = startRingtone(volume);
    else if (kind === 'ringback') stop.current = startRingback(volume);
    else playVoiceSound(kind, volume);
    timer.current = setTimeout(() => { stopPreview(); setPreview(null); }, kind === 'ring' || kind === 'ringback' ? 2800 : 700);
  };
  return (
    <SettingsSection title={t('Sounds')} tag={<ScopeTag synced={false} />}>
      <SettingRow
        title={t('Play sounds')}
        description={t('A soft tone for new messages, a brighter one for mentions and DMs. Never for the chat you’re looking at.')}
        control={<Switch checked={sounds} onChange={setSounds} label={t('Play sounds')} />}
      />
      {sounds && (
        <>
          <div className="notify-volume">
            <Volume2 size={18} />
            <Slider value={volume} min={0} max={100} step={5} onChange={setVolume} label={t('Volume')} format={(v) => `${v} %`} />
          </div>
          <div className="row-actions inset sound-previews" aria-label={t('Voice sounds')}>
            {([
              ['ring', t('Incoming call')], ['ringback', t('Outgoing call')],
              ['join', t('Join voice channel')], ['leave', t('Disconnect')],
              ['mute', t('Mute')], ['unmute', t('Unmute')],
              ['deafen', t('Deafen')], ['undeafen', t('Undeafen')],
            ] as const).map(([kind, label]) => (
              <Button key={kind} variant="secondary" size="sm" icon={<Play />} aria-pressed={preview === kind} onClick={() => listen(kind)}>{label}</Button>
            ))}
          </div>
          <div className="row-actions inset">
            <Button variant="secondary" size="sm" icon={<Play />} onClick={() => { stopPreview(); setPreview(null); playSound('message', volume); }}>
              {t('Message')}
            </Button>
            <Button variant="secondary" size="sm" icon={<Play />} onClick={() => { stopPreview(); setPreview(null); playSound('mention', volume); }}>
              {t('Mention & DM')}
            </Button>
          </div>
        </>
      )}
    </SettingsSection>
  );
}

/* ---------------------------------------------------------------- */
/* Defaults, status, badges                                           */
/* ---------------------------------------------------------------- */

function DefaultsSection() {
  const level = useStore((s) => s.notifyDefault);
  const setDefault = useStore((s) => s.setNotifyDefault);
  const dnd = useStore((s) => s.users[s.meId]?.status === 'dnd');
  const setStatus = useStore((s) => s.setStatus);
  return (
    <SettingsSection title={t('Servers')} tag={<ScopeTag synced />} description={t('Applies to every server and channel without its own setting. Direct messages always notify you – unless you mute them.')}>
      <SettingRow
        title={t('Notify me about')}
        control={
          <Segmented<NotifyLevel>
            value={level}
            onChange={setDefault}
            label={t('Notify me about')}
            options={[
              { value: 'all', label: t(LEVEL_LABEL.all) },
              { value: 'mentions', label: t(LEVEL_LABEL.mentions) },
              { value: 'nothing', label: t(LEVEL_LABEL.nothing) },
            ]}
          />
        }
      />
      <SettingRow
        title={t('Do Not Disturb')}
        description={dnd ? t('Your status is “Do not disturb”: no popups and no sounds. Counters keep working.') : t('With the status “Do not disturb” ONYX shows no popups and plays no sounds. Counters keep working.')}
        control={
          dnd ? (
            <Button size="sm" variant="secondary" onClick={() => setStatus('online')}>
              {t('Set to online')}
            </Button>
          ) : (
            <Button size="sm" variant="secondary" icon={<CircleSlash />} onClick={() => setStatus('dnd')}>
              {t('Turn on')}
            </Button>
          )
        }
      />
    </SettingsSection>
  );
}

function BadgeSection() {
  const [badges, setBadges] = useSetting('showUnreadBadges');
  const [tab, setTab] = useSetting('notifyTabBadge');
  return (
    <SettingsSection title={t('Badges')} tag={<ScopeTag synced={false} />}>
      <SettingRow
        title={t('Show unread badges')}
        description={t('Red mention counters and unread markers in the server rail.')}
        control={<Switch checked={badges} onChange={setBadges} label={t('Unread badges')} />}
      />
      <SettingRow
        title={t('Count in the browser tab')}
        description={t('Shows the number of mentions, DMs and friend requests in the tab title and on the tab icon, e.g. “(3) ONYX”.')}
        control={<Switch checked={tab} onChange={setTab} label={t('Count in the browser tab')} />}
      />
    </SettingsSection>
  );
}

/* ---------------------------------------------------------------- */
/* Servers, channels and DMs with their own settings                  */
/* ---------------------------------------------------------------- */

function prefSummary(pref: NotifyPref) {
  const parts: string[] = [];
  if (pref.level) parts.push(t(LEVEL_LABEL[pref.level]));
  if (isMuted(pref, Date.now())) parts.push(mutedText(pref));
  if (pref.suppressEveryone) parts.push(t('@everyone suppressed'));
  if (pref.suppressRoles) parts.push(t('Role mentions suppressed'));
  return parts.join(' · ');
}

function OverrideRow({ id, pref }: { id: ID; pref: NotifyPref }) {
  const s = useStore.getState();
  const reset = useStore((st) => st.resetNotifyPref);
  const server = s.servers[id];
  const channel = s.channels[id];
  const dm = s.dms[id];
  let icon = null;
  let name = '';
  if (server) {
    icon = <ServerIcon server={server} size={28} />;
    name = server.name;
  } else if (channel) {
    icon = (
      <span className="notify-override-channel">
        <ChannelIcon type={channel.type} size={18} />
      </span>
    );
    name = `${channel.name} · ${s.servers[channel.serverId]?.name ?? ''}`;
  } else if (dm) {
    const other = s.users[dm.participantIds.find((p) => p !== s.meId) ?? ''];
    icon = dm.type === 'group' ? <GroupIcon dm={dm} size={28} /> : <Avatar user={other} size={28} />;
    name = dmTitle(s, dm);
  } else return null;
  const summary = prefSummary(pref);
  if (!summary) return null;
  return (
    <div className="notify-override">
      {icon}
      <div className="notify-override-text">
        <strong className="truncate">{name}</strong>
        <span className="truncate">{summary}</span>
      </div>
      <Button size="sm" variant="ghost" icon={<RotateCcw />} onClick={() => reset(id)}>
        {t('Reset')}
      </Button>
    </div>
  );
}

function OverridesSection() {
  const prefs = useStore((s) => s.notifyPrefs);
  const known = useStore((s) => s.servers);
  const entries = Object.entries(prefs).filter(([, p]) => prefSummary(p));
  // Servers first, then channels, then DMs.
  const order = (id: ID) => (known[id] ? 0 : useStore.getState().channels[id] ? 1 : 2);
  entries.sort((a, b) => order(a[0]) - order(b[0]));
  return (
    <SettingsSection title={t('Own settings')} tag={<ScopeTag synced />} description={t('Right-click a server, channel or conversation (or use the bell at the top of a chat) to change how it notifies you.')}>
      {entries.length === 0 ? (
        <p className="notify-empty">{t('Nothing set yet – everything follows the defaults above.')}</p>
      ) : (
        <SettingsCard className="notify-overrides">
          {entries.map(([id, pref]) => (
            <OverrideRow key={id} id={id} pref={pref} />
          ))}
        </SettingsCard>
      )}
    </SettingsSection>
  );
}

/* ---------------------------------------------------------------- */
/* Demo: simulated messages                                           */
/* ---------------------------------------------------------------- */

const DEMO_DELAY = 5;

function DemoSection() {
  const [pending, setPending] = useState<{ kind: DemoKind; left: number } | null>(null);
  useEffect(() => {
    if (!pending) return;
    if (pending.left <= 0) {
      simulateIncoming(pending.kind);
      setPending(null);
      return;
    }
    const id = window.setTimeout(() => setPending({ ...pending, left: pending.left - 1 }), 1000);
    return () => window.clearTimeout(id);
  }, [pending]);

  const kinds: { kind: DemoKind; label: string; icon: ReactNode }[] = [
    { kind: 'message', label: t('Message in a channel'), icon: <MessageCircle /> },
    { kind: 'mention', label: t('Mention of you'), icon: <AtSign /> },
    { kind: 'dm', label: t('Direct message'), icon: <Send /> },
  ];

  return (
    <SettingsSection title={t('Try it out')} description={t('Demo: a sample user writes to you {seconds} seconds after the click. Switch to another tab or app in the meantime to see the popup.', { seconds: DEMO_DELAY })}>
      <div className="row-actions">
        {kinds.map(({ kind, label, icon }) => {
          const target = demoTarget(kind);
          return (
            <Button key={kind} variant="secondary" size="sm" icon={icon} disabled={!target || !!pending} title={target?.label} onClick={() => setPending({ kind, left: DEMO_DELAY })}>
              {pending?.kind === kind ? t('Arrives in {seconds} s …', { seconds: pending.left }) : label}
            </Button>
          );
        })}
      </div>
    </SettingsSection>
  );
}

export function NotificationSettings() {
  return (
    <>
      <SettingsHeader title={t('Notifications')} description={t('Choose when ONYX lets you know about new messages – and when it stays quiet.')} />
      {notificationsSupported() || <p className="settings-section-desc">{t('Your browser does not support notifications.')}</p>}
      <DesktopSection />
      <SoundSection />
      <DefaultsSection />
      <BadgeSection />
      <OverridesSection />
      {!CLOUD && <DemoSection />}
    </>
  );
}
