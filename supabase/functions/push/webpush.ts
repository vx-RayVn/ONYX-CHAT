/**
 * Web Push without libraries – only WebCrypto, so it runs in the Edge
 * Function (Deno) and in the Node tests alike.
 *
 *  - RFC 8291: message encryption (ECDH P-256 + HKDF + AES-128-GCM, "aes128gcm")
 *  - RFC 8292: VAPID (an ES256 JWT that identifies this server to the push service)
 *
 * The private VAPID key never leaves the server: it is created here and kept
 * in the database (private.push_config).
 */

const enc = new TextEncoder();

/** Bytes backed by a plain ArrayBuffer (what WebCrypto accepts). */
type Bytes = Uint8Array<ArrayBuffer>;

export function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(s: string): Bytes {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '='));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, length: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

/** Compares two secrets without leaking where they differ. */
export function timingSafeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/* ---------------------------------------------------------------- */
/* VAPID (RFC 8292)                                                   */
/* ---------------------------------------------------------------- */

export interface VapidKeys {
  /** Uncompressed P-256 point, base64url – the "applicationServerKey" of the browser. */
  publicKey: string;
  privateJwk: JsonWebKey;
}

export async function generateVapidKeys(): Promise<VapidKeys> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const raw = await crypto.subtle.exportKey('raw', pair.publicKey);
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  return { publicKey: b64url(raw), privateJwk: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d } };
}

/** "Authorization" header for one push service (audience = its origin), valid for 12 hours. */
export async function vapidAuthorization(endpoint: string, keys: VapidKeys, subject: string, now = Date.now()): Promise<string> {
  const header = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })));
  const key = await crypto.subtle.importKey('jwk', { ...keys.privateJwk, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  // WebCrypto returns the raw r||s signature, which is exactly what JWS ES256 expects.
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${b64url(signature)}, k=${keys.publicKey}`;
}

/* ---------------------------------------------------------------- */
/* Encryption (RFC 8291, content coding aes128gcm / RFC 8188)         */
/* ---------------------------------------------------------------- */

export interface PushTarget {
  /** Browser's public key (p256dh), base64url. */
  p256dh: string;
  /** Browser's auth secret, base64url. */
  auth: string;
}

/** Fixed values for tests only (RFC 8291 appendix A). */
export interface EncryptOptions {
  salt?: Bytes;
  senderJwk?: JsonWebKey;
}

/** One record: header (salt, record size, sender key) + AES-GCM ciphertext of the payload and the 0x02 end marker. */
export async function encryptPayload(target: PushTarget, payload: Uint8Array, opts: EncryptOptions = {}): Promise<Bytes> {
  const uaPublic = fromB64url(target.p256dh);
  const authSecret = fromB64url(target.auth);
  if (uaPublic.length !== 65 || authSecret.length < 16) throw new Error('invalid subscription keys');

  let senderPrivate: CryptoKey;
  let senderPublic: Bytes;
  if (opts.senderJwk) {
    const jwk = opts.senderJwk;
    senderPrivate = await crypto.subtle.importKey('jwk', { ...jwk, ext: true }, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
    senderPublic = concat(new Uint8Array([4]), fromB64url(jwk.x!), fromB64url(jwk.y!));
  } else {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
    senderPrivate = pair.privateKey;
    senderPublic = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  }
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, senderPrivate, 256));

  const salt = opts.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const ikm = await hkdf(authSecret, ecdhSecret, concat(enc.encode('WebPush: info\0'), uaPublic, senderPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const recordSize = 4096;
  if (payload.length + 17 > recordSize) throw new Error('payload too large');
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(payload, new Uint8Array([2]))));

  const header = new Uint8Array(21 + senderPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, recordSize);
  header[20] = senderPublic.length;
  header.set(senderPublic, 21);
  return concat(header, cipher);
}

export interface SendResult {
  status: number;
  /** The subscription no longer exists (delete it). */
  gone: boolean;
}

/** Only browser push services may receive server-originated requests.
 * Subscription paths/tokens are opaque; provider redirects are never followed.
 */
export function trustedPushEndpoint(endpoint: string): boolean {
  if (endpoint.length > 4096 || endpoint.trim() !== endpoint) return false;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return false;
    return ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'].includes(url.hostname)
      || /^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname);
  } catch { return false; }
}

/** Sends one encrypted push. `topic` lets the push service replace a waiting message of the same chat. */
export async function sendPush(
  endpoint: string,
  target: PushTarget,
  payload: unknown,
  keys: VapidKeys,
  subject: string,
  opts: { topic?: string; urgency?: 'very-low' | 'low' | 'normal' | 'high'; ttl?: number } = {},
): Promise<SendResult> {
  if (!trustedPushEndpoint(endpoint)) throw new Error('untrusted push endpoint');
  const body = await encryptPayload(target, enc.encode(JSON.stringify(payload)));
  const headers: Record<string, string> = {
    Authorization: await vapidAuthorization(endpoint, keys, subject),
    'Content-Encoding': 'aes128gcm',
    'Content-Type': 'application/octet-stream',
    TTL: String(opts.ttl ?? 24 * 3600),
    Urgency: opts.urgency ?? 'normal',
  };
  if (opts.topic) headers.Topic = opts.topic;
  const res = await fetch(endpoint, { method: 'POST', headers, body, redirect: 'error', signal: AbortSignal.timeout(7000) });
  await res.body?.cancel();
  return { status: res.status, gone: res.status === 404 || res.status === 410 };
}
