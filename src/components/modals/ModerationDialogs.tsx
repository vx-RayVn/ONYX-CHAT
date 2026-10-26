/**
 * Moderation dialogs: ban from a server, report a message or an account,
 * suspend an account ONYX-wide (platform admins).
 */
import { useState } from 'react';
import { Ban, Flag, ShieldAlert } from 'lucide-react';
import type { ID } from '../../types';
import { useStore } from '../../store/store';
import { toast, useUI } from '../../store/ui';
import { CLOUD } from '../../backend/config';
import { moderationError, reportMessage, reportUser, suspendAccount, type ReportReason } from '../../backend/moderation';
import { cn } from '../../lib/utils';
import { t, tk, tn } from '../../i18n';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { TextArea } from '../ui/Field';
import { Avatar } from '../ui/Avatar';
import { plainPreview } from '../chat/MessageContent';

export const REPORT_REASONS: { id: ReportReason; label: string }[] = [
  { id: 'spam', label: tk('Spam or unwanted advertising') },
  { id: 'harassment', label: tk('Harassment or bullying') },
  { id: 'hate', label: tk('Hate speech or discrimination') },
  { id: 'violence', label: tk('Threats or violence') },
  { id: 'sexual', label: tk('Sexual content') },
  { id: 'self_harm', label: tk('Self-harm or suicide') },
  { id: 'scam', label: tk('Scam, phishing or fraud') },
  { id: 'impersonation', label: tk('Impersonation') },
  { id: 'illegal', label: tk('Illegal content') },
  { id: 'other', label: tk('Something else') },
];

export const reportReasonLabel = (id: ReportReason) => t(REPORT_REASONS.find((r) => r.id === id)?.label ?? id);

/* ---------------------------------------------------------------- */
/* Ban from a server                                                  */
/* ---------------------------------------------------------------- */

export function BanDialog({ serverId, userId }: { serverId: ID; userId: ID }) {
  const close = useUI((s) => s.closeModal);
  const server = useStore((s) => s.servers[serverId]);
  const user = useStore((s) => s.users[userId]);
  const [reason, setReason] = useState('');
  if (!server || !user) return null;
  const submit = () => {
    useStore.getState().banMember(serverId, userId, reason);
    close();
  };
  return (
    <Modal
      open
      onClose={close}
      size="sm"
      title={t('Ban {name}', { name: user.displayName })}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t('Cancel')}
          </Button>
          <Button variant="danger" icon={<Ban />} onClick={submit}>
            {t('Ban')}
          </Button>
        </>
      }
    >
      <div className="confirm-body">
        <p className="report-note">{t('{name} is removed from {server} and can’t rejoin – not even with an invite – until someone unbans them.', { name: user.displayName, server: server.name })}</p>
        <TextArea
          label={t('Reason (optional)')}
          hint={t('Only visible to members who can ban.')}
          value={reason}
          maxLength={512}
          showCounter
          rows={3}
          autoFocus
          onChange={(e) => setReason(e.target.value)}
        />
        {!CLOUD && <p className="confirm-tip">{t('Demo: the ban only exists in this browser.')}</p>}
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- */
/* Report                                                             */
/* ---------------------------------------------------------------- */

type ReportTarget = { kind: 'message'; channelId: ID; messageId: ID } | { kind: 'user'; userId: ID };

export function ReportDialog({ target }: { target: ReportTarget }) {
  const close = useUI((s) => s.closeModal);
  const message = useStore((s) => (target.kind === 'message' ? s.messages[target.channelId]?.find((m) => m.id === target.messageId) : undefined));
  const userId = target.kind === 'user' ? target.userId : message?.authorId;
  const user = useStore((s) => (userId ? s.users[userId] : undefined));
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (target.kind === 'message' && !message) return null;

  const submit = async () => {
    if (!reason || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = target.kind === 'message' ? await reportMessage(target.messageId, reason, details) : await reportUser(target.userId, reason, details);
      close();
      if (res === 'created') toast({ tone: 'success', title: t('Report sent – thank you'), body: t('The ONYX team reviews reports by hand. You won’t get an automatic reply.') });
      else toast({ tone: 'info', title: t('Already reported'), body: t('You already reported this and your report is still open.') });
    } catch (e) {
      setError(moderationError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={close}
      size="md"
      title={target.kind === 'message' ? t('Report message') : t('Report {name}', { name: user?.displayName ?? t('account') })}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t('Cancel')}
          </Button>
          <Button variant="danger" icon={<Flag />} disabled={!reason} loading={busy} onClick={() => void submit()}>
            {t('Send report')}
          </Button>
        </>
      }
    >
      <div className="report-dialog">
        {message ? (
          <div className="confirm-msg">
            <Avatar user={user} size={32} />
            <div>
              <strong>{user?.displayName}</strong>
              <span>{message.content ? plainPreview(message.content).slice(0, 220) : tn(message.attachments.length, '{count} attachment', '{count} attachments')}</span>
            </div>
          </div>
        ) : (
          user && (
            <div className="confirm-msg">
              <Avatar user={user} size={32} />
              <div>
                <strong>{user.displayName}</strong>
                <span>{user.username}</span>
              </div>
            </div>
          )
        )}
        <p className="report-note">
          {target.kind === 'message'
            ? t('A copy of this message (text, attachments, author and time) goes to the ONYX team – even if it is deleted later.')
            : t('A copy of the visible profile (name, picture, bio) goes to the ONYX team.')}
        </p>
        <h3 className="report-h">{t('What is the problem?')}</h3>
        <div className="report-reasons" role="radiogroup" aria-label={t('What is the problem?')}>
          {REPORT_REASONS.map((r) => (
            <button key={r.id} type="button" role="radio" aria-checked={reason === r.id} className={cn('report-reason', reason === r.id && 'is-checked')} onClick={() => setReason(r.id)}>
              <span className="radio-dot" />
              {t(r.label)}
            </button>
          ))}
        </div>
        {(reason === 'self_harm' || reason === 'violence') && <p className="report-urgent">{t('If someone is in immediate danger, contact your local emergency services right away.')}</p>}
        <TextArea
          label={t('More details (optional)')}
          placeholder={t('What happened? Anything that helps the team understand it.')}
          value={details}
          maxLength={1000}
          showCounter
          rows={3}
          onChange={(e) => setDetails(e.target.value)}
        />
        {error && <p className="report-error">{error}</p>}
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- */
/* Suspend ONYX-wide (platform admins)                                */
/* ---------------------------------------------------------------- */

export function SuspendDialog({ userId, onDone }: { userId: ID; onDone?: () => void }) {
  const close = useUI((s) => s.closeModal);
  const user = useStore((s) => s.users[userId]);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = user?.displayName ?? t('this account');

  const submit = async () => {
    if (!reason.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await suspendAccount(userId, reason);
      close();
      toast({ tone: 'success', title: t('{name} is suspended', { name }), body: t('Signed out everywhere and can’t sign in anymore.') });
      onDone?.();
    } catch (e) {
      setError(moderationError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={close}
      size="sm"
      title={t('Suspend {name} from ONYX', { name })}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t('Cancel')}
          </Button>
          <Button variant="danger" icon={<ShieldAlert />} disabled={!reason.trim()} loading={busy} onClick={() => void submit()}>
            {t('Suspend account')}
          </Button>
        </>
      }
    >
      <div className="confirm-body">
        <ul className="check-list is-consequence">
          <li>{t('Can’t sign in anymore – not with a password, code or link')}</li>
          <li>{t('Is signed out on every device right away')}</li>
          <li>{t('Can’t write, upload or react anymore')}</li>
        </ul>
        <p className="confirm-tip">{t('Messages and profile stay visible. You can lift the suspension at any time under Settings › ONYX admin.')}</p>
        <TextArea
          label={t('Reason')}
          hint={t('Shown to the person on the suspension screen.')}
          value={reason}
          maxLength={1000}
          showCounter
          rows={3}
          autoFocus
          onChange={(e) => setReason(e.target.value)}
        />
        {error && <p className="report-error">{error}</p>}
      </div>
    </Modal>
  );
}
