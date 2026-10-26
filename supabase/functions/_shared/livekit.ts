/**
 * LiveKit for the Edge Functions, without an SDK: access tokens (HS256 JWT),
 * webhook verification and the RoomService API (Twirp over HTTPS). Only Web
 * Crypto and fetch – runs in Deno and, for the tests, in Node.
 *
 * Formats as in livekit-server-sdk 2.x (AccessToken, WebhookReceiver,
 * RoomServiceClient): the token's issuer is the API key, the grants sit in
 * "video", webhooks carry a token whose "sha256" claim is the base64 SHA-256
 * of the raw body.
 */

export interface LiveKitConfig {
  /** wss://<project>.livekit.cloud */
  url: string;
  apiKey: string;
  apiSecret: string;
}

/** Track sources a participant may publish (names as in the token). */
export type Source = 'microphone' | 'camera' | 'screen_share' | 'screen_share_audio';

export interface VideoGrant {
  roomJoin?: boolean;
  room?: string;
  roomCreate?: boolean;
  roomList?: boolean;
  roomAdmin?: boolean;
  canPublish?: boolean;
  canSubscribe?: boolean;
  canPublishData?: boolean;
  canPublishSources?: Source[];
  canUpdateOwnMetadata?: boolean;
  hidden?: boolean;
}

const enc = new TextEncoder();

export function b64url(data: Uint8Array | string): string {
  const bytes = typeof data === 'string' ? enc.encode(data) : data;
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

function hmacKey(secret: string) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signJwt(payload: Record<string, unknown>, secret: string): Promise<string> {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(`${head}.${body}`)));
  return `${head}.${body}.${b64url(sig)}`;
}

/**
 * Checks signature (HS256 only), issuer, expiry (required) and "not before",
 * with a small clock tolerance. Throws on anything wrong.
 */
export async function verifyJwt(token: string, secret: string, opts: { issuer: string; now?: number; tolerance?: number }): Promise<Record<string, unknown>> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const [head, body, sig] = parts;
  let header: { alg?: string };
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(new TextDecoder().decode(fromB64url(head)));
    payload = JSON.parse(new TextDecoder().decode(fromB64url(body)));
  } catch {
    throw new Error('malformed token');
  }
  if (header.alg !== 'HS256') throw new Error('unsupported algorithm');
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), fromB64url(sig), enc.encode(`${head}.${body}`));
  if (!ok) throw new Error('invalid signature');
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const tol = opts.tolerance ?? 10;
  if (payload.iss !== opts.issuer) throw new Error('wrong issuer');
  if (typeof payload.exp !== 'number') throw new Error('missing exp');
  if (payload.exp + tol < now) throw new Error('token expired');
  if (typeof payload.nbf === 'number' && payload.nbf - tol > now) throw new Error('token not yet valid');
  return payload;
}

/** Access token for a participant (identity = ONYX user id). */
export function accessToken(cfg: LiveKitConfig, identity: string, grant: VideoGrant, ttlSeconds = 30 * 60, now = Math.floor(Date.now() / 1000)): Promise<string> {
  return signJwt({ iss: cfg.apiKey, sub: identity, nbf: now, exp: now + ttlSeconds, video: grant }, cfg.apiSecret);
}

async function sha256Base64(body: string): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(body)));
  let s = '';
  for (const b of hash) s += String.fromCharCode(b);
  return btoa(s);
}

/** Verifies a webhook request (raw body + Authorization header) and returns the parsed event. */
export async function receiveWebhook(cfg: LiveKitConfig, body: string, authHeader: string | null, now?: number): Promise<WebhookEvent> {
  const token = (authHeader ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new Error('authorization header is empty');
  const claims = await verifyJwt(token, cfg.apiSecret, { issuer: cfg.apiKey, now });
  if (claims.sha256 !== (await sha256Base64(body))) throw new Error('sha256 checksum of body does not match');
  return JSON.parse(body) as WebhookEvent;
}

/** The parts of a LiveKit webhook event that ONYX uses (proto3 JSON: int64 may come as string). */
export interface WebhookEvent {
  event: string;
  id?: string;
  createdAt?: string | number;
  room?: { name?: string; sid?: string };
  participant?: { sid?: string; identity?: string; kind?: string | number; joinedAt?: string | number; joinedAtMs?: string | number };
  track?: { sid?: string; source?: string | number; type?: string | number };
}

/** Event → arguments of public.voice_event() (see migration onyx_voice). */
export function toVoiceEvent(e: WebhookEvent) {
  const num = (v: string | number | undefined) => (v === undefined || v === '' || !Number.isFinite(Number(v)) ? undefined : Number(v));
  const created = num(e.createdAt);
  const joinedMs = num(e.participant?.joinedAtMs);
  // Joins carry milliseconds; everything else the event time in seconds.
  const at = e.event === 'participant_joined' ? (joinedMs ? joinedMs / 1000 : num(e.participant?.joinedAt) ?? created) : created;
  const source = e.track?.source;
  const names: Record<number, string> = { 1: 'CAMERA', 2: 'MICROPHONE', 3: 'SCREEN_SHARE', 4: 'SCREEN_SHARE_AUDIO' };
  return {
    event: e.event,
    room: e.room?.name ?? '',
    identity: e.participant?.identity ?? null,
    sid: e.participant?.sid ?? null,
    at: at ?? null,
    source: typeof source === 'number' || (typeof source === 'string' && /^\d+$/.test(source)) ? names[Number(source)] ?? null : source ?? null,
  };
}

/** Participants of other kinds (agents, recordings, SIP) are not ONYX accounts. */
export function isStandardParticipant(e: WebhookEvent) {
  const kind = e.participant?.kind;
  return kind === undefined || kind === '' || kind === 'STANDARD' || kind === 0 || kind === '0';
}

/* ---------------------------------------------------------------- */
/* RoomService (Twirp)                                                */
/* ---------------------------------------------------------------- */

export class LiveKitError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message || code || `LiveKit API ${status}`);
    this.status = status;
    this.code = code;
  }
}

export const isNotFound = (e: unknown) => e instanceof LiveKitError && e.code.toLowerCase() === 'not_found';

export function apiHost(url: string) {
  return url.replace(/^ws(s?):\/\//, 'http$1://').replace(/\/+$/, '');
}

async function twirp<T>(cfg: LiveKitConfig, method: string, body: Record<string, unknown>, grant: VideoGrant, fetcher: typeof fetch = fetch): Promise<T> {
  const now = Math.floor(Date.now() / 1000);
  const token = await signJwt({ iss: cfg.apiKey, nbf: now, exp: now + 600, video: grant }, cfg.apiSecret);
  const res = await fetcher(`${apiHost(cfg.url)}/twirp/livekit.RoomService/${method}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { code?: string; msg?: string };
    throw new LiveKitError(res.status, err.code ?? '', err.msg ?? '');
  }
  return (await res.json()) as T;
}

export interface ParticipantInfo {
  sid: string;
  identity: string;
  kind?: string | number;
  state?: string;
}

/** Sources as the RoomService expects them (proto enum names). */
const PROTO_SOURCE: Record<Source, string> = { microphone: 'MICROPHONE', camera: 'CAMERA', screen_share: 'SCREEN_SHARE', screen_share_audio: 'SCREEN_SHARE_AUDIO' };

export interface Permission {
  canSubscribe: boolean;
  canPublishSources: Source[];
}

export function roomService(cfg: LiveKitConfig, fetcher: typeof fetch = fetch) {
  return {
    /** Creates the room or returns the existing one (timeouts in seconds). */
    createRoom: (name: string, opts: { emptyTimeout?: number; departureTimeout?: number; maxParticipants?: number } = {}) =>
      twirp(cfg, 'CreateRoom', { name, ...opts }, { roomCreate: true }, fetcher),
    deleteRoom: async (room: string) => {
      try {
        await twirp(cfg, 'DeleteRoom', { room }, { roomCreate: true }, fetcher);
      } catch (e) {
        if (!isNotFound(e)) throw e;
      }
    },
    /** Participants of a room; a room that does not exist (yet) has none. */
    listParticipants: async (room: string): Promise<ParticipantInfo[]> => {
      try {
        const r = await twirp<{ participants?: ParticipantInfo[] }>(cfg, 'ListParticipants', { room }, { roomAdmin: true, room }, fetcher);
        return r.participants ?? [];
      } catch (e) {
        if (isNotFound(e)) return [];
        throw e;
      }
    },
    getParticipant: async (room: string, identity: string): Promise<ParticipantInfo | null> => {
      try { return await twirp<ParticipantInfo>(cfg, 'GetParticipant', { room, identity }, { roomAdmin: true, room }, fetcher); }
      catch (e) { if (isNotFound(e)) return null; throw e; }
    },
    /** Disconnects a participant (no error if it is already gone). */
    removeParticipant: async (room: string, identity: string) => {
      try {
        await twirp(cfg, 'RemoveParticipant', { room, identity }, { roomAdmin: true, room }, fetcher);
      } catch (e) {
        if (!isNotFound(e)) throw e;
      }
    },
    /** New permissions take effect at once; tracks of sources no longer allowed are unpublished by the server. */
    updatePermission: (room: string, identity: string, p: Permission) =>
      twirp(
        cfg,
        'UpdateParticipant',
        {
          room,
          identity,
          permission: {
            canSubscribe: p.canSubscribe,
            canPublish: p.canPublishSources.length > 0,
            canPublishData: false,
            canPublishSources: p.canPublishSources.map((s) => PROTO_SOURCE[s]),
            canUpdateMetadata: false,
          },
        },
        { roomAdmin: true, room },
        fetcher,
      ),
  };
}

/** What a participant may publish, from the checks in the database. */
export function publishSources(g: { can_speak?: boolean; can_video?: boolean; can_screen?: boolean }): Source[] {
  const out: Source[] = [];
  if (g.can_speak) out.push('microphone');
  if (g.can_video) out.push('camera');
  if (g.can_screen) out.push('screen_share', 'screen_share_audio');
  return out;
}

/** Constant-time comparison of two strings (shared secrets). */
export function timingSafeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
