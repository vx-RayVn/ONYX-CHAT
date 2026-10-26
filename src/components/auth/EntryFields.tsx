import {useEffect,useId,useRef,useState} from 'react';
import {Eye,EyeOff} from 'lucide-react';
import {t,getLanguage} from '../../i18n';
import {SelectField} from '../ui/SelectField';
import {TextField,type TextFieldProps} from '../ui/Field';
import {countryOptions,canonicalCountryCode} from '../../lib/countries';
import {birthDateIssue} from '../../lib/signupPolicy';

export function policyError(code:string){
 if(code==='minimum_age')return t('ONYX is for ages 16 and up.');
 if(code==='date_required')return t('Enter your date of birth.');
 if(code==='date_invalid')return t('Choose a valid date of birth.');
 if(code==='country_required')return t('Choose your country.');
 return '';
}
export function BirthDateField({value,onChange,disabled,error}:{value:string;onChange:(value:string)=>void;disabled?:boolean;error?:string}){
 const noteId=useId();
 const parts=value.split('-'),[year,setYear]=useState(parts[0]||''),[month,setMonth]=useState(parts[1]||''),[day,setDay]=useState(parts[2]||'');
 const change=(part:'year'|'month'|'day',next:string)=>{const values={year,month,day,[part]:next};if(part==='year')setYear(next);if(part==='month')setMonth(next);if(part==='day')setDay(next);onChange(values.year&&values.month&&values.day?`${values.year}-${values.month}-${values.day}`:'');};
 const issue=value?birthDateIssue(value):null;
 const months=new Intl.DateTimeFormat(getLanguage(),{month:'long',timeZone:'UTC'});
 return <fieldset className="auth-birthday" disabled={disabled} aria-invalid={error?true:undefined} aria-describedby={noteId}><legend>{t('Date of birth')}</legend><div className="birth-fields">
  <SelectField label={t('Day')} placeholder={t('Day')} value={day} onChange={v=>change('day',v)} disabled={disabled} required options={Array.from({length:31},(_,i)=>({value:String(i+1).padStart(2,'0'),label:String(i+1)}))}/>
  <SelectField label={t('Month')} placeholder={t('Month')} value={month} onChange={v=>change('month',v)} disabled={disabled} required options={Array.from({length:12},(_,i)=>({value:String(i+1).padStart(2,'0'),label:months.format(new Date(Date.UTC(2000,i,1)))}))}/>
  <SelectField label={t('Year')} placeholder={t('Year')} value={year} onChange={v=>change('year',v)} disabled={disabled} required options={Array.from({length:new Date().getUTCFullYear()-1899},(_,i)=>({value:String(new Date().getUTCFullYear()-i),label:String(new Date().getUTCFullYear()-i)}))}/>
 </div><p key={error?'error':'hint'} id={noteId} className={`auth-age-note${error?' is-error':''}`} role={error?'alert':'status'}>{error||(issue?policyError(issue):t('ONYX is for ages 16 and up.'))}</p></fieldset>;
}
export function useEntryCountry(enabled=true){
 const initial=canonicalCountryCode((navigator.language||'').split('-')[1]||''),[country,setCountry]=useState(initial),edited=useRef(false);
 useEffect(()=>{
  if(!enabled)return;
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),3500);
  // Cloudflare returns a coarse IP country. Discard the rest of the diagnostic response (including IP).
  void fetch('https://www.cloudflare.com/cdn-cgi/trace',{signal:controller.signal,credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'})
   .then(r=>{if(!r.ok)throw Error();return r.text();}).then(text=>{const code=canonicalCountryCode(text.match(/^loc=([A-Z]{2})\s*$/m)?.[1]||'');if(!edited.current&&countryOptions('en').some(c=>c.code===code))setCountry(code);}).catch(()=>{}).finally(()=>clearTimeout(timeout));
  return()=>{controller.abort();clearTimeout(timeout);};
 },[enabled]);
 return [country,(value:string)=>{edited.current=true;setCountry(value);}] as const;
}
export function CountryField({value,onChange,disabled}:{value:string;onChange:(value:string)=>void;disabled?:boolean}){
 return <SelectField label={t('Country')} placeholder={t('Choose your country.')} value={value} onChange={onChange} disabled={disabled} required options={countryOptions(getLanguage()).map(c=>({value:c.code,label:c.name}))}/>;
}
export function PasswordField(props:Omit<TextFieldProps,'type'|'suffix'>){
 const [visible,setVisible]=useState(false);
 return <TextField {...props} type={visible?'text':'password'} suffix={<button className="auth-password-toggle" type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>setVisible(v=>!v)} aria-label={visible?t('Hide password'):t('Show password')} aria-pressed={visible}>{visible?<EyeOff size={18}/>:<Eye size={18}/>}</button>}/>;
}
