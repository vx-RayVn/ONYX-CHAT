import {useState,type FormEvent} from 'react';
import {ArrowLeft} from 'lucide-react';
import {startGuest,guestError} from '../../backend/guest';
import {authErrorText} from '../../backend/auth';
import {Button} from '../ui/Button';
import {TextField} from '../ui/Field';
import {t} from '../../i18n';
import {BirthDateField,policyError} from './EntryFields';
import {birthDateIssue} from '../../lib/signupPolicy';
import {useCaptcha} from './Captcha';
export function GuestEntry({onBack}:{onBack:()=>void}){
 const [name,setName]=useState(''),[birthDate,setBirthDate]=useState(''),[birthError,setBirthError]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),captcha=useCaptcha();
 const submit=async(event:FormEvent)=>{event.preventDefault();if(busy||!name.trim())return;const issue=birthDateIssue(birthDate);setBirthError(issue?policyError(issue):'');if(issue){setError('');return;}setBusy(true);setError('');try{await startGuest(name,birthDate,await captcha.verify('guest'));}catch(error){setError(guestError(error)||authErrorText(error as Error));}finally{setBusy(false);}};
 return <form className="auth-form guest-entry" onSubmit={submit} noValidate><h1 className="auth-title">{t('Jump in as a guest')}</h1><TextField label={t('Display name')} value={name} onChange={e=>setName(e.target.value)} maxLength={32} autoComplete="nickname" required autoFocus disabled={busy}/><BirthDateField value={birthDate} onChange={value=>{setBirthDate(value);setBirthError('');setError('');}} disabled={busy} error={birthError}/>{captcha.control}{error&&<p role="alert" className="field-error">{error}</p>}<Button type="submit" size="lg" block loading={busy} disabled={!name.trim()}>{t('Continue as guest')}</Button><p className="guest-help">{t('Guest access stays in this browser. Create a free account later to keep access across devices.')}</p><Button block variant="ghost" disabled={busy} icon={<ArrowLeft/>} onClick={onBack}>{t('Back to sign-in')}</Button></form>;
}
