import {supabase} from './client';
import {getLanguage,t} from '../i18n';
import {birthDateIssue} from '../lib/signupPolicy';
import {requireCaptcha} from '../components/auth/Captcha';
export function guestError(error:unknown){const e=error as {code?:string;message?:string};if(e?.code==='anonymous_provider_disabled')return t('Guest access is not available yet. Create an account or try again later.');if(/username unavailable|reserved username/i.test(e?.message??''))return t('That username is unavailable. Choose another one.');if(/guest_email_verification_required/i.test(e?.message??''))return t('Confirm your email before finishing registration.');return '';}
export async function startGuest(name:string,birthDate:string,captchaToken?:string){
 const clean=name.trim();if(!clean||Array.from(clean).length>32)throw Error(t('Choose a name with 1–32 characters.'));
 const issue=birthDateIssue(birthDate);if(issue)throw Error(issue);
 const {error}=await supabase().auth.signInAnonymously({options:{captchaToken:requireCaptcha(captchaToken),data:{display_name:clean,date_of_birth:birthDate,locale:getLanguage()}}});if(error)throw error;
}
export async function linkGuestEmail(email:string){const {error}=await supabase().auth.updateUser({email:email.trim(),data:{locale:getLanguage()}},{emailRedirectTo:location.origin+'/app?type=email_change&guest=1'});if(error)throw error;}
export async function confirmGuestEmail(email:string,code:string){const {error}=await supabase().auth.verifyOtp({email:email.trim(),token:code.replace(/\s/g,''),type:'email_change'});if(error)throw error;}
export async function completeGuestRegistration(username:string,password:string,country:string){
 if(!/^[A-Z]{2}$/.test(country))throw Error('country_required');
 const sb=supabase(),{data,error}=await sb.auth.getUser();if(error)throw error;
 if(data.user?.is_anonymous||!data.user?.email_confirmed_at)throw Error('guest_email_verification_required');
 const updated=await sb.auth.updateUser({password});if(updated.error&&updated.error.code!=='same_password')throw updated.error;
 const finished=await sb.rpc('complete_guest_registration',{p_username:username.trim().toLowerCase(),p_country:country});if(finished.error)throw finished.error;
 const refreshed=await sb.auth.refreshSession();if(refreshed.error)throw refreshed.error;
 return refreshed.data.session;
}
