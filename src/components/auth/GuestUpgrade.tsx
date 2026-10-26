import {useEffect,useState,type FormEvent} from 'react';
import {ArrowLeft,Check,Mail,ShieldCheck,UserRound} from 'lucide-react';
import {authErrorText,refreshAccountSession,signIn,useAuth,usernameAvailable} from '../../backend/auth';
import {completeGuestRegistration,confirmGuestEmail,guestError,linkGuestEmail} from '../../backend/guest';
import {cloudHooks} from '../../backend/bridge';
import {t} from '../../i18n';
import {useUI,toast} from '../../store/ui';
import {useMe} from '../../store/selectors';
import {Button} from '../ui/Button';
import {TextField} from '../ui/Field';
import {Modal} from '../ui/Modal';
import {Avatar} from '../ui/Avatar';
import {useCaptcha} from './Captcha';
import {CountryField,PasswordField,useEntryCountry} from './EntryFields';
export function GuestUpgrade({reason='general',mode='register'}:{reason?:'profile'|'general';mode?:'register'|'signin'}){
 const captcha=useCaptcha();
 const me=useMe(),user=useAuth(s=>s.session?.user),close=useUI(s=>s.closeModal);
 const [step,setStep]=useState<'email'|'confirm'|'finish'|'signin'>(mode==='signin'?'signin':user?.email_confirmed_at&&!user.is_anonymous?'finish':user?.new_email?'confirm':'email');
 const [country,setCountry]=useEntryCountry(step==='finish');
 const [email,setEmail]=useState(user?.new_email||user?.email||''),[username,setUsername]=useState(''),[password,setPassword]=useState(''),[code,setCode]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const verified=!!user?.email_confirmed_at&&!user?.is_anonymous;
 useEffect(()=>{if(verified&&step!=='signin')setStep('finish');},[verified,step]);
 const submit=async(event:FormEvent)=>{
  event.preventDefault();if(busy)return;setBusy(true);setError('');
  try{
   if(step==='signin'){const result=await signIn(email,password,await captcha.verify('guest_signin'));if(result)throw result;}
   else if(step==='email'){await linkGuestEmail(email);setStep('confirm');}
   else if(step==='confirm'){await confirmGuestEmail(email,code);await refreshAccountSession();}
   else{
    if(!/^[a-z0-9_.]{2,32}$/.test(username)||!await usernameAvailable(username))throw Error('username unavailable');
    await completeGuestRegistration(username,password,country);await cloudHooks.reloadNow();close();if(reason==='profile')useUI.getState().openSettings({kind:'user',section:'profile'});toast({tone:'success',title:t('Your account is ready'),body:t('Your messages and servers are still here.')});
   }
  }catch(error){setError(guestError(error)||authErrorText(error as Error));}finally{setBusy(false);}
 };
 const checkEmail=async()=>{setBusy(true);setError('');try{await refreshAccountSession();if(!useAuth.getState().session?.user.email_confirmed_at||useAuth.getState().session?.user.is_anonymous)setError(t('Not confirmed yet. Open the link in the email or enter the code.'));}catch(error){setError(authErrorText(error as Error));}finally{setBusy(false);}};
 const title=step==='signin'?t('Welcome back'):step==='confirm'?t('Check your inbox'):step==='finish'?t('Make it your account'):reason==='profile'?t('Make your profile yours.'):t('Make ONYX yours.');
 return <Modal open onClose={()=>{if(!busy)close();}} size="sm" centered className="account-security-modal guest-upgrade" title={title} description={step==='signin'?t('Signing in switches accounts. Your guest messages stay under your guest name.'):t('Create a free account. Keep your messages and servers.')}>
  <form className="security-form" onSubmit={submit}>
   <div className="guest-upgrade-identity"><Avatar user={me} size={52}/><div><strong>{me.displayName}</strong><span>{step==='finish'?user?.email:t('Guest account')}</span></div><ShieldCheck size={23}/></div>
   {step==='email'&&<><p>{reason==='profile'?t('Unlock animated banners, profile effects and frames with a free account.'):t('Keep your profile, add friends and make ONYX your own.')}</p><TextField label={t('Email')} type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" required autoFocus disabled={busy}/></>}
   {step==='confirm'&&<><p>{t('Enter the code from the email sent to {email}, or confirm using the button in that email.',{email})}</p><TextField label={t('Code from the email')} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,10))} inputMode="numeric" autoComplete="one-time-code" autoFocus disabled={busy}/><Button variant="secondary" onClick={()=>void checkEmail()} loading={busy} icon={<Check/>}>{t('I opened the link – continue')}</Button><Button variant="ghost" disabled={busy} onClick={()=>{setStep('email');setCode('');setError('');}}>{t('Use another email')}</Button></>}
   {step==='finish'&&<><TextField label={t('Username')} value={username} onChange={e=>setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g,'').slice(0,32))} autoComplete="username" required autoFocus disabled={busy}/><PasswordField label={t('Password')} value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password" required minLength={8} hint={t('At least {count} characters.',{count:8})} disabled={busy}/><CountryField value={country} onChange={setCountry} disabled={busy}/></>}
   {step==='signin'&&<><TextField label={t('Email')} type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" required autoFocus disabled={busy}/><TextField label={t('Password')} type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required disabled={busy}/></>}
   {step==='signin'&&captcha.control}{error&&<p className="field-error" role="alert">{error}</p>}
   <Button type="submit" block loading={busy} disabled={step==='email'?!email.trim():step==='confirm'?code.length<6:step==='finish'?username.length<2||password.length<8||!country:!email.trim()||!password} icon={step==='email'?<Mail/>:step==='finish'?<UserRound/>:undefined}>{step==='email'?t('Send confirmation'):step==='confirm'?t('Confirm email'):step==='finish'?t('Create free account'):t('Sign in')}</Button>
   {(step==='email'||step==='signin')&&<Button variant="ghost" disabled={busy} onClick={()=>{setError('');setPassword('');setStep(step==='signin'?'email':'signin');}}>{step==='signin'?t('Create free account'):t('Already have an account? Sign in')}</Button>}
   <Button variant="ghost" disabled={busy} icon={<ArrowLeft/>} onClick={close}>{t('Keep chatting as a guest')}</Button>
  </form>
 </Modal>;
}
