/**
 * ONYX – ONYX-weite Sperre durch Plattform-Admins.
 *
 * POST { action: 'ban' | 'unban', userId, reason? } mit dem Session-JWT der
 * aufrufenden Person (supabase.functions.invoke). Ablauf beim Sperren:
 *   1. JWT prüfen (401), Admin- und Zielprüfung in der Datenbank (403/404/400)
 *   2. Anmeldung sperren: Auth-Admin-API, ban_duration (≈ 100 Jahre, bis ein
 *      Admin entsperrt)
 *   3. platform_moderate('ban'): Eintrag in platform_bans, alle Sitzungen
 *      beenden, Realtime-Signal an offene Tabs. Scheitert das, wird Schritt 2
 *      zurückgenommen.
 *
 * Der Service-Role-Schlüssel existiert nur hier auf dem Server (Umgebung der
 * Function), nie im Frontend.
 */
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import {accountSessionAllowed} from '../_shared/account-session.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

/** Dauerhaft (100 Jahre) – aufgehoben wird nur durch "Entsperren". */
const BAN_DURATION = '876000h';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function secretKey(): string {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>;
    return keys.default ?? Object.values(keys)[0] ?? '';
  } catch {
    return '';
  }
}

/** Fehler aus platform_moderate() → HTTP-Status. */
function statusOf(message: string) {
  if (/not a platform admin/.test(message)) return 403;
  if (/user not found/.test(message)) return 404;
  if (/cannot suspend|cannot be suspended|unknown action/.test(message)) return 400;
  return 500;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json(401, { error: 'missing authorization' });

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const key = secretKey();
  if (!url || !key) return json(500, { error: 'function not configured' });
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // Wer ruft auf? Nur ein gültiges Session-JWT eines Kontos zählt (anon-/fremde Schlüssel nicht).
  const { data: caller, error: authError } = await admin.auth.getUser(token);
  if (authError || !caller?.user) return json(401, { error: 'invalid or expired session' });
  if(!await accountSessionAllowed(token,caller.user.id,(name,args)=>admin.rpc(name,args)))return json(403,{error:'account_verification_required'});

  let body: { action?: unknown; userId?: unknown; reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid body' });
  }
  const action = body.action;
  const target = typeof body.userId === 'string' ? body.userId : '';
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 1000) : null;
  if ((action !== 'ban' && action !== 'unban') || !UUID.test(target)) return json(400, { error: 'invalid request' });

  const moderate = (step: 'check' | 'ban' | 'unban') =>
    admin.rpc('platform_moderate', { p_admin: caller.user.id, p_target: target, p_action: step, p_reason: reason || null });

  // 1. Prüfen, noch ohne Wirkung: Admin? Ziel existiert, ist nicht man selbst und kein Admin?
  const check = await moderate('check');
  if (check.error) return json(statusOf(check.error.message), { error: check.error.message });

  if (action === 'ban') {
    // 2. Anmelden unmöglich machen.
    const auth = await admin.auth.admin.updateUserById(target, { ban_duration: BAN_DURATION });
    if (auth.error) return json(502, { error: `auth ban failed: ${auth.error.message}` });
    // 3. Eintrag, Sitzungen beenden, Signal an offene Tabs.
    const res = await moderate('ban');
    if (res.error) {
      await admin.auth.admin.updateUserById(target, { ban_duration: 'none' });
      return json(statusOf(res.error.message), { error: res.error.message });
    }
    return json(200, { ok: true, ban: res.data });
  }

  const auth = await admin.auth.admin.updateUserById(target, { ban_duration: 'none' });
  if (auth.error) return json(502, { error: `auth unban failed: ${auth.error.message}` });
  const res = await moderate('unban');
  if (res.error) return json(statusOf(res.error.message), { error: res.error.message });
  return json(200, { ok: true, ban: res.data });
});
