/**
 * Moderation in cloud mode: the own account status (platform admin,
 * suspension), the live suspension signal, reports and the ONYX admin area.
 *
 * Everything here is checked again by the server (RLS, RPCs and the
 * "platform-ban" Edge Function, which alone holds the service key); this
 * module only calls it.
 */
import { create } from 'zustand';
import { FunctionsHttpError, type RealtimeChannel } from '@supabase/supabase-js';
import type { Attachment, AvatarSource, BannerSource, CustomStatus, ID } from '../types';
import { t } from '../i18n';
import { supabase } from './client';
import { store } from './bridge';
import { fetchProfiles } from './load';
import { toUser } from './map';
import { removeAttachments } from './media';
import { describeError } from './queue';

export interface Suspension {
  reason: string | null;
  at: number;
}

/** Flags of the signed-in account (not persisted). */
export const useAccount = create<{ admin: boolean }>(() => ({ admin: false }));

/* ---------------------------------------------------------------- */
/* Own account                                                        */
/* ---------------------------------------------------------------- */

interface AccountStatusRow {
  admin?: boolean;
  suspension?: { reason: string | null; at: string } | null;
}

const toSuspension = (s: { reason?: string | null; at?: string } | null | undefined): Suspension | null =>
  s ? { reason: s.reason ?? null, at: s.at ? new Date(s.at).getTime() : Date.now() } : null;

/** Platform admin? Suspended? A failed check never blocks the app (the database refuses writes anyway). */
export async function fetchAccountStatus(): Promise<{ admin: boolean; suspension: Suspension | null }> {
  const { data, error } = await supabase().rpc('account_status');
  if (error || !data) return { admin: false, suspension: null };
  const row = data as AccountStatusRow;
  return { admin: !!row.admin, suspension: toSuspension(row.suspension) };
}

let accountChannel: RealtimeChannel | null = null;

/**
 * Private channel "account:<id>" (only this account may listen). The server
 * sends "suspended" there when a platform admin suspends the account. After a
 * reconnect the status is asked once more, in case the signal was missed.
 */
export function watchAccount(userId: ID, onSuspended: (s: Suspension) => void) {
  unwatchAccount();
  let subscribedBefore = false;
  const ch = supabase().channel(`account:${userId}`, { config: { private: true } });
  ch.on('broadcast', { event: 'suspended' }, ({ payload }) => onSuspended(toSuspension(payload as { reason?: string | null; at?: string })!));
  ch.subscribe((status) => {
    if (status !== 'SUBSCRIBED') return;
    if (subscribedBefore) void fetchAccountStatus().then((s) => s.suspension && onSuspended(s.suspension));
    subscribedBefore = true;
  });
  accountChannel = ch;
}

export function unwatchAccount() {
  if (accountChannel) void supabase().removeChannel(accountChannel);
  accountChannel = null;
}

/* ---------------------------------------------------------------- */
/* Reports                                                            */
/* ---------------------------------------------------------------- */

export type ReportReason = 'spam' | 'harassment' | 'hate' | 'violence' | 'sexual' | 'self_harm' | 'scam' | 'impersonation' | 'illegal' | 'other';
export type ReportResult = 'created' | 'duplicate';

/** The server copies the message (text, attachments, author, place, time) – nothing of it comes from here. */
export async function reportMessage(messageId: ID, reason: ReportReason, details: string): Promise<ReportResult> {
  const { data, error } = await supabase().rpc('report_message', { p_message: messageId, p_reason: reason, p_details: details.trim() || null });
  if (error) throw error;
  return (data as { status: ReportResult }).status;
}

export async function reportUser(userId: ID, reason: ReportReason, details: string): Promise<ReportResult> {
  const { data, error } = await supabase().rpc('report_user', { p_user: userId, p_reason: reason, p_details: details.trim() || null });
  if (error) throw error;
  return (data as { status: ReportResult }).status;
}

/* ---------------------------------------------------------------- */
/* Admin area (platform admins only – the database returns nothing   */
/* to anyone else)                                                    */
/* ---------------------------------------------------------------- */

export type ReportStatus = 'open' | 'resolved' | 'dismissed';

export interface ReportRow {
  id: ID;
  kind: 'message' | 'user';
  reason: ReportReason;
  details: string | null;
  reporter_id: ID | null;
  target_user_id: ID | null;
  target_username: string | null;
  message_id: ID | null;
  server_id: ID | null;
  server_name: string | null;
  channel_id: ID | null;
  channel_name: string | null;
  dm_id: ID | null;
  content: string | null;
  attachments: Attachment[];
  message_created_at: string | null;
  profile_snapshot: {
    username?: string;
    display_name?: string;
    bio?: string | null;
    pronouns?: string | null;
    avatar?: AvatarSource | null;
    banner?: BannerSource | null;
    custom_status?: CustomStatus | null;
  } | null;
  status: ReportStatus;
  handled_by: ID | null;
  handled_at: string | null;
  message_deleted_at: string | null;
  created_at: string;
}

export interface PlatformBanRow {
  id: ID;
  user_id: ID;
  reason: string | null;
  banned_by: ID | null;
  created_at: string;
  lifted_at: string | null;
  lifted_by: ID | null;
}

/** Puts profiles that are not in the store yet (reporters, reported accounts) into it. */
async function ensureProfiles(ids: (ID | null | undefined)[]) {
  const s = store().getState();
  const missing = [...new Set(ids.filter((x): x is ID => !!x && !s.users[x]))];
  if (!missing.length) return;
  const rows = await fetchProfiles(missing);
  store().setState((st) => {
    for (const p of rows) if (!st.users[p.id]) st.users[p.id] = toUser(p, p.id === st.meId);
  });
}

/** Open reports (oldest first, so nothing waits forever) or handled ones (newest first). */
export async function loadReports(open: boolean): Promise<ReportRow[]> {
  const base = supabase().from('reports').select('*');
  const { data, error } = await (open ? base.eq('status', 'open') : base.neq('status', 'open')).order(open ? 'created_at' : 'handled_at', { ascending: open }).limit(200);
  if (error) throw error;
  const rows = (data ?? []) as ReportRow[];
  await ensureProfiles(rows.flatMap((r) => [r.reporter_id, r.target_user_id, r.handled_by]));
  return rows;
}

/** Active ONYX-wide suspensions. */
export async function loadSuspensions(): Promise<PlatformBanRow[]> {
  const { data, error } = await supabase().from('platform_bans').select('*').is('lifted_at', null).order('created_at', { ascending: false }).limit(500);
  if (error) throw error;
  const rows = (data ?? []) as PlatformBanRow[];
  await ensureProfiles(rows.flatMap((r) => [r.user_id, r.banned_by]));
  return rows;
}

export async function setReportStatus(reportId: ID, status: ReportStatus) {
  const { error } = await supabase().rpc('admin_set_report_status', { p_report: reportId, p_status: status });
  if (error) throw error;
}

/** Deletes the reported message everywhere and its files. false: it was already gone. */
export async function deleteReportedMessage(reportId: ID): Promise<boolean> {
  const { data, error } = await supabase().rpc('admin_delete_reported_message', { p_report: reportId });
  if (error) throw error;
  const res = data as { deleted: boolean; attachments: Attachment[] };
  const paths = (res.attachments ?? []).map((a) => a.path).filter((p): p is string => !!p);
  // Best effort, like deleting a message in the chat.
  await removeAttachments(paths).catch(() => undefined);
  return res.deleted;
}

/** Finds an account by its username (for "Suspend an account"). */
export async function findUserByName(username: string): Promise<ID | null> {
  const name = username.trim().replace(/^@/, '').toLowerCase();
  if (!name) return null;
  const { data } = await supabase().from('profiles').select('id').eq('username', name).maybeSingle();
  const id = (data as { id: ID } | null)?.id ?? null;
  if (id) await ensureProfiles([id]);
  return id;
}

async function platformBan(body: { action: 'ban' | 'unban'; userId: ID; reason?: string }) {
  const { error } = await supabase().functions.invoke('platform-ban', { body });
  if (!error) return;
  let message = error.message;
  if (error instanceof FunctionsHttpError) {
    try {
      const json = (await (error.context as Response).json()) as { error?: string };
      if (json?.error) message = json.error;
    } catch {
      /* keep the generic message */
    }
  }
  throw new Error(message);
}

/** ONYX-wide suspension: sign-in blocked, every session ended, open tabs signed out. */
export const suspendAccount = (userId: ID, reason: string) => platformBan({ action: 'ban', userId, reason: reason.trim() });
export const liftSuspension = (userId: ID) => platformBan({ action: 'unban', userId });

/** Readable text for errors of the moderation calls. */
export function moderationError(e: unknown): string {
  const msg = (e as { message?: string } | null)?.message ?? '';
  if (/not a platform admin/i.test(msg)) return t('Only ONYX admins can do this.');
  if (/cannot suspend themselves/i.test(msg)) return t('You can’t suspend your own account.');
  if (/platform admins cannot be suspended/i.test(msg)) return t('ONYX admins can’t be suspended.');
  if (/user not found/i.test(msg)) return t('This account no longer exists.');
  if (/message not found/i.test(msg)) return t('This message no longer exists or you can’t see it anymore.');
  return describeError(e);
}
