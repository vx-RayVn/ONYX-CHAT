/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL, e.g. https://abcd.supabase.co (set in .env.local). */
  readonly VITE_SUPABASE_URL?: string;
  /** Public key: "publishable" (sb_publishable_…) or the legacy "anon" key. Never the service_role/secret key. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** "local" forces the local demo even when Supabase is configured. */
  readonly VITE_ONYX_BACKEND?: 'local' | 'supabase';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
