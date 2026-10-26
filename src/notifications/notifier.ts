/**
 * Notifications for new messages from other people.
 *
 * Cloud mode calls `handleIncoming` for every message INSERT from Realtime,
 * the demo for its simulated messages. The rules (src/lib/notifyRules.ts)
 * decide whether a message alerts at all; this module adds what only the
 * browser knows:
 *
 *  - tab visible and exactly this chat open → nothing (the user sees it)
 *  - window focused, another chat open      → sound only
 *  - otherwise                               → desktop popup + sound
 *
 * Popups are bundled: further messages of the same chat replace the popup
 * quietly ("+3 more"), and more than four new chats within ten seconds become
 * one summary. Clicking a popup focuses the window and jumps to the message.
 */
import type { ID, Message } from '../types';
import { useStore } from '../store/store';
import { useUI, showMainPane } from '../store/ui';
import { dmTitle, memberDisplayName, notifyDecision } from '../store/selectors';
import { attachmentLabel, previewText, truncatePreview, type AlertKind } from '../lib/notifyRules';
import { cloudHooks } from '../backend/bridge';
import { refreshPush } from '../backend/push';
import { BRAND, BRAND_IMAGES } from '../config/brand';
import { t, tn } from '../i18n';
import { playThrottled, unlockAudioOnInteraction } from './sounds';
import { registeredWorker, serviceWorker } from './sw';

/** Messages older than this (e.g. delivered after a reconnect) stay quiet. */
const MAX_AGE_MS = 5 * 60_000;
/** Messages of a chat within this time update the same popup. */
const BUNDLE_MS = 2 * 60_000;
/** More than BURST new popups within BURST_MS become one summary. */
const BURST = 4;
const BURST_MS = 10_000;

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window;
export const notifyPermission = (): NotificationPermission | 'unsupported' => (notificationsSupported() ? Notification.permission : 'unsupported');

export { serviceWorker };

type PopupOptions = NotificationOptions & { renotify?: boolean; timestamp?: number; data: PopupTarget };

export interface PopupTarget {
  scopeId: ID;
  messageId?: ID;
}

/** Popups shown with `new Notification` (fallback), by tag – so they can be closed again. */
const pagePopups = new Map<string, Notification>();

async function show(title: string, options: PopupOptions) {
  const reg = await serviceWorker();
  if (reg) {
    await reg.showNotification(title, options);
    return;
  }
  const n = new Notification(title, options);
  n.onclick = () => {
    n.close();
    openTarget(options.data);
  };
  if (options.tag) pagePopups.set(options.tag, n);
}

async function closeTag(tag: string) {
  pagePopups.get(tag)?.close();
  pagePopups.delete(tag);
  const reg = await registeredWorker();
  const open = await reg?.getNotifications({ tag }).catch(() => []);
  open?.forEach((n) => n.close());
}

/* ---------------------------------------------------------------- */
/* Opening a chat from a popup                                        */
/* ---------------------------------------------------------------- */

/** Focuses the window, opens the chat and highlights the message (waits briefly while cloud data loads). */
export function openTarget(target: PopupTarget) {
  window.focus();
  if (!target.scopeId) return;
  const go = () => {
    const s = useStore.getState();
    const channel = s.channels[target.scopeId];
    if (s.dms[target.scopeId]) s.openDM(target.scopeId);
    else if (channel) s.selectChannel(channel.serverId, channel.id);
    else return false;
    const ui = useUI.getState();
    ui.closeSettings();
    ui.closeModal();
    showMainPane();
    if (target.messageId) window.setTimeout(() => useUI.getState().flash(target.messageId!), 120);
    return true;
  };
  if (go()) return;
  const timer = window.setTimeout(() => unsubscribe(), 20_000);
  const unsubscribe = useStore.subscribe(() => {
    if (!go()) return;
    unsubscribe();
    window.clearTimeout(timer);
  });
}

/* ---------------------------------------------------------------- */
/* Text of a popup                                                    */
/* ---------------------------------------------------------------- */

/** Readable one-line preview: names instead of tokens, spoilers and code hidden. */
export function popupPreview(content: string, serverId: ID | null) {
  const s = useStore.getState();
  const server = serverId ? s.servers[serverId] : undefined;
  return previewText(content, {
    user: (id) => (s.users[id] ? memberDisplayName(s, id, serverId) : t('unknown')),
    role: (id) => server?.roles.find((r) => r.id === id)?.name ?? t('unknown'),
    channel: (id) => s.channels[id]?.name ?? t('channel'),
    code: t('Code'),
    spoiler: t('Spoiler'),
  });
}

const ATTACHMENT_TEXT = {
  voice: () => t('Voice message'),
  image: () => t('Image'),
  video: () => t('Video'),
  audio: () => t('Audio'),
  file: () => t('File'),
};

function popupFor(m: Message, kind: AlertKind, count: number) {
  const s = useStore.getState();
  const channel = s.channels[m.channelId];
  const dm = s.dms[m.channelId];
  const serverId = channel?.serverId ?? null;
  const sender = memberDisplayName(s, m.authorId, serverId);
  let title = sender;
  if (channel) title = t('{name} in #{channel} ({server})', { name: sender, channel: channel.name, server: s.servers[channel.serverId]?.name ?? '' });
  else if (dm?.type === 'group') title = t('{name} in {group}', { name: sender, group: dmTitle(s, dm) });

  let body: string;
  if (kind === 'call') body = t('Calling you …');
  else if (!s.settings.notifyPreview) body = kind === 'mention' ? t('Mentioned you') : kind === 'dm' ? t('Sent you a message') : t('New message');
  else {
    const label = attachmentLabel(m.attachments);
    body = truncatePreview(popupPreview(m.content, serverId)) || (label ? ATTACHMENT_TEXT[label]() : t('New message'));
  }
  if (count > 1) body += `\n${tn(count - 1, '+{count} more message', '+{count} more messages')}`;

  const avatar = s.users[m.authorId]?.avatar;
  const image = avatar?.kind === 'image' ? (avatar.poster ?? avatar.src) : undefined;
  const icon = image && !/\.(mp4|webm|mov)(\?|$)/i.test(image) ? image : BRAND_IMAGES.appIcon;
  return { title, body, icon };
}

/* ---------------------------------------------------------------- */
/* Incoming messages                                                  */
/* ---------------------------------------------------------------- */

interface Bundle {
  count: number;
  lastAt: number;
  /** Time of the newest message in it (read state at or after this closes the popup). */
  lastCreatedAt: number;
}

const bundles = new Map<ID, Bundle>();
const recentPopups: number[] = [];
let summary = { until: 0, messages: 0, chats: new Set<ID>() };

function chatInView(scopeId: ID) {
  const v = useStore.getState().view;
  const open = (v.kind === 'dm' && v.dmId === scopeId) || (v.kind === 'server' && v.channelId === scopeId);
  return open && !useUI.getState().settings && document.visibilityState === 'visible';
}

const windowFocused = () => document.visibilityState === 'visible' && document.hasFocus();

export function handleIncoming(scopeId: ID, messageId: ID) {
  const s = useStore.getState();
  const m = s.messages[scopeId]?.find((x) => x.id === messageId);
  if (!m || Date.now() - m.createdAt > MAX_AGE_MS) return;
  const d = notifyDecision(s, m);
  if (!d || d.alert === 'none' || chatInView(scopeId)) return;
  const { settings } = s;
  // A call rings with its own tone (incoming call window); the popup is only for when ONYX is in the background.
  if (settings.notifySounds && d.alert !== 'call') playThrottled(d.alert === 'message' ? 'message' : 'mention', settings.notifyVolume, scopeId);
  if (!windowFocused() && settings.desktopNotifications && notifyPermission() === 'granted') void popup(m, d.alert).catch((e) => console.warn('[onyx] notification failed', e));
}

async function popup(m: Message, kind: AlertKind) {
  const now = Date.now();
  const scopeId = m.channelId;
  let bundle = bundles.get(scopeId);
  if (bundle && now - bundle.lastAt > BUNDLE_MS) bundle = undefined;

  if (!bundle) {
    while (recentPopups.length && now - recentPopups[0] > BURST_MS) recentPopups.shift();
    if (recentPopups.length >= BURST || now < summary.until) return showSummary(scopeId, now);
    recentPopups.push(now);
  }
  const next: Bundle = { count: (bundle?.count ?? 0) + 1, lastAt: now, lastCreatedAt: m.createdAt };
  bundles.set(scopeId, next);
  const { title, body, icon } = popupFor(m, kind, next.count);
  await show(title, {
    body,
    icon,
    badge: BRAND_IMAGES.onyxMark.sm,
    tag: `onyx:${scopeId}`,
    // Updates of a bundle replace the popup without alerting again; ONYX plays its own sound.
    renotify: false,
    silent: true,
    timestamp: m.createdAt,
    data: { scopeId, messageId: m.id },
  });
}

async function showSummary(scopeId: ID, now: number) {
  if (now >= summary.until) summary = { until: 0, messages: 0, chats: new Set() };
  summary.until = now + BURST_MS;
  summary.messages++;
  summary.chats.add(scopeId);
  const chats = summary.chats.size;
  await show(BRAND.name, {
    body: chats > 1 ? t('{messages} new messages in {chats} chats', { messages: summary.messages, chats }) : tn(summary.messages, '{count} new message', '{count} new messages'),
    icon: BRAND_IMAGES.appIcon,
    badge: BRAND_IMAGES.onyxMark.sm,
    tag: 'onyx:summary',
    renotify: false,
    silent: true,
    data: { scopeId },
  });
}

/** The button in the settings: shows what a popup looks like. */
export async function testNotification() {
  await show(BRAND.name, {
    body: t('This is what ONYX notifications look like. 💚'),
    icon: BRAND_IMAGES.appIcon,
    badge: BRAND_IMAGES.onyxMark.sm,
    tag: 'onyx:test',
    silent: true,
    data: { scopeId: '' },
  });
}

/* ---------------------------------------------------------------- */
/* Setup                                                              */
/* ---------------------------------------------------------------- */

let started = false;

/** Wires everything up once (called by App). */
export function initNotifications() {
  if (started) return;
  started = true;
  cloudHooks.incomingMessage = handleIncoming;
  unlockAudioOnInteraction();

  // Clicks on popups shown by the service worker (also Web Push) arrive as messages.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (e: MessageEvent) => {
      const data = e.data as { type?: string; scopeId?: ID; messageId?: ID } | null;
      if (data?.type === 'onyx:open' && data.scopeId) openTarget({ scopeId: data.scopeId, messageId: data.messageId });
    });
  }
  if (useStore.getState().settings.desktopNotifications) void serviceWorker();

  // A popup opened the app in a new tab (?chat=…&msg=…).
  const params = new URLSearchParams(location.search);
  const chat = params.get('chat');
  if (chat) {
    openTarget({ scopeId: chat, messageId: params.get('msg') ?? undefined });
    params.delete('chat');
    params.delete('msg');
    const query = params.toString().replace(/=(&|$)/g, '$1');
    history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
  }

  // Read here or on another device: the popup of that chat is no longer needed.
  useStore.subscribe((s, prev) => {
    if (s.readState === prev.readState) return;
    for (const [id, b] of bundles) {
      if ((s.readState[id] ?? 0) < b.lastCreatedAt) continue;
      bundles.delete(id);
      void closeTag(`onyx:${id}`);
    }
  });

  // Coming back to the tab marks the open chat as read (the message list only does this while visible).
  const markOpenChatRead = () => {
    if (document.visibilityState !== 'visible' || useUI.getState().settings) return;
    const s = useStore.getState();
    const v = s.view;
    const id = v.kind === 'dm' ? v.dmId : v.kind === 'server' ? v.channelId : null;
    if (id && s.channels[id]?.type !== 'voice') s.markRead(id);
  };
  document.addEventListener('visibilitychange', markOpenChatRead);
  window.addEventListener('focus', markOpenChatRead);
  useUI.subscribe((u, prev) => prev.settings && !u.settings && markOpenChatRead());

  // Timed mutes run out on their own.
  let timer: number | undefined;
  const scheduleExpiry = () => {
    window.clearTimeout(timer);
    const now = Date.now();
    const next = Math.min(...Object.values(useStore.getState().notifyPrefs).map((p) => (p.muted && p.muteUntil && p.muteUntil > now ? p.muteUntil : Infinity)));
    if (Number.isFinite(next)) timer = window.setTimeout(() => useStore.getState().expireMutes(), Math.min(next - now + 250, 2 ** 31 - 1));
  };
  useStore.getState().expireMutes();
  scheduleExpiry();
  useStore.subscribe((s, prev) => s.notifyPrefs !== prev.notifyPrefs && scheduleExpiry());

  // Web Push (cloud): keep this device's entry current (sign-in, language, preview, sounds).
  refreshPush();
  useStore.subscribe((s, prev) => {
    const a = s.settings;
    const b = prev.settings;
    if (s.meId !== prev.meId || a.language !== b.language || a.notifyPreview !== b.notifyPreview || a.notifySounds !== b.notifySounds) refreshPush();
  });
}
