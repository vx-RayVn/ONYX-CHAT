/**
 * Web Push (cloud mode): notifications while no ONYX tab is open.
 *
 * Each device subscribes on its own (Settings › Notifications). The browser's
 * push subscription is stored with the account (push_subscriptions, only own
 * rows visible) together with the language and the preview/sound choice of
 * this device; the Edge Function "push" sends to it after the same rules as
 * the app. Signing out removes this device's subscription.
 */
import { CLOUD, SUPABASE_URL } from './config';
import { supabase } from './client';
import { store } from './bridge';
import { serviceWorker, serviceWorkerSupported } from '../notifications/sw';

export const pushSupported = () => CLOUD && serviceWorkerSupported() && 'PushManager' in window && 'Notification' in window;

function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64url.length / 4) * 4, '='));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array) {
  if (!a || a.byteLength !== b.length) return false;
  const x = new Uint8Array(a);
  return x.every((v, i) => v === b[i]);
}

async function serverKey(): Promise<Uint8Array<ArrayBuffer>> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/push`);
  if (!res.ok) throw new Error(`push key: ${res.status}`);
  const { publicKey } = (await res.json()) as { publicKey: string };
  return keyBytes(publicKey);
}

/** The push subscription of this browser, if there is one. */
export async function currentPushSubscription(): Promise<PushSubscription | null> {
  // Without permission there cannot be an active delivery subscription. In particular,
  // do not register a worker merely to switch accounts on browsers with Push disabled.
  if (!pushSupported()||Notification.permission!=='granted') return null;
  const reg = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL);
  return reg&&'pushManager'in reg ? reg.pushManager.getSubscription() : null;
}

async function save(sub: PushSubscription) {
  const json = sub.toJSON();
  const s = store().getState().settings;
  const { error } = await supabase().rpc('push_subscribe', {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys?.p256dh,
    p_auth: json.keys?.auth,
    p_lang: s.language,
    p_preview: s.notifyPreview,
    p_sound: s.notifySounds,
  });
  if (error) throw error;
}

/** Turns push on for this device (needs the notification permission). */
export async function enablePush(): Promise<void> {
  const reg = await serviceWorker();
  if (!reg) throw new Error('service worker unavailable');
  const key = await serverKey();
  let sub = await reg.pushManager.getSubscription();
  // A subscription made with another server key cannot be used any more.
  if (sub && !sameKey(sub.options.applicationServerKey, key)) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await save(sub);
}

/** Turns push off for this device: removes it from the account and from the browser. */
export async function disablePush(): Promise<void> {
  clearTimeout(timer);
  const sub = await currentPushSubscription();
  if (!sub) return;
  const {error}=await supabase().from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  if(error)throw error;
  await sub.unsubscribe();
}

let timer: ReturnType<typeof setTimeout> | undefined;

/**
 * Saves this device's entry again if push is on here – after sign-in (keys can
 * change) and when language, message preview or sounds change.
 */
export function refreshPush() {
  if (!pushSupported()) return;
  clearTimeout(timer);
  timer = setTimeout(async () => {
      const current=store().getState();
      if (!current.meId || current.users[current.meId]?.guest || Notification.permission !== 'granted') return;
    const sub = await currentPushSubscription().catch(() => null);
    if (sub) await save(sub).catch((e) => console.warn('[onyx] push update failed', e));
  }, 800);
}
