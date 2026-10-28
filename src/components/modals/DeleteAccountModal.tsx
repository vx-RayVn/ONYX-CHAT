import { useEffect, useRef, useState } from 'react';
import { CircleAlert, Settings, Trash } from 'lucide-react';
import { useStore } from '../../store/store';
import { useUI } from '../../store/ui';
import { useMe } from '../../store/selectors';
import { authErrorText, deleteAccount, useAuth } from '../../backend/auth';
import { accountAuthClient } from '../../backend/client';
import { DeletionReauth, type DeletionStep } from '../../lib/deletionReauth';
import { mfaError } from '../../backend/mfa';
import { t } from '../../i18n';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { TextField } from '../ui/Field';
import { ServerIcon } from '../layout/ServerRail';
import { PasswordField } from '../auth/EntryFields';
import { AuthenticatorCode } from '../auth/AuthenticatorCode';
import { useCaptcha, captchaError } from '../auth/Captcha';
import { SelectField } from '../ui/SelectField';

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
  const session=useAuth(s=>s.session),guest=!!me?.guest,captcha=useCaptcha();
  const flow=useRef<DeletionReauth|null>(null);
  const [step,setStep]=useState<DeletionStep|'loading'>('loading');
  const [password,setPassword]=useState(''),[emailCode,setEmailCode]=useState(''),[code,setCode]=useState(''),[factor,setFactor]=useState('');
  const restart=()=>{
    void flow.current?.dispose();flow.current=null;
    setPassword('');setEmailCode('');setCode('');setFactor('');
    const active=useAuth.getState().session;
    if(!guest&&active){const fresh=new DeletionReauth(accountAuthClient(),active,()=>useAuth.getState().session?.user.id??null);flow.current=fresh;setStep(fresh.step);}
    else setStep('ready');
  };
  useEffect(()=>{restart();return()=>{void flow.current?.dispose();flow.current=null;};},[session?.user.id,guest]);
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
  const canDelete = matches && owned.length === 0 && !busy && (guest||step==='ready');

  const verify=async()=>{
    const current=flow.current;if(!current||busy)return;
    setBusy(true);setError(null);
    try{
      if(step==='password'){const value=password;setPassword('');await current.password(value,await captcha.verify('delete_account'));}
      else if(step==='email')await current.sendEmail(await captcha.verify('delete_account'));
      else if(step==='email-code'){const value=emailCode;setEmailCode('');await current.emailCode(value);}
      else if(step==='mfa'){const value=code;setCode('');await current.mfa(factor||current.factors[0]?.id,value);}
      if(flow.current!==current)return;
      setStep(current.step);setFactor(current.factors[0]?.id??'');
    }catch(error){
      if(flow.current!==current)return;
      const message=(error as Error)?.message;
      setError(message==='account_changed'?t('The active account changed in another tab. Please try again.'):message==='no_authenticator'?t('No supported authenticator is available. Sign in with another account or contact the ONYX team.'):captchaError(error)||(step==='mfa'?mfaError(error):authErrorText(error as Error)));
    }finally{setBusy(false);}
  };

  const submit = async () => {
    if (!canDelete) return;
    setBusy(true);
    setError(null);
    let res;
    try{res=await deleteAccount(typed.trim(),guest?undefined:flow.current?.getProof());}
    catch{restart();setError(t('Confirm your sign-in again before deleting your account.'));setBusy(false);return;}
    if (res.ok) {
      ui.closeModal();
      ui.closeSettings();
      return;
    }
    setBusy(false);
    if (res.reason === 'owns_servers') setReported(res.servers);
    else if(res.reason==='reauthentication'){restart();setError(res.message);}
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

        {guest?<p className="field-hint">{t('Guest profiles have no password. Confirm your username to delete this guest profile.')}</p>:<section className="delete-account-reauth" onKeyDown={event=>{if(event.key==='Enter'&&step!=='ready'){event.preventDefault();void verify();}}}>
          <h3>{t('Confirm your sign-in')}</h3>
          {step==='password'&&<><p className="field-hint">{t('Enter your password again to confirm it is you.')}</p><PasswordField label={t('Password')} value={password} onChange={event=>setPassword(event.target.value)} autoComplete="current-password" disabled={busy}/></>}
          {step==='email'&&<p className="field-hint">{t('We will email a code to your account address. Enter it here to confirm it is you.')}</p>}
          {step==='email-code'&&<><p className="field-hint">{t('Enter the sign-in code from your email here. Keep this dialog open.')}</p><TextField label={t('Email code')} value={emailCode} onChange={event=>setEmailCode(event.target.value.replace(/\D/g,'').slice(0,8))} inputMode="numeric" autoComplete="one-time-code" maxLength={8} disabled={busy}/></>}
          {step==='mfa'&&<><p className="field-hint">{t('Confirm a new authenticator code before deleting your account.')}</p>{flow.current&&flow.current.factors.length>1&&<SelectField label={t('Authenticator')} value={factor} onChange={setFactor} disabled={busy} options={flow.current.factors.map(item=>({value:item.id,label:item.name||t('Authenticator')}))}/>}<AuthenticatorCode value={code} onChange={setCode} disabled={busy}/></>}
          {step==='ready'?<p className="field-hint" role="status">{t('Sign-in confirmed. Now confirm your username below.')}</p>:<Button variant="secondary" onClick={()=>void verify()} loading={busy} disabled={step==='loading'||busy||step==='password'&&!password||step==='email-code'&&!/^\d{6,8}$/.test(emailCode)||step==='mfa'&&code.length!==6}>{step==='email'?t('Send confirmation code'):t('Confirm sign-in')}</Button>}
          {captcha.control}
        </section>}
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
