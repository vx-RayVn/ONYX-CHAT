import { useState } from 'react';
import { CircleAlert, Settings, Trash } from 'lucide-react';
import { useStore } from '../../store/store';
import { useUI } from '../../store/ui';
import { useMe } from '../../store/selectors';
import { deleteAccount } from '../../backend/auth';
import { t } from '../../i18n';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { TextField } from '../ui/Field';
import { ServerIcon } from '../layout/ServerRail';

const normalize = (v: string) => v.trim().replace(/^@/, '').toLowerCase();

/**
 * Cloud mode: deletes the account for good (Edge Function "delete-account").
 * Explains what goes and what stays, needs the username typed in and refuses
 * while the account still owns servers (they would vanish for everyone).
 */
export function DeleteAccountModal() {
  const ui = useUI.getState();
  const me = useMe();
  const meId = useStore((s) => s.meId);
  const servers = useStore((s) => s.servers);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // What the server reported (fresher than the local list, e.g. after a change in another tab).
  const [reported, setReported] = useState<{ id: string; name: string }[] | null>(null);

  const owned =
    reported ??
    Object.values(servers)
      .filter((sv) => sv.ownerId === meId)
      .map((sv) => ({ id: sv.id, name: sv.name }));
  const matches = !!me && normalize(typed) === me.username.toLowerCase();
  const canDelete = matches && owned.length === 0 && !busy;

  const submit = async () => {
    if (!canDelete) return;
    setBusy(true);
    setError(null);
    const res = await deleteAccount(typed.trim());
    if (res.ok) {
      ui.closeModal();
      ui.closeSettings();
      return;
    }
    setBusy(false);
    if (res.reason === 'owns_servers') setReported(res.servers);
    else setError(res.message);
  };

  const close = () => {
    if (!busy) ui.closeModal();
  };

  return (
    <Modal
      open
      onClose={close}
      size="md"
      title={t('Delete account')}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>
            {t('Cancel')}
          </Button>
          <Button variant="danger" icon={<Trash />} loading={busy} disabled={!canDelete} onClick={() => void submit()}>
            {busy ? t('Deleting …') : t('Delete account permanently')}
          </Button>
        </>
      }
    >
      <div className="delete-account">
        <p className="confirm-body">{t('This deletes your ONYX account for good. It can’t be undone.')}</p>
        <p className="billing-note">{t('Deleting your account also cancels your Plus subscription.')}</p>

        {owned.length > 0 && (
          <div className="delete-account-owned" role="alert">
            <div className="delete-account-owned-head">
              <CircleAlert size={18} />
              <span>{t('You still own these servers. Transfer them to another member or delete them first – otherwise they would disappear for everyone.')}</span>
            </div>
            <ul>
              {owned.map((o) => {
                const server = servers[o.id];
                return (
                  <li key={o.id}>
                    {server && <ServerIcon server={server} size={28} />}
                    <span className="truncate grow">{server?.name ?? o.name}</span>
                    {server && (
                      <Button variant="secondary" size="sm" icon={<Settings />} onClick={() => ui.openSettings({ kind: 'server', serverId: o.id, section: 'danger' })}>
                        {t('Transfer or delete')}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="delete-account-cols">
          <section>
            <h3>{t('What will be deleted')}</h3>
            <ul className="check-list is-removed">
              <li>{t('Your profile: name, avatar, banner, bio, badges and member number')}</li>
              <li>{t('Server memberships, friends, friend requests and blocks')}</li>
              <li>{t('Your reactions, notes, read status and redeemed codes')}</li>
              <li>{t('Your notification settings and push subscriptions on all devices')}</li>
              <li>{t('Your files: avatar, banner, attachments and voice messages')}</li>
              <li>{t('Conversations no one else is part of any more')}</li>
              <li>{t('Your sign-in: email address and password')}</li>
            </ul>
          </section>
          <section>
            <h3>{t('What stays')}</h3>
            <ul className="check-list is-preview">
              <li>{t('Your messages stay visible to others as “Deleted user” – without attachments.')}</li>
              <li>{t('Direct messages and groups stay for the other people. Groups get a new owner.')}</li>
              <li>{t('Your member number is never given out again.')}</li>
              <li>{t('Reports stay with the ONYX team: copies of reported messages and profiles are kept for moderation.')}</li>
            </ul>
          </section>
        </div>
        <p className="field-hint">{t('Want your messages gone as well? Delete them yourself before you delete your account.')}</p>

        <TextField
          label={t('Type your username to confirm')}
          placeholder={me?.username}
          value={typed}
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
          error={error ?? undefined}
          onChange={(e) => {
            setTyped(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
        />
      </div>
    </Modal>
  );
}
