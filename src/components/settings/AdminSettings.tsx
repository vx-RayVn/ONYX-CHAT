/**
 * ONYX admin area (Settings › ONYX admin) – only shown to platform admins.
 * Hiding it is just for clarity: the database returns reports and
 * suspensions to admins only, and every action is checked again on the server.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Check, ExternalLink, Flag, RefreshCw, RotateCcw, ShieldAlert, ShieldCheck, Trash, X } from 'lucide-react';
import type { ID, User } from '../../types';
import { useStore } from '../../store/store';
import { toast, useUI } from '../../store/ui';
import {
  deleteReportedMessage,
  findUserByName,
  liftSuspension,
  loadReports,
  loadSuspensions,
  moderationError,
  setReportStatus,
  type PlatformBanRow,
  type ReportRow,
  type ReportStatus,
} from '../../backend/moderation';
import { signedUrl } from '../../backend/media';
import { formatBytes, formatLongDateTime, formatRelative, formatShortDate } from '../../lib/utils';
import { t, tn } from '../../i18n';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { Segmented } from '../ui/Field';
import { EmptyArt, EmptyState } from '../ui/misc';
import { reportReasonLabel } from '../modals/ModerationDialogs';
import { SettingsHeader, SettingsSection } from './SettingsLayout';

type Tab = 'open' | 'handled' | 'suspended';

function Person({ user, fallback, label, suspended }: { user?: User; fallback?: string | null; label: string; suspended?: boolean }) {
  return (
    <div className="report-person">
      <Avatar user={user} size={28} />
      <div className="report-person-text">
        <span className="report-person-label">{label}</span>
        <span className="truncate">
          <strong>{user?.displayName ?? fallback ?? t('Deleted account')}</strong>
          {user && <span className="muted"> @{user.username}</span>}
          {suspended && <span className="chip chip-sm report-chip-danger">{t('Suspended')}</span>}
        </span>
      </div>
    </div>
  );
}

async function openAttachment(path: string | undefined) {
  const url = path ? await signedUrl(path) : null;
  if (url) window.open(url, '_blank', 'noopener');
  else toast({ tone: 'danger', title: t('The file is no longer available.') });
}

function ReportCard({ report, suspended, onChanged }: { report: ReportRow; suspended: boolean; onChanged: () => void }) {
  const users = useStore((s) => s.users);
  const [busy, setBusy] = useState<string | null>(null);
  const ui = useUI.getState();
  const reporter = report.reporter_id ? users[report.reporter_id] : undefined;
  const target = report.target_user_id ? users[report.target_user_id] : undefined;
  const handler = report.handled_by ? users[report.handled_by] : undefined;
  const open = report.status === 'open';

  const run = async (key: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    try {
      await fn();
      if (done) toast({ tone: 'success', title: done });
      onChanged();
    } catch (e) {
      toast({ tone: 'danger', title: t('Action failed'), body: moderationError(e) });
    } finally {
      setBusy(null);
    }
  };

  const setStatus = (status: ReportStatus) => void run(status, () => setReportStatus(report.id, status));

  const deleteMessage = () =>
    ui.openModal({
      type: 'confirm',
      title: t('Delete reported message'),
      body: t('The message and its files are deleted for everyone. The copy in this report stays.'),
      confirmLabel: t('Delete'),
      danger: true,
      onConfirm: () =>
        void run('delete', async () => {
          const deleted = await deleteReportedMessage(report.id);
          if (!deleted) toast({ tone: 'info', title: t('The message was already deleted.') });
        }),
    });

  const lift = () =>
    ui.openModal({
      type: 'confirm',
      title: t('Lift suspension'),
      body: t('{name} can sign in and write again.', { name: target?.displayName ?? report.target_username ?? t('The account') }),
      confirmLabel: t('Lift suspension'),
      onConfirm: () => void run('lift', () => liftSuspension(report.target_user_id!), t('Suspension lifted')),
    });

  const snap = report.profile_snapshot;
  return (
    <article className="report-card">
      <header className="report-head">
        <span className="chip chip-sm report-chip-reason">
          <Flag size={13} />
          {reportReasonLabel(report.reason)}
        </span>
        <span className="muted">{report.kind === 'message' ? t('Message') : t('Account')}</span>
        <span className="grow" />
        <span className="muted" title={formatLongDateTime(new Date(report.created_at).getTime())}>
          {formatRelative(new Date(report.created_at).getTime())}
        </span>
      </header>

      <div className="report-people">
        <Person label={t('Reported by')} user={reporter} />
        <Person label={report.kind === 'message' ? t('Author') : t('Reported account')} user={target} fallback={report.target_username} suspended={suspended} />
      </div>

      {report.kind === 'message' ? (
        <div className="report-content">
          <div className="report-where">
            {report.dm_id ? t('Direct message') : `${report.server_name ?? t('Server')} · #${report.channel_name ?? t('channel')}`}
            {report.message_created_at && <> · {formatLongDateTime(new Date(report.message_created_at).getTime())}</>}
            {report.message_deleted_at && <span className="chip chip-sm">{t('Message deleted')}</span>}
          </div>
          {report.content ? <p className="report-text">{report.content}</p> : <p className="report-text muted">{t('No text')}</p>}
          {report.attachments.length > 0 && (
            <ul className="report-files">
              {report.attachments.map((a) => (
                <li key={a.id ?? a.path}>
                  <span className="truncate">{a.name}</span>
                  <span className="muted">{formatBytes(a.size ?? 0)}</span>
                  <button className="btn btn-link btn-sm" onClick={() => void openAttachment(a.path)}>
                    <ExternalLink size={14} /> {t('Open')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        snap && (
          <div className="report-content">
            <div className="report-where">{t('Profile at the time of the report')}</div>
            <p className="report-text">
              <strong>{snap.display_name}</strong> <span className="muted">@{snap.username}</span>
              {snap.pronouns && <span className="muted"> · {snap.pronouns}</span>}
            </p>
            {snap.bio && <p className="report-text">{snap.bio}</p>}
          </div>
        )
      )}

      {report.details && (
        <p className="report-details">
          <span className="report-person-label">{t('Note from the reporter')}</span>
          {report.details}
        </p>
      )}

      {open ? (
        <div className="report-actions">
          {report.kind === 'message' && !report.message_deleted_at && (
            <Button variant="danger" size="sm" icon={<Trash />} loading={busy === 'delete'} onClick={deleteMessage}>
              {t('Delete message')}
            </Button>
          )}
          {report.target_user_id &&
            (suspended ? (
              <Button variant="secondary" size="sm" icon={<ShieldCheck />} loading={busy === 'lift'} onClick={lift}>
                {t('Lift suspension')}
              </Button>
            ) : (
              <Button variant="secondary" size="sm" icon={<ShieldAlert />} onClick={() => ui.openModal({ type: 'suspend', userId: report.target_user_id!, onDone: onChanged })}>
                {t('Suspend account')}
              </Button>
            ))}
          <span className="grow" />
          <Button variant="ghost" size="sm" icon={<X />} loading={busy === 'dismissed'} onClick={() => setStatus('dismissed')}>
            {t('Dismiss')}
          </Button>
          <Button size="sm" icon={<Check />} loading={busy === 'resolved'} onClick={() => setStatus('resolved')}>
            {t('Mark as resolved')}
          </Button>
        </div>
      ) : (
        <div className="report-actions">
          <span className="muted">
            {(report.status === 'resolved' ? t('Resolved by {name}', { name: handler?.displayName ?? t('an admin') }) : t('Dismissed by {name}', { name: handler?.displayName ?? t('an admin') })) +
              (report.handled_at ? ` · ${formatShortDate(new Date(report.handled_at).getTime())}` : '')}
          </span>
          <span className="grow" />
          <Button variant="ghost" size="sm" icon={<RotateCcw />} loading={busy === 'open'} onClick={() => setStatus('open')}>
            {t('Reopen')}
          </Button>
        </div>
      )}
    </article>
  );
}

function Suspensions({ list, onChanged }: { list: PlatformBanRow[]; onChanged: () => void }) {
  const users = useStore((s) => s.users);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ui = useUI.getState();

  const suspendByName = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const id = await findUserByName(name);
      if (!id) setError(t('No account with this username.'));
      else ui.openModal({ type: 'suspend', userId: id, onDone: onChanged });
    } finally {
      setBusy(false);
    }
  };

  const lift = (userId: ID, label: string) =>
    ui.openModal({
      type: 'confirm',
      title: t('Lift suspension'),
      body: t('{name} can sign in and write again.', { name: label }),
      confirmLabel: t('Lift suspension'),
      onConfirm: () =>
        void liftSuspension(userId)
          .then(() => {
            toast({ tone: 'success', title: t('Suspension lifted') });
            onChanged();
          })
          .catch((err) => toast({ tone: 'danger', title: t('Action failed'), body: moderationError(err) })),
    });

  return (
    <>
      <SettingsSection title={t('Suspend an account')} description={t('Signs the account out everywhere and blocks sign-in until you lift the suspension.')}>
        <form className="admin-suspend-form" onSubmit={(e) => void suspendByName(e)}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Username')} aria-label={t('Username')} />
          <Button type="submit" variant="danger" icon={<ShieldAlert />} disabled={!name.trim()} loading={busy}>
            {t('Suspend …')}
          </Button>
        </form>
        {error && <p className="report-error">{error}</p>}
      </SettingsSection>
      <SettingsSection title={tn(list.length, '{count} suspended account', '{count} suspended accounts')}>
        {list.length === 0 ? (
          <EmptyState compact art={<EmptyArt icon={<ShieldCheck />} />} title={t('No suspended accounts')} />
        ) : (
          <div className="member-table">
            {list.map((b) => {
              const u = users[b.user_id];
              const by = b.banned_by ? users[b.banned_by] : undefined;
              const label = u?.displayName ?? t('Deleted account');
              return (
                <div key={b.id} className="mt-row ban-row">
                  <Avatar user={u} size={36} />
                  <div className="mt-name">
                    <strong className="truncate">
                      {label}
                      {u && <span className="muted"> @{u.username}</span>}
                    </strong>
                    <span className="truncate">{t('Suspended by {name} · {date}', { name: by?.displayName ?? t('an admin'), date: formatShortDate(new Date(b.created_at).getTime()) })}</span>
                  </div>
                  <div className="ban-reason">{b.reason ? <span>{b.reason}</span> : <span className="muted">{t('No reason given')}</span>}</div>
                  <Button variant="secondary" size="sm" onClick={() => lift(b.user_id, label)}>
                    {t('Lift suspension')}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </SettingsSection>
    </>
  );
}

export function AdminSettings() {
  const [tab, setTab] = useState<Tab>('open');
  const [reports, setReports] = useState<ReportRow[] | null>(null);
  const [suspensions, setSuspensions] = useState<PlatformBanRow[]>([]);
  const [openCount, setOpenCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, bans] = await Promise.all([tab === 'suspended' ? Promise.resolve(null) : loadReports(tab === 'open'), loadSuspensions()]);
      setSuspensions(bans);
      if (list) setReports(list);
      if (tab === 'open' && list) setOpenCount(list.length);
    } catch (e) {
      setError(moderationError(e));
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    setReports(null);
    void load();
  }, [load]);

  const suspendedIds = new Set(suspensions.map((b) => b.user_id));

  return (
    <>
      <SettingsHeader title={t('ONYX admin')} description={t('Only visible to platform admins. The server checks every action here again.')} />
      <div className="admin-toolbar">
        <Segmented
          value={tab}
          onChange={setTab}
          label={t('ONYX admin')}
          options={[
            { value: 'open', label: openCount ? `${t('Open reports')} (${openCount})` : t('Open reports') },
            { value: 'handled', label: t('Handled') },
            { value: 'suspended', label: t('Suspended accounts') },
          ]}
        />
        <Button variant="ghost" size="sm" icon={<RefreshCw />} loading={loading} onClick={() => void load()}>
          {t('Refresh')}
        </Button>
      </div>
      {error && <p className="report-error">{error}</p>}
      {tab === 'suspended' ? (
        <Suspensions list={suspensions} onChanged={() => void load()} />
      ) : reports === null ? (
        <div className="admin-loading">{t('Loading …')}</div>
      ) : reports.length === 0 ? (
        <EmptyState
          compact
          art={<EmptyArt icon={<Flag />} />}
          title={tab === 'open' ? t('No open reports') : t('Nothing handled yet')}
          body={tab === 'open' ? t('New reports appear here. Refresh to check again.') : undefined}
        />
      ) : (
        <div className="report-list">
          {reports.map((r) => (
            <ReportCard key={r.id} report={r} suspended={!!r.target_user_id && suspendedIds.has(r.target_user_id)} onChanged={() => void load()} />
          ))}
        </div>
      )}
    </>
  );
}
