/**
 * Backend mode.
 *
 * Cloud mode (Supabase) runs when VITE_SUPABASE_URL and a publishable/anon key
 * are set (in .env.local) and VITE_ONYX_BACKEND is not "local". Otherwise ONYX
 * runs exactly as before: a local demo with sample data. In development,
 * "?local" in the URL forces the demo as well.
 *
 * Only the public key belongs here. A service_role / secret key bypasses every
 * security rule and must never reach the browser, so it is refused.
 */
const env = import.meta.env;

const url = String(env.VITE_SUPABASE_URL ?? '').trim();
const key = String(env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || '').trim();
const forcedLocal = env.VITE_ONYX_BACKEND === 'local' || (env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('local'));

function isSecretKey(k: string) {
  if (k.startsWith('sb_secret_')) return true;
  const parts = k.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload?.role === 'service_role';
  } catch {
    return false;
  }
}

/** Set when the configuration must not be used (shown on the sign-in screen). */
export const CONFIG_ERROR: string | null = url && key && isSecretKey(key) ? 'secret-key' : null;

export const CLOUD = !!url && !!key && !forcedLocal && !CONFIG_ERROR;
export const SUPABASE_URL = url;
export const SUPABASE_KEY = key;
