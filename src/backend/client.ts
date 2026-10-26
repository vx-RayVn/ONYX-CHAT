/** The Supabase client (created only in cloud mode). */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { CLOUD, SUPABASE_KEY, SUPABASE_URL } from './config';

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!CLOUD) throw new Error('Supabase is not configured (local demo mode).');
  client ??= createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'onyx-auth' },
  });
  return client;
}

/** Isolated, memory-only sign-in: adding an account cannot replace the active session on a failed attempt. */
export function accountAuthClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: `onyx-add-${crypto.randomUUID()}` },
  });
}
