/**
 * ONYX service worker – notifications only, no caching.
 *
 *  - shows the popups of the open app (same tag = replaced quietly)
 *  - click on a popup: focus an open ONYX tab and jump to the message,
 *    or open ONYX in a new tab (?chat=…&msg=…)
 *  - Web Push: shows notifications while no ONYX tab is visible
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

async function windows() {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true });
}

async function openChat(data) {
  const all = await windows();
  const client = all.find((c) => c.focused) || all.find((c) => c.visibilityState === 'visible') || all[0];
  if (client) {
    try {
      await client.focus();
    } catch {
      /* focusing is not always allowed */
    }
    client.postMessage({ type: 'onyx:open', scopeId: data.scopeId, messageId: data.messageId });
    return;
  }
  const url = new URL(self.registration.scope);
  if (data.scopeId) url.searchParams.set('chat', data.scopeId);
  if (data.messageId) url.searchParams.set('msg', data.messageId);
  await self.clients.openWindow(url.href);
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(openChat(event.notification.data || {}));
});

self.addEventListener('push', (event) => {
  let payload = null;
  try {
    payload = event.data ? event.data.json() : null;
  } catch {
    payload = null;
  }
  if (!payload || !payload.title) return;
  event.waitUntil(showPush(payload));
});

/** Relative paths (brand/…) are resolved against the app, full URLs stay. */
function asset(path) {
  return path ? new URL(path, self.registration.scope).href : undefined;
}

async function showPush(p) {
  // A visible ONYX tab shows its own notifications (and knows whether the chat is open).
  const all = await windows();
  if (all.some((c) => c.visibilityState === 'visible')) return;
  // More messages of the same chat replace the notice quietly: "+2 more messages".
  let count = 1;
  if (p.tag) {
    const open = await self.registration.getNotifications({ tag: p.tag });
    if (open.length) count = (open[0].data && open[0].data.count ? open[0].data.count : 1) + 1;
  }
  let body = p.body || '';
  if (count > 1 && p.more) {
    let rule = 'other';
    try {
      rule = new Intl.PluralRules(p.lang || 'en').select(count - 1);
    } catch {
      rule = 'other';
    }
    const template = p.more[rule] || p.more.other;
    if (template) body += `\n${template.replace('{count}', String(count - 1))}`;
  }
  await self.registration.showNotification(p.title, {
    body,
    icon: asset(p.icon),
    badge: asset(p.badge),
    tag: p.tag,
    renotify: false,
    silent: !!p.silent,
    timestamp: p.timestamp,
    data: { scopeId: p.scopeId, messageId: p.messageId, count },
  });
}
