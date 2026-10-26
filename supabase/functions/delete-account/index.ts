// ONYX – Konto löschen (DSGVO Art. 17, Recht auf Löschung)
//
// Aufruf aus der App: supabase.functions.invoke('delete-account', { body: { username } }).
// Deployt mit verify_jwt = true: ohne gültiges Nutzer-JWT kommt keine Anfrage hier an.
//
// Ablauf:
//   1. JWT beim Auth-Server prüfen (getUser) – nur das eigene Konto ist löschbar.
//   2. Bestätigung: der mitgeschickte Benutzername muss zum Konto passen.
//   3. ONYX-weit gesperrte Konten können sich nicht selbst löschen (sonst wäre die
//      Sperre samt Verlauf weg und die E-Mail-Adresse wieder frei).
//   4. account_deletion_prepare(): besitzt das Konto noch Server → 409 mit Liste.
//   5. Dateien über die Storage-API löschen (Avatar/Banner unter media/users/<id>/,
//      eigene Anhänge und Sprachnachrichten im Bucket attachments).
//   6. Auth-Nutzer über die Admin-API löschen. Den Rest erledigen die
//      Fremdschlüssel und der Trigger profiles_before_delete (Migration
//      20261019142014_onyx_account_deletion.sql): Nachrichten bleiben als
//      „Gelöschter Nutzer“, alles andere verschwindet.
//
// Der Secret-Key (bzw. legacy service_role) kommt nur aus der Umgebung der
// Function und verlässt sie nie.

import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import {accountSessionAllowed} from '../_shared/account-session.ts';
import {closeAccountBilling} from '../_shared/billing.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Storage löscht in Teilen; so bleibt jede Anfrage klein. */
const CHUNK = 100;

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

function secretKey(): string | null {
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
    if (typeof keys.default === 'string' && keys.default) return keys.default;
  } catch {
    // Kein neuer Schlüssel hinterlegt – legacy service_role verwenden.
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || null;
}

interface Prepared {
  owned_servers: { id: string; name: string }[];
  media: string[];
  attachments: string[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const token = req.headers.get('Authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return json(401, { error: 'unauthorized' });

  const url = Deno.env.get('SUPABASE_URL');
  const key = secretKey();
  if (!url || !key) return json(500, { error: 'not_configured' });
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1. Wer ruft? (Anon-/Publishable-Key oder abgelaufene Sitzung → kein Nutzer)
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  const user = auth?.user;
  if (authError || !user) return json(401, { error: 'unauthorized' });
  if(!await accountSessionAllowed(token,user.id,(name,args)=>admin.rpc(name,args)))return json(403,{error:'account_verification_required'});

  // 2. Bestätigung per Benutzername
  let body: { username?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // leerer oder kaputter Body → gleiche Antwort wie falscher Name
  }
  const { data: profile, error: profileError } = await admin.from('profiles').select('username').eq('id', user.id).maybeSingle();
  if (profileError) return json(500, { error: 'lookup_failed' });
  const typed = typeof body.username === 'string' ? body.username.trim().replace(/^@/, '').toLowerCase() : '';
  if (!profile || !typed || typed !== String(profile.username).toLowerCase()) return json(400, { error: 'confirmation_mismatch' });

  // 3. ONYX-weit gesperrt? (Tabelle gibt es erst mit der Moderations-Migration.)
  const { data: bans, error: banError } = await admin.from('platform_bans').select('id').eq('user_id', user.id).is('lifted_at', null).limit(1);
  if (banError && banError.code !== 'PGRST205' && banError.code !== '42P01') return json(500, { error: 'lookup_failed' });
  if (bans?.length) return json(403, { error: 'suspended' });

  // 4. Server im Besitz? Welche Dateien?
  const { data, error: prepError } = await admin.rpc('account_deletion_prepare', { p_user: user.id });
  if (prepError || !data) {
    console.error('[delete-account] prepare failed', prepError?.message);
    return json(500, { error: 'prepare_failed' });
  }
  const prep = data as Prepared;
  if (prep.owned_servers.length) return json(409, { error: 'owns_servers', servers: prep.owned_servers });

  // Stop future checkout creation and recurring Stripe charges before removing the identity.
  try { await closeAccountBilling({env:name=>(Deno.env.get(name)??'').trim(),rpc:(name,args)=>admin.rpc(name,args),user:async()=>null},user.id); }
  catch { return json(503,{error:'billing_cleanup_failed'}); }

  // 5. Dateien. Schlägt etwas fehl, bleibt das Konto bestehen und die Löschung kann wiederholt werden.
  for (const [bucket, paths] of [
    ['media', prep.media],
    ['attachments', prep.attachments],
  ] as const) {
    for (let i = 0; i < paths.length; i += CHUNK) {
      const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + CHUNK));
      if (error) {
        console.error('[delete-account] storage failed', bucket, error.message);
        return json(500, { error: 'storage_failed' });
      }
    }
  }

  // 6. Konto selbst (endgültig, kein Soft-Delete)
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error('[delete-account] delete failed', deleteError.message);
    return json(500, { error: 'delete_failed' });
  }
  return json(200, { deleted: true, files: prep.media.length + prep.attachments.length });
});
