import type {Session,SupabaseClient} from '@supabase/supabase-js';
export type DeletionProof={accessToken:string;userId:string};
export type DeletionStep='password'|'email'|'email-code'|'mfa'|'ready';
export function deletionSignInMethod(token:string):'password'|'email'{
 try{const amr=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).amr;
  const primary=Array.isArray(amr)?amr.filter(e=>['password','otp','magiclink'].includes(e?.method)&&typeof e.timestamp==='number').sort((a,b)=>b.timestamp-a.timestamp)[0]:null;
  return primary?.method==='password'?'password':'email';
 }catch{return 'email';}
}
/** A separate, memory-only Auth client: never replace the open account's session.
 * Decoded login method is only a UI hint; the Edge Function authorizes fresh AMR.
 */
export class DeletionReauth{
 step:DeletionStep;factors:{id:string;name:string}[]=[];
 private proof:DeletionProof|null=null;private completedAt=0;private disposed=false;
 private client:SupabaseClient;private original:Session;private currentUser:()=>string|null;
 constructor(client:SupabaseClient,original:Session,currentUser:()=>string|null){this.client=client;this.original=original;this.currentUser=currentUser;this.step=deletionSignInMethod(original.access_token);}
 private check(){if(this.disposed||this.currentUser()!==this.original.user.id)throw Error('account_changed');}
 private async accept(){
  this.check();const {data,error}=await this.client.auth.getUser();this.check();
  if(error||data.user?.id!==this.original.user.id)throw Error('account_changed');
  const factors=await this.client.auth.mfa.listFactors();this.check();if(factors.error)throw factors.error;
  const verified=factors.data.all.filter(f=>f.status==='verified');
  this.factors=verified.filter(f=>f.factor_type==='totp').map(f=>({id:f.id,name:f.friendly_name||''}));
  if(verified.length){if(!this.factors.length)throw Error('no_authenticator');this.step='mfa';return;}
  await this.complete();
 }
 private async complete(){
  this.check();const {data,error}=await this.client.auth.getSession();this.check();
  if(error||!data.session||data.session.user.id!==this.original.user.id)throw Error('account_changed');
  this.proof={accessToken:data.session.access_token,userId:this.original.user.id};this.completedAt=Date.now();this.step='ready';
 }
 async password(password:string,captchaToken:string){
  this.check();if(this.step!=='password'||!password||!this.original.user.email)throw Error('reauthentication_required');
  const {error}=await this.client.auth.signInWithPassword({email:this.original.user.email,password,options:{captchaToken}});
  this.check();if(error)throw error;await this.accept();
 }
 async sendEmail(captchaToken:string){
  this.check();if(!['email','email-code'].includes(this.step)||!this.original.user.email)throw Error('reauthentication_required');
  const {error}=await this.client.auth.signInWithOtp({email:this.original.user.email,options:{shouldCreateUser:false,captchaToken}});
  this.check();if(error)throw error;this.step='email-code';
 }
 async emailCode(code:string){
  this.check();if(this.step!=='email-code'||!/^\d{6,8}$/.test(code)||!this.original.user.email)throw Error('reauthentication_required');
  const {error}=await this.client.auth.verifyOtp({email:this.original.user.email,token:code,type:'email'});
  this.check();if(error)throw error;await this.accept();
 }
 async mfa(factorId:string,code:string){
  this.check();if(this.step!=='mfa'||!this.factors.some(f=>f.id===factorId)||!/^\d{6}$/.test(code))throw Error('reauthentication_required');
  const {error}=await this.client.auth.mfa.challengeAndVerify({factorId,code});this.check();if(error)throw error;await this.complete();
 }
 getProof(){this.check();if(!this.proof||this.step!=='ready'||Date.now()-this.completedAt>540000)throw Error('reauthentication_required');return {...this.proof};}
 async dispose(){if(this.disposed)return;this.disposed=true;this.proof=null;try{await this.client.auth.signOut({scope:'local'});}catch{/* Temporary session expires naturally if offline. */}finally{await this.client.auth.dispose();}}
}
