/**
 * ONYX – Sprach- und Videochat: Ereignisse von LiveKit und Aufträge der Datenbank.
 *
 * Deployt mit verify_jwt = false (LiveKit schickt kein Supabase-JWT). Jede
 * Anfrage ist trotzdem geprüft:
 *   - LiveKit-Webhook: Authorization-Header = von LiveKit mit dem API-Secret
 *     signiertes Token, dessen sha256-Claim zum Body passen muss
 *     (application/webhook+json). Ereignisse → public.voice_event().
 *   - Datenbank (pg_net, Header x-onyx-voice = Geheimnis aus
 *     private.voice_config): { action: 'evict', room, identity } nach Kick,
 *     Bann, ONYX-Sperre oder Verlassen einer Gruppe; { action: 'close', room }
 *     wenn ein Sprachkanal oder eine DM gelöscht wird.
 *
 * Einrichtung in LiveKit Cloud: Settings › Webhooks › URL
 * https://<projekt>.supabase.co/functions/v1/voice-webhook, Signing-Key =
 * derselbe API-Key wie in LIVEKIT_API_KEY.
 */
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { isStandardParticipant, receiveWebhook, roomService, timingSafeEqual, toVoiceEvent, type LiveKitConfig } from '../_shared/livekit.ts';
import { applyLivePermissions, type PermissionSnapshot, type VoiceTarget } from '../_shared/voicePermissions.ts';

const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function env(name: string) {
  return (Deno.env.get(name) ?? '').trim();
}

function serviceKey(): string {
  const legacy = env('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(env('SUPABASE_SECRET_KEYS') || '{}') as Record<string, string>;
    return keys.default ?? Object.values(keys)[0] ?? '';
  } catch {
    return '';
  }
}

function livekit(): LiveKitConfig | null {
  const url = env('LIVEKIT_URL');
  const apiKey = env('LIVEKIT_API_KEY');
  const apiSecret = env('LIVEKIT_API_SECRET');
  if (!/^wss?:\/\//.test(url) || !apiKey || !apiSecret) return null;
  return { url, apiKey, apiSecret };
}

const admin = () => createClient(env('SUPABASE_URL'), serviceKey(), { auth: { persistSession: false, autoRefreshToken: false } });

/** Geheimnis für die Aufträge der Datenbank; trägt dabei die eigene URL ein (einmal pro Instanz). */
let secret: Promise<string> | null = null;
function dbSecret(): Promise<string> {
  secret ??= (async () => {
    const { data, error } = await admin().rpc('voice_config', { p_url: `${env('SUPABASE_URL')}/functions/v1/voice-webhook` });
    if (error || typeof data !== 'string') throw new Error(error?.message ?? 'no secret');
    return data;
  })().catch((e) => {
    secret = null;
    throw e;
  });
  return secret;
}

const ROOM = /^(channel|dm):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function permissionSnapshot(targets: VoiceTarget[]): Promise<PermissionSnapshot[]> {
  const { data, error } = await admin().rpc('voice_permissions_snapshot', { p_targets: targets });
  if (error || !Array.isArray(data)) throw new Error(error?.message ?? 'invalid permission snapshot');
  return data as PermissionSnapshot[];
}

async function fromDatabase(req: Request, lk: LiveKitConfig) {
  let expected: string;
  try {
    expected = await dbSecret();
  } catch (e) {
    console.error('[voice-webhook] config failed', String(e));
    return json(500, { error: 'failed' });
  }
  if (!timingSafeEqual(req.headers.get('x-onyx-voice') ?? '', expected)) return json(403, { error: 'forbidden' });
  const body = (await req.json().catch(() => ({}))) as { action?: string; room?: string; identity?: string; targets?: VoiceTarget[] };
  const rooms = roomService(lk);
  if (body.action === 'permissions') {
    if (!Array.isArray(body.targets) || body.targets.length < 1 || body.targets.length > 50 || !body.targets.every((v) =>
      v && typeof v.identity === 'string' && UUID.test(v.identity) && typeof v.room === 'string' && ROOM.test(v.room) && typeof v.sid === 'string' && v.sid.length > 0 && v.sid.length <= 128)) {
      return json(400, { error: 'invalid_request' });
    }
    await applyLivePermissions(body.targets, permissionSnapshot, rooms);
    const { error } = await admin().rpc('voice_permissions_complete', { p_targets: body.targets });
    if (error) throw new Error(error.message);
    console.info('[voice-webhook] permissions applied', body.targets.length);
    return json(200, { ok: true });
  }
  if (!body.room || !ROOM.test(body.room)) return json(400, { error: 'invalid_request' });
  if (body.action === 'evict' && body.identity && UUID.test(body.identity)) await rooms.removeParticipant(body.room, body.identity);
  else if (body.action === 'close') await rooms.deleteRoom(body.room);
  else return json(400, { error: 'invalid_request' });
  return json(200, { ok: true });
}

async function fromLiveKit(req: Request, lk: LiveKitConfig) {
  const raw = await req.text();
  let event;
  try {
    event = await receiveWebhook(lk, raw, req.headers.get('Authorization'));
  } catch (e) {
    console.warn('[voice-webhook] rejected', String(e));
    return json(401, { error: 'invalid signature' });
  }
  // Beim ersten Ereignis die eigene URL für die Aufträge der Datenbank eintragen.
  await dbSecret();
  if (event.participant && !isStandardParticipant(event)) return json(200, { result: 'ignored: kind' });
  const args = toVoiceEvent(event);
  const { data, error } = await admin().rpc('voice_event', { p: args });
  if (error) {
    // 5xx → LiveKit versucht es noch einmal.
    console.error('[voice-webhook] voice_event failed', event.event, error.message);
    return json(500, { error: 'failed' });
  }
  if ((data === 'ignored: no access' || data === 'ignored: unknown user') && event.event === 'participant_joined' && args.room && args.identity && args.sid) {
    const rooms = roomService(lk);
    const participant = await rooms.getParticipant(args.room, args.identity);
    if (participant?.sid === args.sid) await rooms.removeParticipant(args.room, args.identity);
  }
  if (data === 'ok' && event.event === 'participant_joined' && args.room?.startsWith('channel:') && args.identity && args.sid) {
    // A still-valid join token may predate a role edit. Recheck at admission too.
    await applyLivePermissions([{ identity: args.identity, room: args.room, sid: args.sid }], permissionSnapshot, roomService(lk));
  }
  // Format diagnostics, without request bodies, identities, tokens or secret values.
  console.info('[voice-webhook] event', JSON.stringify({ event: event.event, createdAtType: typeof event.createdAt,
    joinedAtMsType: typeof event.participant?.joinedAtMs, sourceType: typeof event.track?.source, kindType: typeof event.participant?.kind, result: data }));
  return json(200, { result: data });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });
  const lk = livekit();
  if (!lk) return json(503, { error: 'not_configured' });
  try {
    if (req.headers.has('x-onyx-voice')) return await fromDatabase(req, lk);
    return await fromLiveKit(req, lk);
  } catch (e) {
    console.error('[voice-webhook] failed', String(e));
    return json(500, { error: 'failed' });
  }
});
