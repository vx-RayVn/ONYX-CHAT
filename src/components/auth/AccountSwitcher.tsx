import {useEffect,useState,type FormEvent} from 'react';
import {ArrowLeft,ArrowRightLeft,Check,Plus,Trash2,UserRound} from 'lucide-react';
import {ACCOUNT_LIMIT,forgetAccount,useSavedAccounts} from '../../backend/accounts';
import {accountSwitchError,rememberCurrentAccount,switchAccount,useAuth} from '../../backend/auth';
import {t} from '../../i18n';
import {useUI,toast} from '../../store/ui';
import {Button,IconButton} from '../ui/Button';
import {TextField} from '../ui/Field';
import {Modal} from '../ui/Modal';
import {useCaptcha} from './Captcha';
import {PasswordField} from './EntryFields';

export function AccountSwitcher(){
 const captcha=useCaptcha();
 const close=useUI(s=>s.closeModal),activeId=useAuth(s=>s.session?.user.id);
 const accounts=useSavedAccounts(s=>s.accounts);
 const [adding,setAdding]=useState(false),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{try{rememberCurrentAccount();setError(previous=>previous===t('You can remember up to five accounts on this device.')?'':previous);}catch(error){setError(accountSwitchError(error));}},[accounts.length,activeId]);
 const change=async(input:{id:string}|{email:string;password:string})=>{
  if(busy)return;setBusy(true);setError('');
  try{await switchAccount('email'in input?{...input,captchaToken:await captcha.verify('add_account')}:input);close();}
  catch(error){const text=accountSwitchError(error);setError(text);if(!useUI.getState().modal)toast({tone:'danger',title:text});}
  finally{setPassword('');setBusy(false);}
 };
 const submit=(event:FormEvent)=>{event.preventDefault();void change({email,password});};
 const remove=(id:string)=>{try{forgetAccount(id);}catch(error){setError(accountSwitchError(error));}};
 return <Modal open onClose={()=>{if(!busy)close();}} size="sm" className="account-switcher" title={adding?t('Add an account'):t('Switch accounts')} description={t('Your accounts, remembered on this device.')}>
  <div className="account-switch-heading" aria-hidden="true"><ArrowRightLeft size={24}/><span>{t('One place. All your accounts.')}</span></div>
  {adding?<form className="security-form" onSubmit={submit}>
   <TextField label={t('Email')} type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required autoFocus disabled={busy}/>
   <PasswordField label={t('Password')} autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required disabled={busy}/>
   {captcha.control}
   <p className="account-switch-hint">{t('Your current account stays open if sign-in fails. Two-factor authentication is still required when enabled.')}</p>
   {error&&<p className="field-error" role="alert">{error}</p>}
   <Button type="submit" block loading={busy} disabled={!email.trim()||!password}>{t('Sign in and switch')}</Button>
   <Button variant="ghost" icon={<ArrowLeft/>} disabled={busy} onClick={()=>{setAdding(false);setPassword('');setError('');}}>{t('Back')}</Button>
  </form>:<>
   <ul className="account-switch-list" aria-label={t('Remembered accounts')}>
    {accounts.map(account=><li key={account.id} className={account.id===activeId?'is-current':''}>
     <button className="account-switch-identity" type="button" disabled={busy||account.id===activeId} aria-label={account.id===activeId?t('Current account: {name}',{name:account.name}):t('Switch to {name}',{name:account.name})} onClick={()=>void change({id:account.id})}>
      <span className="account-switch-avatar" aria-hidden="true"><UserRound size={22}/></span><span className="account-switch-label"><strong>{account.name}</strong><small>{account.email}</small></span>
      {account.id===activeId&&<Check size={19} className="account-switch-check" aria-hidden="true"/>}
     </button>
     {account.id!==activeId&&<IconButton label={t('Forget {name} on this device',{name:account.name})} disabled={busy} onClick={()=>remove(account.id)}><Trash2 size={17}/></IconButton>}
    </li>)}
   </ul>
   {error&&<p className="field-error" role="alert">{error}</p>}
   <Button variant="secondary" block icon={<Plus/>} disabled={busy||accounts.length>=ACCOUNT_LIMIT} onClick={()=>{setAdding(true);setError('');}}>{t('Add an account')}</Button>
   <p className="account-switch-hint">{t('Up to five accounts. Only the active account receives live updates here.')}</p>
   {busy&&<p className="sr-only" role="status">{t('Switching accounts…')}</p>}
  </>}
 </Modal>;
}
