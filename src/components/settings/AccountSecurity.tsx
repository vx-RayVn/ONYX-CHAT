import {useCallback,useEffect,useState,type FormEvent} from 'react';
import {Check,Copy,KeyRound,Mail,MonitorOff,Plus,RefreshCw,ShieldCheck,Smartphone,Trash2} from 'lucide-react';
import {supabase} from '../../backend/client';
import {authErrorText,useAuth} from '../../backend/auth';
import {authenticators,beginAuthenticator,clearOtherPushSubscriptions,mfaError,removeAuthenticator,verifyAuthenticator,type Authenticator,type Enrollment} from '../../backend/mfa';
import {CLOUD} from '../../backend/config';
import {copyText,formatShortDate} from '../../lib/utils';
import {t} from '../../i18n';
import {toast} from '../../store/ui';
import {Button,IconButton} from '../ui/Button';
import {TextField} from '../ui/Field';
import {SelectField} from '../ui/SelectField';
import {Modal} from '../ui/Modal';
import {AuthenticatorCode} from '../auth/AuthenticatorCode';
import {SettingsSection} from './SettingsLayout';

type Step='add'|'setup'|'remove'|'email'|'sessions'|null;
export function AccountSecurity(){
 const email=useAuth(state=>state.email),session=useAuth(state=>state.session);
 const [devices,setDevices]=useState<Authenticator[]>([]),[loading,setLoading]=useState(CLOUD),[loadError,setLoadError]=useState('');
 const [step,setStep]=useState<Step>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[name,setName]=useState(''),[nextEmail,setNextEmail]=useState('');
 const [enrollment,setEnrollment]=useState<Enrollment|null>(null),[target,setTarget]=useState(''),[selected,setSelected]=useState(''),[code,setCode]=useState(''),[copied,setCopied]=useState(false);
 const refresh=useCallback(async()=>{if(!CLOUD)return;setLoading(true);setLoadError('');try{setDevices(await authenticators());}catch(error){setLoadError(mfaError(error));}finally{setLoading(false);}},[]);
 useEffect(()=>{void refresh();},[refresh]);
 const open=(next:Step)=>{setError('');setCode('');setCopied(false);setStep(next);};
 const close=()=>{
  if(busy)return;
  if(enrollment){const pending=enrollment;setEnrollment(null);void removeAuthenticator(pending.id).catch(()=>{});}
  setStep(null);setError('');setCode('');
 };
 const add=async()=>{setBusy(true);setError('');try{const pending=await beginAuthenticator(name);setEnrollment(pending);setStep('setup');setCode('');}catch(error){setError(mfaError(error));}finally{setBusy(false);}};
 const confirm=async()=>{
  setBusy(true);setError('');
  try{
   if(step==='setup'&&enrollment){
    await verifyAuthenticator(enrollment.id,code);
    // The secret is discarded immediately; a subsequent cleanup failure must never unenroll a verified factor.
    setEnrollment(null);setCode('');setStep(null);toast({tone:'success',title:t('Authenticator added')});
    try{await clearOtherPushSubscriptions();}catch{toast({tone:'danger',title:t('Other notification subscriptions could not be cleared. Use “Sign out other sessions” to retry.')});}
   }else if(step==='remove'){
    await verifyAuthenticator(selected,code);await removeAuthenticator(target);
    const {error}=await supabase().auth.refreshSession();if(error)throw error;
    setStep(null);setCode('');toast({tone:'success',title:t('Authenticator removed')});
   }
   await refresh();
  }catch(error){setCode('');setError(mfaError(error));}finally{setBusy(false);}
 };
 const changeEmail=async()=>{
  setBusy(true);setError('');try{
   const {error}=await supabase().auth.updateUser({email:nextEmail.trim()},{emailRedirectTo:location.origin+'/app?type=email_change'});if(error)throw error;
   setStep(null);setNextEmail('');toast({tone:'success',title:t('Check your inbox'),body:t('Follow the confirmation steps in your old and new email inboxes. Your address changes after confirmation.')});
  }catch(error){setError(authErrorText(error as Error));}finally{setBusy(false);}
 };
 const endOtherSessions=async()=>{
  setBusy(true);setError('');try{
   await clearOtherPushSubscriptions();
   const {error}=await supabase().auth.signOut({scope:'others'});if(error)throw error;
   setStep(null);toast({tone:'success',title:t('Other sessions signed out')});
  }catch(error){setError(mfaError(error));}finally{setBusy(false);}
 };
 const submit=(event:FormEvent)=>{event.preventDefault();if(busy)return;void(step==='add'?add():step==='email'?changeEmail():step==='sessions'?endOtherSessions():confirm());};
 const canSubmit=step==='add'?!!name.trim():step==='email'?!!nextEmail.trim()&&nextEmail.trim().toLowerCase()!==email?.toLowerCase():step==='sessions'?true:code.length===6&&(step==='setup'||!!selected);
 const title=step==='email'?t('Change email'):step==='sessions'?t('Sign out other sessions'):step==='remove'?t('Remove authenticator'):t('Add authenticator');
 return <>
  <SettingsSection title={t('Two-factor authentication')} description={t('Protect your account with a code from an authenticator app.')}>
   <div className="security-summary"><span className={'security-emblem'+(devices.length?' is-enabled':'')}><ShieldCheck size={25}/></span><div><strong>{loading?t('Checking account security…'):loadError?t('Security status unavailable'):devices.length?t('2FA is enabled'):t('2FA is not enabled')}</strong><p>{devices.length?t('Keep a backup authenticator on another device so you can always sign in.'):t('Your password and an authenticator code keep your account protected.')}</p></div>{!loading&&!loadError&&<span className={'security-state'+(devices.length?' is-enabled':'')}>{devices.length?t('Enabled'):t('Off')}</span>}</div>
   {loadError&&<div className="security-load-error" role="alert"><span>{loadError}</span><Button size="sm" variant="secondary" icon={<RefreshCw/>} onClick={()=>void refresh()}>{t('Try again')}</Button></div>}
   {!!devices.length&&<div className="security-devices">{devices.map(device=><div className="security-device" key={device.id}><span><Smartphone size={20}/></span><div><strong>{device.name}</strong><small>{t('Added {date}',{date:formatShortDate(new Date(device.createdAt).getTime())})}</small></div><IconButton label={t('Remove authenticator')} onClick={()=>{setTarget(device.id);setSelected(device.id);open('remove');}}><Trash2 size={18}/></IconButton></div>)}</div>}
   <Button variant={devices.length?'secondary':'primary'} icon={devices.length?<Plus/>:<ShieldCheck/>} loading={loading} disabled={!CLOUD||!!loadError||devices.length>=10} onClick={()=>{setName(devices.length?t('Backup authenticator'):t('My authenticator'));open('add');}}>{devices.length?t('Add backup authenticator'):t('Enable 2FA')}</Button>
  </SettingsSection>
  <SettingsSection title={t('Account access')}><div className="security-action"><span><Mail size={20}/></span><div><strong>{t('Email address')}</strong><p>{email||t('Not linked yet')}</p></div><Button variant="secondary" size="sm" disabled={!CLOUD||!session} onClick={()=>{setNextEmail('');open('email');}}>{t('Change email')}</Button></div><div className="security-action"><span><MonitorOff size={20}/></span><div><strong>{t('Other sessions')}</strong><p>{t('Sign out your other browsers and devices while staying signed in here.')}</p></div><Button variant="secondary" size="sm" disabled={!CLOUD||!session} onClick={()=>open('sessions')}>{t('Sign out other sessions')}</Button></div></SettingsSection>
  <Modal open={step!==null} onClose={close} centered size="sm" className="account-security-modal" title={title} description={step==='setup'?t('Scan this QR code with your authenticator app, then enter its six-digit code.'):undefined}>
   <form className="security-form" onSubmit={submit}>
    {step==='add'&&<><div className="security-dialog-icon"><Smartphone size={28}/></div><p>{t('Use an authenticator app that generates verification codes. You only need to set it up once.')}</p><TextField label={t('Authenticator name')} value={name} maxLength={40} autoFocus onChange={event=>setName(event.target.value)}/><p className="security-help">{t('Keep a backup authenticator on another device so you can always sign in.')}</p></>}
    {step==='setup'&&enrollment&&<><div className="security-qr"><img src={enrollment.qr} alt={t('Authenticator setup QR code')} width={208} height={208}/></div><details className="security-manual"><summary>{t('Can’t scan the QR code?')}</summary><p>{t('Enter this setup key in your authenticator app.')}</p><div className="security-key"><code dir="ltr">{enrollment.secret}</code><IconButton label={t('Copy setup key')} onClick={()=>void copyText(enrollment.secret).then(()=>setCopied(true)).catch(()=>setError(t('Copy failed')))}>{copied?<Check size={18}/>:<Copy size={18}/>}</IconButton></div></details><AuthenticatorCode value={code} onChange={setCode} disabled={busy}/><p className="security-help">{t('2FA turns on only after your code is verified. Keep your authenticator and setup key private.')}</p></>}
    {step==='remove'&&<><p>{devices.length===1?t('Removing your last authenticator turns off 2FA. Enter a current code to confirm.'):t('Confirm with an authenticator code before removing this device. You can use your backup authenticator.')}</p>{devices.length>1&&<SelectField label={t('Authenticator')} value={selected} onChange={id=>{setSelected(id);setCode('');}} options={devices.map(device=>({value:device.id,label:device.name}))} disabled={busy}/>}<AuthenticatorCode value={code} onChange={setCode} disabled={busy}/></>}
    {step==='email'&&<><p>{t('Follow the confirmation steps in your old and new email inboxes. Your address changes after confirmation.')}</p><TextField label={t('New email address')} type="email" autoComplete="email" value={nextEmail} required autoFocus maxLength={254} onChange={event=>setNextEmail(event.target.value)}/></>}
    {step==='sessions'&&<><div className="security-dialog-icon"><MonitorOff size={28}/></div><p>{t('Sign out your other browsers and devices while staying signed in here.')}</p><p className="security-help">{t('Push notifications on those devices will also be disabled. Connected activity companions are managed separately in Connections.')}</p></>}
    {error&&<p className="field-error" role="alert">{error}</p>}
    <div className="security-dialog-actions"><Button variant="ghost" disabled={busy} onClick={close}>{t('Cancel')}</Button><Button type="submit" variant={step==='remove'?'danger':'primary'} loading={busy} disabled={!canSubmit} icon={step==='setup'?<KeyRound/>:undefined}>{step==='setup'?t('Verify and enable'):step==='remove'?t('Remove authenticator'):step==='email'?t('Send confirmation'):step==='sessions'?t('Sign out other sessions'):t('Continue')}</Button></div>
   </form>
  </Modal>
 </>;
}
