/**
 * ONYX – Sprach- und Videochat: Zugangs-Tokens und Moderation (LiveKit).
 *
 * Aufruf aus der App: supabase.functions.invoke('voice', { body }).
 * Deployt mit verify_jwt = false (neue Supabase-Publishable-Keys); die
 * Function prüft jedes Konto-JWT selbst beim Auth-Server (getUser).
 *
 *   { action: 'join', target, video? }
 *       target = Sprachkanal oder DM/Gruppe. Die Prüfung macht die Datenbank
 *       mit dem JWT der Person (voice_join_check: angemeldet, nicht ONYX-weit
 *       gesperrt, Kanalrechte bzw. DM-Teilnahme, Server-Stumm/-Taub). Die
 *       Rechte gehen als Grants ins Token: wer nicht sprechen darf, kann
 *       technisch kein Mikrofon senden. Volle Kanäle: Zählung bei LiveKit.
 *       In DMs startet bzw. betritt das den Anruf (call_start).
 *   { action: 'moderate', target, op, dest? }
 *       op = mute | unmute | deafen | undeafen | disconnect | move. Recht im
 *       Kanal und Rangfolge prüft voice_moderate(), danach wird es bei LiveKit
 *       sofort wirksam.
 *
 * Secrets (Supabase › Edge Functions › Secrets): LIVEKIT_URL, LIVEKIT_API_KEY,
 * LIVEKIT_API_SECRET. Sie verlassen die Function nie; die App bekommt nur das
 * kurzlebige Token und die öffentliche URL.
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3';
import { accessToken, publishSources, roomService, type LiveKitConfig } from '../_shared/livekit.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Token-Laufzeit. LiveKit erneuert es während der Verbindung selbst; ein neuer Beitritt holt ein neues. */
const TOKEN_TTL = 30 * 60;

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

function env(name: string) {
  return (Deno.env.get(name) ?? '').trim();
}

/** Öffentlicher Schlüssel für Aufrufe mit dem JWT der Person (neu: publishable, sonst legacy anon). */
function publicKey(): string {
  try {
    const keys = JSON.parse(env('SUPABASE_PUBLISHABLE_KEYS') || '{}') as Record<string, string>;
    if (keys.default) return keys.default;
  } catch {
    // kein neuer Schlüssel hinterlegt
  }
  return env('SUPABASE_ANON_KEY');
}

/** Service-Role nur für den Abgleich mit LiveKit und Realtime-Signale an die betroffene Person. */
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

/** Fehler aus der Datenbank → HTTP-Antwort (die App zeigt dazu einen passenden Text). */
function dbError(e: { code?: string; message?: string }) {
  const msg = e.message ?? '';
  if (e.code === '28000') return json(401, { error: 'unauthorized' });
  if (/account suspended/.test(msg)) return json(403, { error: 'suspended' });
  if (/rate limited/.test(msg)) return json(429, { error: 'rate_limited' });
  if (/blocked/.test(msg)) return json(403, { error: 'blocked' });
  if (/missing permission: (\w+)/.test(msg)) return json(403, { error: 'forbidden', permission: msg.match(/missing permission: (\w+)/)![1] });
  if (/target is not below you/.test(msg)) return json(403, { error: 'hierarchy' });
  if (/target cannot connect there/.test(msg)) return json(403, { error: 'target_cannot_connect' });
  if (e.code === 'P0002' || /not found|not in a voice channel/.test(msg)) return json(404, { error: 'not_found' });
  if (e.code === '22023') return json(400, { error: 'invalid_request' });
  console.error('[voice] database error', e.code, msg);
  return json(500, { error: 'failed' });
}

/** Realtime-Signal an alle offenen Tabs einer Person (privater Kanal "calls:<id>"). */
async function signal(userId: string, event: string, payload: Record<string, unknown>) {
  const url = env('SUPABASE_URL');
  const key = serviceKey();
  if (!url || !key) return;
  try {
    const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ topic: `calls:${userId}`, event, payload, private: true }] }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.warn('[voice] realtime signal', res.status);
  } catch (e) {
    console.warn('[voice] realtime signal failed', String(e));
  }
}

interface JoinCheck {
  kind: 'channel' | 'dm';
  room: string;
  server_id?: string;
  channel_id?: string;
  dm_id?: string;
  user_limit: number | null;
  bypass_limit: boolean;
  can_speak: boolean;
  can_video: boolean;
  can_screen: boolean;
  server_mute: boolean;
  server_deaf: boolean;
  current_room: string | null;
}

async function join(db: SupabaseClient, me: string, lk: LiveKitConfig, target: string, video: boolean) {
  const { data, error } = await db.rpc('voice_join_check', { p_target: target });
  if (error) return dbError(error);
  const check = data as JoinCheck;
  const rooms = roomService(lk);
  const admin = createClient(env('SUPABASE_URL'), serviceKey(), { auth: { persistSession: false, autoRefreshToken: false } });

  // Wer ist wirklich im Raum? (LiveKit zählt, nicht die Tabelle – die gleicht sich hier gleich mit ab.)
  let others: string[] = [];
  try {
    const list = await rooms.listParticipants(check.room);
    others = list.filter((p) => (p.kind === undefined || p.kind === '' || p.kind === 'STANDARD' || p.kind === 0 || p.kind === '0') && UUID.test(p.identity)).map((p) => p.identity);
    const { error: recErr } = await admin.rpc('voice_reconcile', { p_room: check.room, p_identities: others });
    if (recErr) console.warn('[voice] reconcile failed', recErr.message);
  } catch (e) {
    console.error('[voice] livekit list failed', String(e));
    return json(502, { error: 'livekit_unavailable' });
  }
  const count = others.filter((id) => id !== me).length;
  if (check.kind === 'channel' && check.user_limit && !check.bypass_limit && count >= check.user_limit) {
    return json(409, { error: 'full', limit: check.user_limit });
  }

  // Ein Konto ist nur in einem Raum: die alte Verbindung (anderes Gerät oder anderer Kanal) endet.
  if (check.current_room && check.current_room !== check.room) {
    await signal(me, 'elsewhere', { room: check.current_room });
    try {
      await rooms.removeParticipant(check.current_room, me);
    } catch (e) {
      console.warn('[voice] could not end old connection', String(e));
    }
  }

  let call: { id: string; started: boolean } | null = null;
  if (check.kind === 'dm') {
    try {
      // Raum vorab anlegen: verbindet sich niemand, endet er nach 60 s (und damit der Anruf).
      await rooms.createRoom(check.room, { emptyTimeout: 60, departureTimeout: 20 });
    } catch (e) {
      console.error('[voice] livekit create failed', String(e));
      return json(502, { error: 'livekit_unavailable' });
    }
    const { data: started, error: callErr } = await db.rpc('call_start', { p_dm: target, p_video: video });
    if (callErr) return dbError(callErr);
    call = started as { id: string; started: boolean };
  }

  const token = await accessToken(
    lk,
    me,
    {
      roomJoin: true,
      room: check.room,
      canSubscribe: !check.server_deaf,
      canPublish: publishSources(check).length > 0,
      canPublishSources: publishSources(check),
      canPublishData: false,
      canUpdateOwnMetadata: false,
    },
    TOKEN_TTL,
  );

  return json(200, {
    url: lk.url,
    token,
    room: check.room,
    kind: check.kind,
    serverId: check.server_id ?? null,
    channelId: check.channel_id ?? null,
    dmId: check.dm_id ?? null,
    callId: call?.id ?? null,
    callStarted: call?.started ?? false,
    canSpeak: check.can_speak,
    canVideo: check.can_video,
    canScreen: check.can_screen,
    serverMute: check.server_mute,
    serverDeaf: check.server_deaf,
  });
}

interface ModerateResult {
  room: string;
  channel_id: string;
  dest_channel_id: string | null;
  server_mute: boolean;
  server_deaf: boolean;
  can_speak: boolean;
  can_video: boolean;
  can_screen: boolean;
}

const OPS = new Set(['mute', 'unmute', 'deafen', 'undeafen', 'disconnect', 'move']);

async function moderate(db: SupabaseClient, lk: LiveKitConfig, target: string, op: string, dest: string | null) {
  const { data, error } = await db.rpc('voice_moderate', { p_target: target, p_action: op, p_dest: dest });
  if (error) return dbError(error);
  const r = data as ModerateResult;
  const rooms = roomService(lk);
  try {
    if (op === 'disconnect') await rooms.removeParticipant(r.room, target);
    else if (op === 'move') {
      // Erst Bescheid geben (der Client wechselt dann selbst und darf auch in volle Kanäle), dann trennen.
      await signal(target, 'move', { channel_id: r.dest_channel_id });
      await rooms.removeParticipant(r.room, target);
    } else {
      await rooms.updatePermission(r.room, target, { canSubscribe: !r.server_deaf, canPublishSources: publishSources(r) });
    }
  } catch (e) {
    // Gespeichert ist es (gilt beim nächsten Beitritt); live hat es nicht geklappt.
    console.error('[voice] livekit moderation failed', op, String(e));
    return json(502, { error: 'livekit_unavailable' });
  }
  return json(200, { ok: true, serverMute: r.server_mute, serverDeaf: r.server_deaf });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const jwt = req.headers.get('Authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!jwt) return json(401, { error: 'unauthorized' });
  const url = env('SUPABASE_URL');
  const key = publicKey();
  if (!url || !key) return json(500, { error: 'not_configured' });

  // Datenbank mit dem JWT der Person: auth.uid() ist sie, RLS und Prüfungen gelten wie in der App.
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: auth, error: authError } = await db.auth.getUser(jwt);
  const me = auth?.user?.id;
  if (authError || !me) return json(401, { error: 'unauthorized' });

  let body: { action?: unknown; target?: unknown; video?: unknown; op?: unknown; dest?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid_request' });
  }
  const target = typeof body.target === 'string' && UUID.test(body.target) ? body.target.toLowerCase() : null;
  if (!target) return json(400, { error: 'invalid_request' });

  const lk = livekit();
  if (!lk) return json(503, { error: 'not_configured' });

  try {
    if (body.action === 'join') return await join(db, me, lk, target, body.video === true);
    if (body.action === 'moderate') {
      const op = typeof body.op === 'string' && OPS.has(body.op) ? body.op : null;
      const dest = typeof body.dest === 'string' && UUID.test(body.dest) ? body.dest.toLowerCase() : null;
      if (!op || (op === 'move' && !dest)) return json(400, { error: 'invalid_request' });
      return await moderate(db, lk, target, op, dest);
    }
    return json(400, { error: 'invalid_request' });
  } catch (e) {
    console.error('[voice] failed', String(e));
    return json(500, { error: 'failed' });
  }
});
