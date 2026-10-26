/**
 * Sign-in state for cloud mode (Supabase Auth). Passwords go straight from the
 * form to Supabase; ONYX never stores them.
 */
import { create } from 'zustand';
import { FunctionsHttpError, type AuthError, type Session } from '@supabase/supabase-js';
import { getLanguage, t } from '../i18n';
import { CLOUD } from './config';
import { supabase, accountAuthClient } from './client';
import {saveAccount,updateSavedAccount,savedSession,forgetAccount,ACCOUNT_LIMIT,useSavedAccounts} from './accounts';
import {store} from './bridge';
import {leave as leaveVoice} from '../voice/engine';
import { clearCloudData, startCloud, stopCloud } from './sync';
import { describeError, flushDebounced, resetQueue, setSuspendedHandler, setVerificationHandler, whenIdle } from './queue';
import { fetchAccountStatus, unwatchAccount, useAccount, watchAccount, type Suspension } from './moderation';
import { disablePush } from './push';
import { toast, useUI } from '../store/ui';
import {verifyAuthenticator,type Authenticator} from './mfa';
import {guestActor} from '../store/ui';
import {requireCaptcha,captchaError} from '../components/auth/Captcha';
import {birthDateIssue} from '../lib/signupPolicy';

export type AuthStatus = 'starting' | 'signedOut' | 'loading' | 'ready' | 'recovery' | 'mfa' | 'error' | 'suspended';

export interface AuthNotice {
  tone: 'info' | 'success' | 'danger';
  text: string;
}

interface AuthState {
  status: AuthStatus;
  session: Session | null;
  email: string | null;
  error: string | null;
  /** Shown on the sign-in screen, e.g. "this link has expired". */
  notice: AuthNotice | null;
  /** Set while the suspension screen is shown (ONYX-wide suspension by a platform admin). */
  suspension: Suspension | null;
  authenticators: Authenticator[];
}

export const useAuth = create<AuthState>(() => ({ status: CLOUD ? 'starting' : 'ready', session: null, email: null, error: null, notice: null, suspension: null,authenticators:[] }));

let loadedFor: string | null = null;
let started = false;
let securityRevision=0,cloudEpoch=0,recoveryRequested=false;

/**
 * What an email link put into the address (read before Supabase tidies the
 * URL): an error ("link expired"), the kind of link, or a token_hash from our
 * own email templates, which works in any browser.
 */
const linkParams = (() => {
  if (typeof location === 'undefined') return null;
  const p = new URLSearchParams(location.hash.replace(/^#/, ''));
  new URLSearchParams(location.search).forEach((v, k) => p.has(k) || p.set(k, v));
  const out = { type: p.get('type'), errorCode: p.get('error_code'), error: p.get('error_description'), tokenHash: p.get('token_hash') };
  return out.type || out.errorCode || out.error || out.tokenHash ? out : null;
})();

function cleanUrl() {
  history.replaceState(null, '', location.pathname);
}

/** Toast after the account data has loaded (e.g. "email confirmed"). */
let welcome: string | null = null;

async function load(session: Session) {
  let userId = session.user.id;
  // Includes account changes received from another browser tab. Hide and clear the old identity first.
  if(loadedFor&&loadedFor!==userId){lockAccount();location.reload();return;}
  const revision=++securityRevision;
  if(loadedFor!==userId&&!['mfa','recovery'].includes(useAuth.getState().status))useAuth.setState({status:'starting',session,email:session.user.email??null,error:null});
  try{
    // Fetch factors from Auth, not stale local session metadata. No account data before this check.
    const {data,error}=await supabase().auth.getUser(session.access_token);
    if(revision!==securityRevision)return;
    if(error||!data.user)throw error??Error('session_expired');
    const user=data.user;
    userId=user.id;
    const factors=(user.factors??[]).filter(factor=>factor.status==='verified');
    const devices=factors.filter(factor=>factor.factor_type==='totp').map(factor=>({id:factor.id,name:factor.friendly_name||t('Authenticator'),createdAt:factor.created_at}));
    const {data:assurance,error:aalError}=await supabase().auth.mfa.getAuthenticatorAssuranceLevel();
    if(revision!==securityRevision)return;
    if(aalError)throw aalError;
    session={...session,user};
    updateSavedAccount(session);
    useAuth.setState({session,email:user.email??null,authenticators:devices});
    if(factors.length&&assurance.currentLevel!=='aal2'){
      lockAccount();useAuth.setState({status:'mfa',session,email:user.email??null,authenticators:devices,error:null});return;
    }
    if(recoveryRequested){lockAccount();useAuth.setState({status:'recovery',session,email:user.email??null,error:null});return;}
    const {status}=useAuth.getState();
    if(loadedFor===userId&&(status==='ready'||status==='loading'))return;
  }catch(error){
    if(revision!==securityRevision)return;
    lockAccount();useAuth.setState({status:'error',session,error:authErrorText(error as Error)});return;
  }
  loadedFor = userId;
  const epoch=++cloudEpoch;
  useAuth.setState({ status: 'loading', session, email: session.user.email ?? null, error: null });
  try {
    const [, account] = await Promise.all([startCloud(userId), fetchAccountStatus()]);
    if(epoch!==cloudEpoch||loadedFor!==userId)return;
    // A token that is still valid after a suspension: show the suspension screen instead of the app.
    if (account.suspension) return suspend(account.suspension);
    if (loadedFor === userId&&epoch===cloudEpoch) {
      useAccount.setState({ admin: account.admin });
      watchAccount(userId, suspend);
      pending = null;
      useAuth.setState({ status: 'ready', notice: null });
      if (welcome) toast({ tone: 'success', title: welcome });
      welcome = null;
    }
  } catch (e) {
    if(epoch!==cloudEpoch)return;
    loadedFor = null;
    const message = (e as Error)?.message === 'profile-missing' ? t('Your profile could not be found. Did the database setup (migrations) run?') : describeError(e);
    useAuth.setState({ status: 'error', error: message });
  }
}

/** Close private UI and cancel queued work whenever the assurance boundary changes. */
function lockAccount(){
  if(!['mfa','recovery'].includes(useAuth.getState().status))useAuth.setState({status:'starting'});
  loadedFor=null;cloudEpoch++;unwatchAccount();useAccount.setState({admin:false});
  useUI.getState().closeSettings();useUI.getState().closeModal();stopCloud();clearCloudData();
  useUI.setState({replyTo:null,editing:null,highlight:null,search:null,pending:{},insertRequest:null,toasts:[],mobileMembers:false,mobilePanel:'main'});
}

export async function completeMfaSignIn(factorId:string,code:string){
  await verifyAuthenticator(factorId,code);
  const {data,error}=await supabase().auth.getSession();if(error||!data.session)throw error??Error('session_expired');
  await load(data.session);
}
export async function refreshAccountSession(){const {data,error}=await supabase().auth.refreshSession();if(error)throw error;if(data.session)await load(data.session);}

/**
 * The account was suspended ONYX-wide (live signal, check after loading, or
 * the database refused a change): leave the app, show the suspension screen.
 * The server has already ended every session, so only this tab signs out.
 */
function suspend(s: Suspension) {
  if (useAuth.getState().status === 'suspended') return;
  loadedFor = null;
  securityRevision++;cloudEpoch++;recoveryRequested=false;
  pending = null;
  unwatchAccount();
  useAccount.setState({ admin: false });
  useAuth.setState({ status: 'suspended', suspension: s, session: null, email: null, error: null });
  useUI.getState().closeSettings();
  useUI.getState().closeModal();
  stopCloud();
  clearCloudData();
  void supabase().auth.signOut({ scope: 'local' });
}

let lastSuspensionCheck = 0;
let authEventRevision=0;

/** A change was refused with "account suspended": confirm with the server, then show the screen. */
async function checkSuspension() {
  if (Date.now() - lastSuspensionCheck < 5000) return;
  lastSuspensionCheck = Date.now();
  const { suspension } = await fetchAccountStatus();
  if (suspension) suspend(suspension);
}

/** "Back to sign-in" on the suspension screen. */
export function leaveSuspension() {
  useAuth.setState({ status: 'signedOut', suspension: null });
}

/** Starts listening for sign-in changes (once, at app start). */
export function initAuth() {
  if (!CLOUD || started) return;
  started = true;
  const sb = supabase();
  if(linkParams?.type==='recovery')recoveryRequested=true;
  setVerificationHandler(reason=>{if(reason==='session_expired'){securityRevision++;lockAccount();useAuth.setState({status:'signedOut',session:null,email:null,authenticators:[],notice:{tone:'info',text:t('Your session has expired. Sign in again.')}});void sb.auth.signOut({scope:'local'});}else{const current=useAuth.getState().session;if(current)void load(current);}});
  setSuspendedHandler(() => void checkSuspension());
  if (linkParams) handleEmailLink(linkParams);
  sb.auth.onAuthStateChange((event, session) => {
    const eventRevision=++authEventRevision;
    // Supabase recommends not awaiting other calls inside this callback.
    setTimeout(async () => {
      if(accountTransition||eventRevision!==authEventRevision)return;
      // Focus, token refresh and another tab may have superseded this event.
      // Read the SDK's current stored session rather than loading a stale callback payload.
      const {data}=await sb.auth.getSession();
      if(accountTransition||eventRevision!==authEventRevision)return;
      session=data.session;
      if (event === 'PASSWORD_RECOVERY') {
        recoveryRequested=true;
      }
      if (session) {
        void load(session);
      } else {
        // The suspension screen stays until the user goes back to sign-in.
        if (useAuth.getState().status === 'suspended') return;
        const oldId=useAuth.getState().session?.user.id;
        if(oldId)try{forgetAccount(oldId);}catch{/* Signing out still clears the active SDK session. */}
        loadedFor = null;
        securityRevision++;cloudEpoch++;recoveryRequested=false;
        unwatchAccount();
        useAccount.setState({ admin: false });
        // Show the sign-in screen first, then clear the data the app shell was using.
        useAuth.setState({ status: 'signedOut', session: null, email: null, error: null,authenticators:[] });
        stopCloud();
        clearCloudData();
      }
    }, 0);
  });
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flushDebounced);
    // Confirmed on another device (e.g. the phone)? Continue here as soon as the user comes back.
    const refresh=()=>{if(document.hidden)return;void retryPending();const current=useAuth.getState();if(current.session&&['ready','mfa'].includes(current.status))void load(current.session);};
    window.addEventListener('focus',refresh);
    document.addEventListener('visibilitychange',refresh);
  }
}

/** Email links: show what happened instead of silently landing on the sign-in screen. */
function handleEmailLink(p: NonNullable<typeof linkParams>) {
  if (p.errorCode || p.error) {
    const expired = p.errorCode === 'otp_expired' || /expired|invalid/i.test(p.error ?? '');
    useAuth.setState({
      notice: {
        tone: 'danger',
        text: expired ? t('This link has expired or was already used. If you opened it before, your email is already confirmed – just sign in.') : (p.error ?? t('Unknown error')),
      },
    });
    cleanUrl();
    return;
  }
  if (p.tokenHash) {
    // Link from our own email templates: verify here, works in any browser.
    const type = p.type === 'recovery' ? 'recovery' : p.type==='email_change'?'email_change':'email';
    if(type==='recovery')recoveryRequested=true;
    void supabase()
      .auth.verifyOtp({ token_hash: p.tokenHash, type })
      .then(({ error }) => {
        if (error) useAuth.setState({ notice: { tone: 'danger', text: authErrorText(error) } });
        else if (type === 'email') welcome = t('Email confirmed – welcome to ONYX!');
      });
    cleanUrl();
    return;
  }
  // Supabase's default link: the session arrives in the address and is picked up automatically.
  if (p.type === 'signup') welcome = t('Email confirmed – welcome to ONYX!');
}

/* ---------------------------------------------------------------- */
/* Waiting for an email confirmation                                  */
/* ---------------------------------------------------------------- */

/** Credentials of a registration waiting for its email confirmation – memory only, never stored. */
let pending: { email: string; password: string } | null = null;
let lastRetry = 0;

export function rememberPending(email: string, password: string) {
  pending = { email: email.trim(), password };
}

/** Tries to sign in once the email was confirmed elsewhere. Returns true when signed in. */
export async function retryPending(force = false,captchaToken?:string): Promise<boolean> {
  if (!pending || useAuth.getState().status !== 'signedOut') return false;
  // A challenge token is single-use. Background retries must never replay it or bypass CAPTCHA.
  if(!captchaToken)return false;
  if (!force && Date.now() - lastRetry < 4000) return false;
  lastRetry = Date.now();
  const { error } = await supabase().auth.signInWithPassword({...pending,options:{captchaToken:requireCaptcha(captchaToken)}});
  if (error) return false;
  welcome = t('Email confirmed – welcome to ONYX!');
  return true;
}

/**
 * The code from the email (works on any device: read it on the phone, type it here).
 * kind: signup confirmation, sign-in code (magic link email) or password reset.
 */
export async function verifyEmailCode(email: string, code: string, kind: 'signup' | 'magic' | 'reset') {
  const wasRecovery=recoveryRequested;recoveryRequested=kind==='reset';
  const token = code.replace(/\s/g, '');
  const primary = kind === 'reset' ? 'recovery' : 'email';
  let { error } = await supabase().auth.verifyOtp({ email: email.trim(), token, type: primary });
  // Older confirmation emails use the "signup" token type.
  if (error && kind === 'signup') ({ error } = await supabase().auth.verifyOtp({ email: email.trim(), token, type: 'signup' }));
  if (!error && kind === 'signup') welcome = t('Email confirmed – welcome to ONYX!');
  if(error)recoveryRequested=wasRecovery;
  return error;
}

/* ---------------------------------------------------------------- */
/* Actions used by the sign-in screen and settings                    */
/* ---------------------------------------------------------------- */

const redirect = () => `${location.origin}${location.pathname}`;

export function authErrorText(e: AuthError | Error | null | undefined): string {
  if (!e) return '';
  const msg = e.message ?? '';
  const code = (e as AuthError).code ?? '';
  if(captchaError(e)||code==='captcha_failed'||/signup_request_invalid/.test(msg))return t('The security check could not be completed. Please try again.');
  if(/minimum_age/.test(msg))return t('ONYX is for ages 16 and up.');
  if(/date_required|date_invalid/.test(msg))return t('Choose a valid date of birth.');
  if(/country_required/.test(msg))return t('Choose your country.');
  if(/signup_rate_limited|over_request_rate_limit|over_anon_rate_limit/.test(code+' '+msg))return t('Too many attempts. Please wait and try again.');
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(msg)) return t('Email or password is wrong.');
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(msg)) return t('Please confirm your email address first – we sent you a link.');
  if (code === 'user_banned' || /user is banned/i.test(msg)) return t('This account is suspended from ONYX and can’t sign in anymore. If you think this is a mistake, contact the ONYX team.');
  if (code === 'user_already_exists' || /already registered/i.test(msg)) return t('An account with this email already exists. Sign in instead.');
  if (code === 'weak_password' || /password should be/i.test(msg)) return t('This password is too weak. Use at least 8 characters.');
  if (code === 'over_email_send_rate_limit' || /rate limit/i.test(msg)) return t('Too many emails in a short time. Please wait a moment and try again.');
  if (code === 'email_address_not_authorized' || /address not authorized|is not authorized/i.test(msg)) return t('ONYX can’t send emails to this address yet. Until a separate mail server (SMTP) is set up, Supabase only sends to members of the project team.');
  if (code === 'otp_disabled' || code === 'signup_disabled' || /signups not allowed/i.test(msg)) return t('No account with this email yet. Register first.');
  if (code === 'otp_expired' || /token has expired or is invalid|otp.*(expired|invalid)/i.test(msg)) return t('This code is wrong or has expired. Request a new email if needed.');
  if (/failed to fetch|network/i.test(msg)) return t('No connection to the server. Check your internet connection.');
  if(code==='insufficient_aal'||/mfa_required/i.test(msg))return t('Confirm your authenticator code to continue.');
  if(/session_expired/i.test(msg))return t('Your session has expired. Sign in again.');
  return msg;
}

export async function signIn(email: string, password: string,captchaToken?:string) {
  recoveryRequested=false;
  const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password,options:{captchaToken:requireCaptcha(captchaToken)} });
  return error;
}

export async function signUp(input: { email: string; password: string; username: string; displayName: string; country: string;birthDate:string;captchaToken?:string }) {
  const issue=birthDateIssue(input.birthDate);if(issue)throw Error(issue);if(!/^[A-Z]{2}$/.test(input.country))throw Error('country_required');
  const { data, error } = await supabase().auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      captchaToken:requireCaptcha(input.captchaToken),
      emailRedirectTo: redirect(),
      // locale: language of the ONYX emails (supabase/templates)
      data: { username: input.username, display_name: input.displayName.trim(), country: input.country, date_of_birth:input.birthDate,locale: getLanguage() },
    },
  });
  return { error, needsConfirmation: !error && !data.session };
}

/** Sends the email of the "check your inbox" screen again – with a new code, the old one stops working. */
export async function resendEmail(kind: 'confirm' | 'magic' | 'reset', email: string,captchaToken?:string) {
  if (kind === 'magic') return sendMagicLink(email,captchaToken);
  if (kind === 'reset') return sendPasswordReset(email,captchaToken);
  const { error } = await supabase().auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: redirect(),captchaToken:requireCaptcha(captchaToken) } });
  return error;
}

/** Last language written to user_metadata.locale, per account. */
let emailLocale: { userId: string; lang: string } | null = null;

/** The ONYX emails use the account's language (user_metadata.locale) – keep it equal to the app language. */
export function syncEmailLanguage() {
  const { session, status } = useAuth.getState();
  if (!CLOUD || !session || status !== 'ready') return;
  const userId = session.user.id;
  const lang = getLanguage();
  const known = emailLocale?.userId === userId ? emailLocale.lang : (session.user.user_metadata?.locale as string | undefined);
  if (known === lang) return;
  emailLocale = { userId, lang };
  void supabase()
    .auth.updateUser({ data: { locale: lang } })
    .then(({ error }) => {
      if (error) emailLocale = null;
    });
}

/** Magic link for existing accounts only (new accounts register with a username first). */
export async function sendMagicLink(email: string,captchaToken?:string) {
  const { error } = await supabase().auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false, emailRedirectTo: redirect(),captchaToken:requireCaptcha(captchaToken) } });
  return error;
}

export async function sendPasswordReset(email: string,captchaToken?:string) {
  const { error } = await supabase().auth.resetPasswordForEmail(email.trim(), { redirectTo: redirect(),captchaToken:requireCaptcha(captchaToken) });
  return error;
}

export async function setNewPassword(password: string) {
  const { error } = await supabase().auth.updateUser({ password });
  if (!error && useAuth.getState().status === 'recovery') {
    recoveryRequested=false;
    const { data } = await supabase().auth.getSession();
    useAuth.setState({ status: 'starting' });
    if (data.session) void load(data.session);
  }
  return error;
}

export async function usernameAvailable(username: string): Promise<boolean | null> {
  const { data, error } = await supabase().rpc('username_available', { p_username: username });
  return error ? null : (data as boolean);
}

export async function signOut() {
  const id=useAuth.getState().session?.user.id;
  if(id)try{forgetAccount(id);}catch{/* Storage settings must never block Auth sign-out. */}
  if(useAuth.getState().status!=='ready'){await supabase().auth.signOut({scope:'local'});return;}
  // Send what is still queued, but never let a slow connection block signing out.
  flushDebounced();
  await Promise.race([whenIdle(), new Promise((r) => setTimeout(r, 3000))]);
  // No more pushes of this account on this device (still signed in, so the entry can be deleted).
  const guest=guestActor();
  // Guests cannot enable push; do not initialize a service worker while ending their session.
  if(!guest)await Promise.race([disablePush().catch((e) => console.warn('[onyx] push off failed', e)), new Promise((r) => setTimeout(r, 3000))]);
  await supabase().auth.signOut(guest?{scope:'local'}:undefined);
}

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; reason: 'owns_servers'; servers: { id: string; name: string }[] }
  | { ok: false; reason: 'confirmation' | 'suspended' | 'failed'; message: string };

/**
 * Deletes the signed-in account for good (Edge Function "delete-account": files,
 * then the account; messages stay as "Deleted user"). Afterwards this device is
 * signed out and the sign-in screen says what happened.
 */
export async function deleteAccount(username: string): Promise<DeleteAccountResult> {
  // Send what is still queued first – after the deletion nothing can be saved any more.
  flushDebounced();
  await Promise.race([whenIdle(), new Promise((r) => setTimeout(r, 3000))]);
  const { error } = await supabase().functions.invoke('delete-account', { body: { username } });
  if (error) {
    const body: { error?: string; servers?: { id: string; name: string }[] } =
      error instanceof FunctionsHttpError ? await error.context.json().catch(() => ({})) : {};
    if (body.error === 'owns_servers') return { ok: false, reason: 'owns_servers', servers: body.servers ?? [] };
    if (body.error === 'confirmation_mismatch') return { ok: false, reason: 'confirmation', message: t('The username doesn’t match.') };
    if (body.error === 'suspended') return { ok: false, reason: 'suspended', message: t('This account is suspended and can’t be deleted by yourself. Contact the ONYX team.') };
    if (body.error === 'unauthorized') return { ok: false, reason: 'failed', message: t('Your session has expired. Sign in again and try once more.') };
    if (body.error) return { ok: false, reason: 'failed', message: t('Your account could not be deleted. It still exists – please try again in a moment.') };
    return { ok: false, reason: 'failed', message: describeError(error) };
  }
  resetQueue();
  useAuth.setState({ notice: { tone: 'success', text: t('Your account has been deleted. Thank you for having been part of ONYX.') } });
  // The account is gone on the server; only the local session needs to go.
  await supabase().auth.signOut({ scope: 'local' });
  return { ok: true };
}

export function retryLoad() {
  const session = useAuth.getState().session;
  if (session) void load(session);
}

/** Resume a remembered account from the signed-out screen (e.g. after cancelling another account's MFA). */
export async function resumeSavedAccount(id:string){
 if(accountTransition||useAuth.getState().status!=='signedOut')return;
 accountTransition=true;const isolated=accountAuthClient();
 try{
  const saved=savedSession(id);if(!saved)throw Error('account_missing');
  const {data,error}=await isolated.auth.setSession(saved);
  if(error||!data.session){
   if(error&&'status'in error&&[400,401,403,422].includes(error.status||0)){forgetAccount(id);throw Error('account_missing');}
   throw error||Error('account_missing');
  }
  if(data.session.user.id!==id||data.session.user.is_anonymous)throw Error('account_missing');
  if((await supabase().auth.getSession()).data.session)throw Error('account_changed');
  saveAccount(data.session);
  const result=await supabase().auth.setSession(data.session);if(result.error)throw result.error;
  location.reload();
 }finally{accountTransition=false;await isolated.auth.dispose();}
}

/* Account switching keeps the ordinary fresh-user/MFA gate in load(). */
let accountTransition=false;
export function rememberCurrentAccount(){
 const {session,status}=useAuth.getState();
 if(!session||status!=='ready'||guestActor())throw Error('registration_required');
 saveAccount(session,store().getState().users[session.user.id]);
}
export function accountSwitchError(error:unknown){
 const message=(error as Error)?.message||'';
 if(message==='account_limit')return t('You can remember up to five accounts on this device.');
 if(message==='account_missing')return t('This saved session has expired. Add the account again.');
 if(message==='account_pending')return t('Your changes are still saving. Please try again in a moment.');
 if(message==='account_changed')return t('The active account changed in another tab. Please try again.');
 if(error instanceof DOMException&&['SecurityError','QuotaExceededError'].includes(error.name))return t('Your browser could not remember this account. Check its storage settings.');
 return authErrorText(error as Error)||t('Couldn’t switch accounts. Please try again.');
}

/** Validation/refresh happens in isolation. No other account data is fetched there. */
export async function switchAccount(input:{id:string}|{email:string;password:string;captchaToken?:string}){
 if(typeof navigator!=='undefined'&&navigator.locks)return navigator.locks.request('onyx-account-switch',()=>performAccountSwitch(input));
 return performAccountSwitch(input);
}
async function performAccountSwitch(input:{id:string}|{email:string;password:string;captchaToken?:string}){
 if(accountTransition)return;
 let current=useAuth.getState().session;
 if(!current||useAuth.getState().status!=='ready'||guestActor())throw Error('registration_required');
 rememberCurrentAccount();
 if('id'in input&&input.id===current.user.id)return;
 if('email'in input&&useSavedAccounts.getState().accounts.length>=ACCOUNT_LIMIT&&!useSavedAccounts.getState().accounts.some(a=>a.email.toLowerCase()===input.email.trim().toLowerCase()))throw Error('account_limit');
 accountTransition=true;
 const isolated=accountAuthClient();
 let swapping=false;
 try{
  let target:Session|null=null;
  if('id'in input){
   const saved=savedSession(input.id);if(!saved)throw Error('account_missing');
   const {data,error}=await isolated.auth.setSession(saved);
   if(error||!data.session){
    // Transient network failures must not delete a still-valid saved session.
    if(error&&'status'in error&&[400,401,403,422].includes(error.status||0)){forgetAccount(input.id);throw Error('account_missing');}
    throw error||Error('account_missing');
   }
   if(data.session.user.id!==input.id)throw Error('account_missing');
   target=data.session;
  }else{
   const {data,error}=await isolated.auth.signInWithPassword({email:input.email.trim(),password:input.password,options:{captchaToken:requireCaptcha(input.captchaToken)}});
   if(error||!data.session)throw error||Error('session_expired');
   target=data.session;
  }
  if(target.user.is_anonymous)throw Error('registration_required');
  const before=await supabase().auth.getSession();
  if(before.data.session?.user.id!==current.user.id)throw Error('account_changed');
  current=before.data.session;
  // Save the refreshed tokens even if a later cleanup fails; expired refresh tokens are never reused.
  saveAccount(target);
  flushDebounced();
  await Promise.race([whenIdle(),new Promise<never>((_,reject)=>setTimeout(()=>reject(Error('account_pending')),5000))]);
  await leaveVoice({silent:true});
  await disablePush();
  const latest=await supabase().auth.getSession();
  if(latest.data.session?.user.id!==current.user.id)throw Error('account_changed');
  current=latest.data.session;
  updateSavedAccount(current);
  flushDebounced();
  await Promise.race([whenIdle(),new Promise<never>((_,reject)=>setTimeout(()=>reject(Error('account_pending')),5000))]);
  securityRevision++;recoveryRequested=false;pending=null;welcome=null;
  lockAccount();swapping=true;
  const {data,error}=await supabase().auth.setSession(target);
  if(error||!data.session)throw error||Error('session_expired');
  // A fresh document also discards in-flight profile/media requests and module caches.
  // No private view of the target account is rendered before its normal fresh-user/MFA gate.
  location.reload();
 }catch(error){
  if(swapping){
   const {data,error:restoreError}=await supabase().auth.setSession(current);
   accountTransition=false;
   if(!restoreError&&data.session)await load(data.session);
   else {lockAccount();useAuth.setState({status:'signedOut',session:null,email:null,error:null});}
  }else{
   accountTransition=false;
   const {data}=await supabase().auth.getSession();
   if(data.session)await load(data.session);
  }
  throw error;
 }finally{accountTransition=false;await isolated.auth.dispose();}
}
