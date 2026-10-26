/**
 * Small notification UI pieces: the bell in the chat header and the friendly
 * prompt that asks for the browser permission.
 */
import { useState } from 'react';
import { Bell, BellOff, BellRing, X } from 'lucide-react';
import type { ID } from '../../types';
import { useStore } from '../../store/store';
import { toast } from '../../store/ui';
import { scopeMuted } from '../../store/selectors';
import { MUTE_DURATIONS } from '../../lib/notifyRules';
import { notificationsSupported, serviceWorker } from '../../notifications/notifier';
import { t } from '../../i18n';
import { Button, IconButton } from '../ui/Button';
import { Dropdown, type MenuSpec } from '../ui/Menu';
import { channelNotifyItems, durationLabel, mutedText } from './notifyMenus';

/* ---------------------------------------------------------------- */
/* Bell in the chat header                                            */
/* ---------------------------------------------------------------- */

function dmItems(dmId: ID): MenuSpec {
  const s = useStore.getState();
  if (scopeMuted(s, dmId)) return [{ label: t('Unmute conversation'), icon: <Bell />, hint: mutedText(s.notifyPrefs[dmId]), onSelect: () => s.unmuteScope(dmId) }];
  return [{ type: 'label', label: t('Mute conversation') }, ...MUTE_DURATIONS.map((d) => ({ label: durationLabel(d), onSelect: () => useStore.getState().muteScope(dmId, d) }))];
}

export function NotifyBell({ scopeId, kind, className }: { scopeId: ID; kind: 'channel' | 'dm'; className?: string }) {
  // Re-render when any setting changes – the menu shows the server's state as well.
  useStore((s) => s.notifyPrefs);
  useStore((s) => s.notifyDefault);
  const muted = useStore((s) => scopeMuted(s, scopeId));
  const custom = useStore((s) => !!s.notifyPrefs[scopeId]?.level);
  const [open, setOpen] = useState(false);
  const label = muted ? mutedText(useStore.getState().notifyPrefs[scopeId]) : t('Notification settings');
  return (
    <Dropdown
      open={open}
      onOpenChange={setOpen}
      align="end"
      items={open ? (kind === 'channel' ? channelNotifyItems(scopeId) : dmItems(scopeId)) : []}
      trigger={
        <IconButton label={label} title={label} tooltip={false} active={muted || open} className={className}>
          {muted ? <BellOff /> : custom ? <BellRing /> : <Bell />}
        </IconButton>
      }
    />
  );
}

/* ---------------------------------------------------------------- */
/* Permission                                                         */
/* ---------------------------------------------------------------- */

/** Asks the browser for permission (must run from a click) and turns popups on when it is granted. */
export async function enableDesktopNotifications(): Promise<boolean> {
  if (!notificationsSupported()) {
    toast({ tone: 'danger', title: t('Your browser does not support notifications.') });
    return false;
  }
  let permission = Notification.permission;
  if (permission === 'default') permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    toast({
      tone: 'danger',
      title: t('Notifications blocked'),
      body: t('Allow notifications for this site in your browser: click the icon left of the address and set Notifications to “Allow”.'),
    });
    return false;
  }
  useStore.getState().setSetting('desktopNotifications', true);
  void serviceWorker();
  toast({ tone: 'success', title: t('Notifications are on'), body: t('ONYX lets you know about DMs and mentions while you’re somewhere else.') });
  return true;
}

const PROMPT_KEY = 'onyx-notify-prompt';

function promptDismissed() {
  try {
    return localStorage.getItem(PROMPT_KEY) === 'dismissed';
  } catch {
    return true;
  }
}

/** A friendly bar above the chat until notifications are allowed or the user says "not now". */
export function NotifyPrompt() {
  const enabled = useStore((s) => s.settings.desktopNotifications);
  const [hidden, setHidden] = useState(promptDismissed);
  const [busy, setBusy] = useState(false);
  if (hidden || enabled || !notificationsSupported() || Notification.permission !== 'default') return null;
  const dismiss = () => {
    try {
      localStorage.setItem(PROMPT_KEY, 'dismissed');
    } catch {
      /* private mode */
    }
    setHidden(true);
  };
  return (
    <div className="notify-prompt" role="status">
      <BellRing size={18} className="notify-prompt-icon" />
      <div className="notify-prompt-text">
        <strong>{t('Don’t miss DMs and mentions')}</strong>
        <span>{t('ONYX can show a short notice when someone writes to you while you’re in another tab. Your browser asks for permission once.')}</span>
      </div>
      <Button
        size="sm"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          const ok = await enableDesktopNotifications();
          setBusy(false);
          if (!ok) dismiss();
        }}
      >
        {t('Turn on')}
      </Button>
      <IconButton label={t('Not now')} size="sm" onClick={dismiss}>
        <X />
      </IconButton>
    </div>
  );
}
