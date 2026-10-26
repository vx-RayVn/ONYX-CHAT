/**
 * ONYX Web Push – notifications while no ONYX tab is open.
 *
 *  GET  → { publicKey } for PushManager.subscribe() in the browser. The VAPID
 *         key pair is created on the first call and stored in the database
 *         (private.push_config); the private key never leaves the server.
 *  POST → called by the database trigger for every new message (header
 *         x-onyx-dispatch). Decides per recipient with the same rules as the
 *         app (notifyRules.ts, an identical copy of src/lib/notifyRules.ts) and
 *         sends one encrypted push per device.
 *
 * Deployed with verify_jwt = false: the trigger sends no user token; POST is
 * protected by the dispatch secret, GET only returns the public key.
 */
import { attachmentLabel, decide, previewText, truncatePreview, type AlertKind, type MessageFacts, type NotifyLevel, type NotifyPref } from './notifyRules.ts';
import { generateVapidKeys, sendPush, timingSafeEqual, type VapidKeys } from './webpush.ts';
import { STRINGS, type Plural } from './i18n.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
/** Contact for the push services (RFC 8292); the project URL unless set. */
const SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? SUPABASE_URL;
/** Messages older than this are not pushed any more (e.g. a delayed request). */
const MAX_AGE_MS = 5 * 60_000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${fn}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

/* ---------------------------------------------------------------- */
/* Keys                                                               */
/* ---------------------------------------------------------------- */

interface Config {
  public: string;
  private: JsonWebKey;
  secret: string;
}

let config: Promise<Config> | null = null;

function getConfig(): Promise<Config> {
  config ??= (async () => {
    const existing = await rpc<Config | null>('push_config', { p_init: null });
    if (existing) return existing;
    const keys = await generateVapidKeys();
    // If two instances start at once, the database keeps the first pair and both use it.
    return rpc<Config>('push_config', { p_init: { public: keys.publicKey, private: keys.privateJwk, url: `${SUPABASE_URL}/functions/v1/push` } });
  })().catch((e) => {
    config = null;
    throw e;
  });
  return config;
}

/* ---------------------------------------------------------------- */
/* Texts                                                              */
/* ---------------------------------------------------------------- */

function tr(lang: string, key: string, vars?: Record<string, string>) {
  const v = STRINGS[lang]?.[key] ?? STRINGS.en[key];
  const s = typeof v === 'string' ? v : key;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m) : s;
}

function morePlural(lang: string): Plural {
  const v = STRINGS[lang]?.['+{count} more messages'] ?? STRINGS.en['+{count} more messages'];
  return typeof v === 'string' ? { other: v } : v;
}

const ATTACHMENT_KEY = { voice: 'Voice message', image: 'Image', video: 'Video', audio: 'Audio', file: 'File' } as const;

/* ---------------------------------------------------------------- */
/* Dispatch                                                           */
/* ---------------------------------------------------------------- */

interface PrefRow {
  level: NotifyLevel | null;
  muted: boolean;
  mute_until: string | null;
  suppress_everyone: boolean;
  suppress_roles: boolean;
}

interface Subscription {
  endpoint: string;
  p256dh: string;
  auth: string;
  lang: string;
  preview: boolean;
  sound: boolean;
}

interface Candidate {
  user_id: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
  can_view: boolean;
  blocked: boolean;
  roles: string[];
  prefs: Record<string, PrefRow>;
  subscriptions: Subscription[];
}

interface Prepared {
  message: {
    id: string;
    type: string;
    author_id: string;
    content: string;
    reply_mention: boolean;
    reply_to_author_id: string | null;
    attachments: { kind: string; voice?: boolean }[];
    created_at: string;
    channel_id: string | null;
    dm_id: string | null;
    server_id: string | null;
  };
  author: { name: string; avatar: { kind?: string; src?: string; poster?: string } | null } | null;
  place: { server?: string; channel?: string; type?: 'dm' | 'group'; name?: string | null; participants?: { id: string; name: string }[] } | null;
  names: { users: Record<string, string>; roles: Record<string, string> };
  author_can_mention_everyone: boolean;
  candidates: Candidate[];
}

function toPref(r: PrefRow | undefined): NotifyPref | undefined {
  if (!r) return undefined;
  const p: NotifyPref = {};
  if (r.level) p.level = r.level;
  if (r.muted) {
    p.muted = true;
    if (r.mute_until) p.muteUntil = Date.parse(r.mute_until);
  }
  if (r.suppress_everyone) p.suppressEveryone = true;
  if (r.suppress_roles) p.suppressRoles = true;
  return p;
}

/** Public URL of an avatar in the media bucket (inline images are too large for a push). */
function avatarUrl(avatar: NonNullable<Prepared['author']>['avatar']): string | null {
  if (avatar?.kind !== 'image') return null;
  const src = avatar.poster?.startsWith('storage:media/') ? avatar.poster : avatar.src;
  if (!src?.startsWith('storage:media/') || /\.(mp4|webm|mov)$/i.test(src)) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/media/${src.slice('storage:media/'.length)}`;
}

function payloadFor(p: Prepared, c: Candidate, sub: Subscription, alert: AlertKind) {
  const m = p.message;
  const lang = STRINGS[sub.lang] ? sub.lang : 'en';
  const author = p.author?.name ?? tr(lang, 'unknown');
  let title = author;
  if (m.channel_id) title = tr(lang, '{name} in #{channel} ({server})', { name: author, channel: p.place?.channel ?? '', server: p.place?.server ?? '' });
  else if (p.place?.type === 'group') {
    const others = (p.place.participants ?? []).filter((x) => x.id !== c.user_id).map((x) => x.name);
    title = tr(lang, '{name} in {group}', { name: author, group: p.place.name || others.join(', ') });
  }

  let body: string;
  if (alert === 'call') body = tr(lang, 'Calling you …');
  else if (!sub.preview) body = tr(lang, alert === 'mention' ? 'Mentioned you' : alert === 'dm' ? 'Sent you a message' : 'New message');
  else {
    const text = previewText(m.content, {
      user: (id) => p.names.users[id] ?? tr(lang, 'unknown'),
      role: (id) => p.names.roles[id] ?? tr(lang, 'unknown'),
      // Channel names stay out: the mentioned channel could be private.
      channel: () => tr(lang, 'channel'),
      code: tr(lang, 'Code'),
      spoiler: tr(lang, 'Spoiler'),
    });
    const label = attachmentLabel(m.attachments ?? []);
    body = truncatePreview(text) || tr(lang, label ? ATTACHMENT_KEY[label] : 'New message');
  }

  const scopeId = (m.dm_id ?? m.channel_id)!;
  return {
    title,
    body,
    icon: avatarUrl(p.author?.avatar ?? null) ?? 'brand/apple-touch-icon.png',
    badge: 'brand/onyx-mark-64.webp',
    tag: `onyx:${scopeId}`,
    scopeId,
    messageId: m.id,
    timestamp: Date.parse(m.created_at),
    silent: !sub.sound,
    lang,
    more: morePlural(lang),
  };
}

async function dispatch(messageId: string, cfg: Config) {
  const p = await rpc<Prepared | null>('push_prepare', { p_message: messageId });
  if (!p || !p.candidates.length) return { candidates: 0, sent: 0 };
  const m = p.message;
  const now = Date.now();
  if (now - Date.parse(m.created_at) > MAX_AGE_MS) return { candidates: p.candidates.length, sent: 0, skipped: 'too old' };

  const keys: VapidKeys = { publicKey: cfg.public, privateJwk: cfg.private };
  const facts: MessageFacts = { type: m.type, authorId: m.author_id, content: m.content, replyMention: m.reply_mention, replyToAuthorId: m.reply_to_author_id };
  const isDM = !!m.dm_id;
  const scopeId = (m.dm_id ?? m.channel_id)!;
  const gone: string[] = [];
  const used: string[] = [];
  const reasons: Record<string, number> = {};

  await Promise.all(
    p.candidates.map(async (c) => {
      const d = decide(facts, {
        meId: c.user_id,
        isDM,
        canView: c.can_view,
        authorBlocked: c.blocked,
        authorCanMentionEveryone: p.author_can_mention_everyone,
        myRoleIds: c.roles ?? [],
        meOnline: c.status !== 'offline',
        dnd: c.status === 'dnd',
        dmPref: isDM ? toPref(c.prefs[m.dm_id!]) : undefined,
        serverPref: isDM ? undefined : toPref(c.prefs[m.server_id!]),
        channelPref: isDM ? undefined : toPref(c.prefs[m.channel_id!]),
        defaultLevel: c.prefs[c.user_id]?.level ?? 'all',
        now,
      });
      reasons[d.reason] = (reasons[d.reason] ?? 0) + 1;
      if (d.alert === 'none') return;
      await Promise.all(
        (c.subscriptions ?? []).map(async (sub) => {
          try {
            const res = await sendPush(sub.endpoint, sub, payloadFor(p, c, sub, d.alert), keys, SUBJECT, {
              // Same chat = same topic: a waiting push is replaced instead of piling up.
              topic: scopeId.replace(/-/g, ''),
              urgency: d.alert === 'message' ? 'normal' : 'high',
              // A call only matters while it rings.
              ttl: d.alert === 'call' ? 60 : 12 * 3600,
            });
            if (res.gone) gone.push(sub.endpoint);
            else if (res.status < 300) used.push(sub.endpoint);
            else console.warn('[push] push service answered', res.status);
          } catch {
            // Endpoints contain private subscription tokens; fetch errors can include them.
            console.warn('[push] delivery failed');
          }
        }),
      );
    }),
  );
  if (gone.length || used.length) await rpc('push_cleanup', { p_gone: gone, p_used: used });
  return { candidates: p.candidates.length, sent: used.length, removed: gone.length, reasons };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  try {
    if (req.method === 'GET') return json({ publicKey: (await getConfig()).public });
    if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
    const cfg = await getConfig();
    if (!timingSafeEqual(req.headers.get('x-onyx-dispatch') ?? '', cfg.secret)) return json({ error: 'forbidden' }, 403);
    const { message_id } = (await req.json()) as { message_id?: string };
    if (!message_id || !/^[0-9a-f-]{36}$/.test(message_id)) return json({ error: 'bad request' }, 400);
    const result = await dispatch(message_id, cfg);
    console.log('[push]', JSON.stringify(result));
    return json(result);
  } catch {
    console.error('[push] dispatch failed');
    return json({ error: 'failed' }, 500);
  }
});
