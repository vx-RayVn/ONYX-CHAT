/**
 * Write queue. Every change is sent to Supabase in the order it was made, so a
 * message never arrives before its DM exists and quick toggles end in the
 * right state. Fast typing (role names, profile text) is coalesced first.
 */
import { t } from '../i18n';
import { toast } from '../store/ui';

export type Result = PromiseLike<{ data?: unknown; error: { message: string; code?: string } | null }>;

let chain: Promise<unknown> = Promise.resolve();
let pending = 0;
let generation = 0;
const debounced = new Map<string, { patch: Record<string, unknown>; timer: ReturnType<typeof setTimeout>; run: (patch: Record<string, unknown>) => Result }>();
const idleWaiters = new Set<() => void>();

/** True while changes are still on their way (structure reloads wait for this). */
export function isBusy() {
  return pending > 0 || debounced.size > 0;
}

export function whenIdle(): Promise<void> {
  if (!isBusy()) return Promise.resolve();
  return new Promise((resolve) => idleWaiters.add(resolve));
}

function settle() {
  if (isBusy()) return;
  idleWaiters.forEach((r) => r());
  idleWaiters.clear();
}

export function describeError(e: unknown): string {
  const err = e as { code?: string; message?: string } | null;
  const code = err?.code ?? '';
  const msg = err?.message ?? String(e ?? '');
  if(/registration_required/i.test(msg))return t('Create a free account to use this feature.');
  if(/mfa_required/i.test(msg))return t('Confirm your authenticator code to continue.');
  if(/session_expired/i.test(msg))return t('Your session has expired. Sign in again.');
  if (/slowmode active/i.test(msg)) return t('Slowmode is on – wait a moment before sending the next message.');
  if (/account suspended/i.test(msg)) return t('Your ONYX account is suspended.');
  if (/banned from this server/i.test(msg)) return t('You’re banned from this server.');
  if (/rate limited: report/i.test(msg)) return t('You sent many reports in a short time. Please wait a few minutes.');
  if (/rate limited/i.test(msg)) return t('Slow down a little – too many actions in a short time. Try again in a few minutes.');
  if (code === '42501' || /row-level security|permission denied|missing permission/i.test(msg)) return t('You don’t have permission for this.');
  if (code === '23505') return t('That name is already taken.');
  if (code === '23514' || code === '22001' || code === '23502') return t('The server rejected this change (too long, too large or not allowed).');
  if (/failed to fetch|networkerror|network request failed|load failed/i.test(msg)) return t('No connection to the server. Check your internet connection.');
  return msg || t('Unknown error');
}

export interface EnqueueOptions<T> {
  /** Shown as toast title when the change fails. */
  title?: string;
  /** Reverts the optimistic change. Without it, the data is reloaded from the server. */
  undo?: () => void;
  onData?: (data: T) => void;
  /** Called when nothing could be undone locally (default: reload the structure). */
  onFail?: () => void;
}

let failHandler: () => void = () => {};
let suspendedHandler: () => void = () => {};
let verificationHandler:(reason:'mfa_required'|'session_expired')=>void=()=>{};
export function setVerificationHandler(fn:typeof verificationHandler){verificationHandler=fn;}
export function handleVerificationError(error:unknown){const message=(error as {message?:string})?.message??'';if(/mfa_required|session_expired/.test(message))verificationHandler(message.includes('mfa_required')?'mfa_required':'session_expired');}

/** Set by sync.ts: what to do after a failed change without its own undo (reload from the server). */
export function setFailHandler(fn: () => void) {
  failHandler = fn;
}

/** Set by auth.ts: the server refused a change because the account is suspended (check and show the suspension screen). */
export function setSuspendedHandler(fn: () => void) {
  suspendedHandler = fn;
}

export function enqueue<T = unknown>(op: () => Result, opts: EnqueueOptions<T> = {}): Promise<boolean> {
  const revision=generation;
  pending++;
  const run = chain.then(async () => {
    try {
      if(revision!==generation)return false;
      const { data, error } = await op();
      if(revision!==generation)return false;
      if (error) throw error;
      opts.onData?.(data as T);
      return true;
    } catch (e) {
      if(revision!==generation)return false;
      handleVerificationError(e);
      if(revision!==generation)return false;
      console.warn('[onyx] change failed', e);
      if (/account suspended/i.test((e as { message?: string } | null)?.message ?? '')) suspendedHandler();
      toast({ tone: 'danger', title: opts.title ?? t('Change not saved'), body: describeError(e) });
      if (opts.undo) opts.undo();
      else (opts.onFail ?? failHandler)();
      return false;
    } finally {
      pending--;
      settle();
    }
  });
  chain = run;
  return run;
}

/** Merges quick successive patches of the same row and sends them once typing pauses. */
export function enqueueDebounced(key: string, patch: Record<string, unknown>, run: (patch: Record<string, unknown>) => Result, delay = 600) {
  const existing = debounced.get(key);
  if (existing) clearTimeout(existing.timer);
  const merged = { ...(existing?.patch ?? {}), ...patch };
  const timer = setTimeout(() => {
    debounced.delete(key);
    void enqueue(() => run(merged));
  }, delay);
  debounced.set(key, { patch: merged, timer, run });
}

/** Sends coalesced changes right away (e.g. before the page is hidden). */
export function flushDebounced() {
  for (const [key, d] of debounced) {
    clearTimeout(d.timer);
    debounced.delete(key);
    void enqueue(() => d.run(d.patch));
  }
}

/** Drops everything that was not sent yet (sign-out). */
export function resetQueue() {
  generation++;
  for (const d of debounced.values()) clearTimeout(d.timer);
  debounced.clear();
  chain = Promise.resolve();
}
