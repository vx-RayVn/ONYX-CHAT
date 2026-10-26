import {supabase} from './client';
import {t} from '../i18n';
import {currentPushSubscription,pushSupported,refreshPush} from './push';
export interface Authenticator {id:string;name:string;createdAt:string}
export interface Enrollment {id:string;name:string;qr:string;secret:string;uri:string}
export function mfaError(error:unknown){
 const value=error as {code?:string;message?:string};
 if(['mfa_verification_failed','mfa_challenge_expired','mfa_verification_rejected'].includes(value?.code??''))return t('That code is incorrect or expired. Try a new code from your authenticator.');
 if(value?.code==='mfa_factor_name_conflict')return t('An authenticator already uses this name. Choose another name.');
 if(value?.code==='too_many_enrolled_mfa_factors')return t('The authenticator limit has been reached. Remove an unused authenticator first.');
 if(value?.code==='insufficient_aal'||/mfa_required/i.test(value?.message??''))return t('Confirm your authenticator code to continue.');
 if(/rate.limit|too many/i.test(value?.code??value?.message??''))return t('Too many attempts. Wait a moment before trying again.');
 if(/failed to fetch|network|load failed/i.test(value?.message??''))return t('No connection to the server. Check your internet connection.');
 return t('Account security could not be updated. Try again.');
}
export async function authenticators():Promise<Authenticator[]>{
 const {data,error}=await supabase().auth.mfa.listFactors();if(error)throw error;
 return data.totp.filter(factor=>factor.status==='verified').map(factor=>({id:factor.id,name:factor.friendly_name||t('Authenticator'),createdAt:factor.created_at}));
}
export async function beginAuthenticator(name:string):Promise<Enrollment>{
 const {data,error}=await supabase().auth.mfa.enroll({factorType:'totp',issuer:'ONYX',friendlyName:name.trim()||t('Authenticator')});if(error)throw error;
 const svg=data.totp.qr_code.replace(/^data:image\/svg\+xml;utf-8,/, '');
 return {id:data.id,name:data.friendly_name||name,qr:'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg),secret:data.totp.secret,uri:data.totp.uri};
}
export async function verifyAuthenticator(id:string,code:string){
 const clean=code.replace(/[\s-]/g,'');if(!/^\d{6}$/.test(clean))throw {code:'mfa_verification_failed'};
 const {error}=await supabase().auth.mfa.challengeAndVerify({factorId:id,code:clean});if(error)throw error;
}
export async function removeAuthenticator(id:string){const {error}=await supabase().auth.mfa.unenroll({factorId:id});if(error)throw error;}
/** Revoked sessions must not continue receiving private message push previews. */
export async function clearOtherPushSubscriptions(){
 const sb=supabase(),{data,error}=await sb.auth.getUser();if(error||!data.user)throw error??Error('session_expired');
 // A stalled service-worker registration must not block account security actions.
 let timeout:ReturnType<typeof setTimeout>|undefined;
 const current=pushSupported()&&Notification.permission==='granted'?await Promise.race([currentPushSubscription().catch(()=>null),new Promise<null>(resolve=>{timeout=setTimeout(()=>resolve(null),2000);})]).finally(()=>clearTimeout(timeout)):null;
 let request=sb.from('push_subscriptions').delete().eq('user_id',data.user.id);
 if(current)request=request.neq('endpoint',current.endpoint);
 const result=await request;if(result.error)throw result.error;refreshPush();
}
