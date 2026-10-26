/**
 * Sign-in and registration (cloud mode). Email + password, magic link for
 * existing accounts, password reset. Passwords go straight to Supabase Auth.
 */
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, AtSign, KeyRound, Lock, Mail, MailCheck, RefreshCw, ShieldAlert, TriangleAlert, User as UserIcon } from 'lucide-react';
import { Button } from '../ui/Button';
import { TextField } from '../ui/Field';
import { BRAND, BRAND_IMAGES } from '../../config/brand';
import { t } from '../../i18n';
import { cn, formatFullDate } from '../../lib/utils';
import {AuthenticatorCode} from './AuthenticatorCode';
import {SelectField} from '../ui/SelectField';
import {mfaError} from '../../backend/mfa';
import {GuestEntry} from './GuestEntry';
import {AppLoading} from './AppLoading';
import {SavedAccountSignIns} from './SavedAccountSignIns';
import {BirthDateField,CountryField,PasswordField,policyError,useEntryCountry} from './EntryFields';
import {birthDateIssue} from '../../lib/signupPolicy';
import {useCaptcha} from './Captcha';
import {useIsMobile,useMediaQuery} from '../../hooks/useMediaQuery';
import {useTouchViewport} from '../../hooks/useTouchViewport';
import {
  authErrorText,
  leaveSuspension,
  rememberPending,
  resendEmail,
  retryLoad,
  retryPending,
  sendMagicLink,
  sendPasswordReset,
  setNewPassword,
  signIn,
  signOut,
  signUp,
  useAuth,
  usernameAvailable,
  verifyEmailCode,
  completeMfaSignIn,
} from '../../backend/auth';

type Mode = 'signin' | 'register' | 'magic' | 'reset' | 'guest';

const USERNAME_RE = /^[a-z0-9_.]{2,32}$/;
const MIN_PASSWORD = 8;

const cleanUsername = (v: string) =>
  v
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, '')
    .slice(0, 32);

function Shell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="auth-screen">
      <div className="auth-glow" aria-hidden />
      <main className={cn('auth-card', wide && 'is-wide')}>
        <div className="auth-brand">
          <img src={BRAND_IMAGES.onyxLogo.sm} alt="" width={44} height={44} />
          <span className="auth-brand-name">{BRAND.name}</span>
        </div>
        {children}
      </main>
    </div>
  );
}

function Notice({ tone = 'info', children }: { tone?: 'info' | 'danger' | 'success'; children: ReactNode }) {
  return (
    <div className={cn('auth-notice', `is-${tone}`)} role={tone === 'danger' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export function AuthScreen() {
  const mobile=useIsMobile(),touch=useMediaQuery('(pointer: coarse)');
  useTouchViewport(mobile||touch);
  const status = useAuth((s) => s.status);
  const error = useAuth((s) => s.error);
  const email = useAuth((s) => s.email);

  if (status === 'starting' || status === 'loading') {
    return <AppLoading connecting={status==='starting'}/>;
  }
  if (status === 'error') {
    return (
      <Shell>
        <h1 className="auth-title">{t('Couldn’t load your data')}</h1>
        <Notice tone="danger">
          <TriangleAlert size={16} /> <span>{error}</span>
        </Notice>
        <div className="auth-actions">
          <Button block icon={<RefreshCw />} onClick={retryLoad}>
            {t('Try again')}
          </Button>
          <Button block variant="ghost" onClick={() => void signOut()}>
            {t('Sign out')} {email ? `(${email})` : ''}
          </Button>
        </div>
      </Shell>
    );
  }
  if (status === 'recovery') return <NewPassword />;
  if (status === 'mfa') return <MfaChallenge/>;
  if (status === 'suspended') return <Suspended />;
  return <SignInForms />;
}

function MfaChallenge(){
 const factors=useAuth(state=>state.authenticators);
 const [selected,setSelected]=useState(factors[0]?.id??''),[code,setCode]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(!factors.some(factor=>factor.id===selected))setSelected(factors[0]?.id??'');},[factors,selected]);
 const submit=async(event:FormEvent)=>{event.preventDefault();if(busy||code.length!==6||!selected)return;setBusy(true);setError('');try{await completeMfaSignIn(selected,code);}catch(error){setCode('');setError(mfaError(error));}finally{setBusy(false);}};
 return <Shell><form className="auth-form" onSubmit={event=>void submit(event)}><span className="auth-security-icon"><Lock size={26}/></span><h1 className="auth-title">{t('Two-factor authentication')}</h1><p className="auth-sub">{t('Enter the six-digit code from your authenticator app to continue.')}</p>{factors.length>1&&<SelectField label={t('Authenticator')} value={selected} onChange={id=>{setSelected(id);setCode('');setError('');}} disabled={busy} options={factors.map(factor=>({value:factor.id,label:factor.name}))}/>}<AuthenticatorCode value={code} onChange={setCode} disabled={busy||!selected}/>{error&&<Notice tone="danger">{error}</Notice>}{!factors.length&&<Notice tone="danger">{t('No supported authenticator is available. Sign in with another account or contact the ONYX team.')}</Notice>}<Button type="submit" block size="lg" loading={busy} disabled={code.length!==6||!selected}>{t('Verify and continue')}</Button><p className="auth-hint">{t('Lost your authenticator? Choose your backup authenticator above. Resetting your password does not remove 2FA.')}</p><Button block variant="ghost" disabled={busy} icon={<ArrowLeft/>} onClick={()=>void signOut()}>{t('Back to sign-in')}</Button></form></Shell>;
}

/** The account was suspended ONYX-wide by a platform admin (shown with the reason – people have a right to know why). */
function Suspended() {
  const suspension = useAuth((s) => s.suspension);
  return (
    <Shell>
      <div className="auth-form">
        <h1 className="auth-title">{t('Your account is suspended')}</h1>
        <Notice tone="danger">
          <ShieldAlert size={16} /> <span>{t('The ONYX team has suspended this account. You were signed out on all devices and can’t sign in anymore.')}</span>
        </Notice>
        {suspension?.reason && (
          <div className="auth-suspension">
            <span className="auth-suspension-label">{t('Reason')}</span>
            <p>{suspension.reason}</p>
          </div>
        )}
        <p className="auth-hint">
          {suspension?.at ? `${t('Suspended since {date}', { date: formatFullDate(suspension.at) })} · ` : ''}
          {t('If you think this is a mistake, contact the ONYX team.')}
        </p>
      </div>
      <div className="auth-actions">
        <Button block variant="ghost" icon={<ArrowLeft />} onClick={leaveSuspension}>
          {t('Back to sign-in')}
        </Button>
      </div>
    </Shell>
  );
}

type SentKind = 'confirm' | 'magic' | 'reset';

/** Supabase sends at most one email per address every 60 seconds. */
const RESEND_AFTER_S = 60;

/**
 * After an email was sent. The code from the email works on any device (read
 * it on the phone, type it here). The button in the email works on the device
 * that opens it. A confirmation done elsewhere can continue here after a fresh
 * CAPTCHA check; never replay challenge tokens in background password retries.
 */
function CheckInbox({ kind, email, onBack }: { kind: SentKind; email: string; onBack: () => void }) {
  const captcha=useCaptcha();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [resending, setResending] = useState(false);
  const wait = Math.max(0, RESEND_AFTER_S - Math.floor((now - sentAt) / 1000));
  const body = {
    confirm: t('We sent a code to {email}. Enter it here to confirm your account.', { email }),
    magic: t('We sent a sign-in code to {email}. Enter it here to sign in.', { email }),
    reset: t('We sent a code to {email}. Enter it here to choose a new password.', { email }),
  }[kind];

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setNow(Date.now()), 1000);
    return () => clearTimeout(timer);
  }, [wait, now]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const err = await verifyEmailCode(email, code, kind === 'confirm' ? 'signup' : kind === 'magic' ? 'magic' : 'reset');
    setBusy(false);
    if (err) setError(authErrorText(err));
  };

  const continueNow = async () => {
    setChecking(true);
    setError(null);
    try{const ok = await retryPending(true,await captcha.verify('confirm_signin'));if (!ok) setError(t('Not confirmed yet. Open the link in the email or enter the code.'));}catch(error){setError(authErrorText(error as Error));}finally{setChecking(false);}
  };

  const resend = async () => {
    setResending(true);
    setError(null);
    setInfo(null);
    try{const err = await resendEmail(kind, email,await captcha.verify('resend'));if(err)throw err;setCode('');setSentAt(Date.now());setNow(Date.now());setInfo(t('New email sent. Only the newest code works.'));}catch(error){setError(authErrorText(error as Error));}finally{setResending(false);}
  };

  return (
    <Shell>
      <div className="auth-sent">
        <span className="auth-sent-icon">
          <MailCheck />
        </span>
        <h1 className="auth-title">{t('Check your inbox')}</h1>
        <p className="auth-sub">{body}</p>
      </div>
      <form className="auth-form" onSubmit={submit} noValidate>
        {captcha.control}
        <TextField
          label={t('Code from the email')}
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 10))}
          placeholder="123456"
          className="auth-code"
          autoFocus
        />
        {error && <Notice tone="danger">{error}</Notice>}
        {info && !error && <Notice tone="success">{info}</Notice>}
        <Button type="submit" block size="lg" loading={busy} disabled={code.length < 6}>
          {kind === 'reset' ? t('Continue') : kind === 'magic' ? t('Sign in') : t('Confirm email')}
        </Button>
        <Button block variant="secondary" icon={<RefreshCw />} loading={resending} disabled={wait > 0} onClick={resend}>
          {wait > 0 ? t('Send a new code ({seconds} s)', { seconds: wait }) : t('Send a new code')}
        </Button>
        {kind === 'confirm' && (
          <Button block variant="ghost" loading={checking} onClick={continueNow}>
            {t('I opened the link – continue')}
          </Button>
        )}
        <p className="auth-hint">{t('Reading the email on this device? Then the button in it works too.')}</p>
        <p className="auth-hint">{t('Nothing there? Look in the spam folder. Codes and links are valid for a limited time and work once.')}</p>
        <Button block variant="ghost" icon={<ArrowLeft />} onClick={onBack}>
          {t('Back to sign in')}
        </Button>
      </form>
    </Shell>
  );
}

function SignInForms() {
  const [mode, setMode] = useState<Mode>(()=>new URLSearchParams(location.search).get('guest')==='1'?'guest':location.pathname.replace(/\/+$/, '')==='/signup'?'register':'signin');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<null | SentKind>(null);
  const notice = useAuth((s) => s.notice);

  if (sent) return <CheckInbox kind={sent} email={email} onBack={() => {setSent(null);setMode('signin');}} />;

  return (
    <Shell wide={mode === 'register'}>
      {notice && (
        <div className="auth-top-notice">
          <Notice tone={notice.tone}>{notice.text}</Notice>
        </div>
      )}
      {(mode === 'signin' || mode === 'register') && (
        <div className="auth-tabs" role="tablist" aria-label={t('Account')}>
          <button role="tab" type="button" aria-selected={mode === 'signin'} className={cn('auth-tab', mode === 'signin' && 'is-active')} onClick={() => setMode('signin')}>
            {t('Sign in')}
          </button>
          <button role="tab" type="button" aria-selected={mode === 'register'} className={cn('auth-tab', mode === 'register' && 'is-active')} onClick={() => setMode('register')}>
            {t('Register')}
          </button>
        </div>
      )}
      {mode === 'signin' && <SignIn email={email} setEmail={setEmail} setMode={setMode} />}
      {mode === 'signin' && <SavedAccountSignIns/>}
      {mode === 'register' && <Register email={email} setEmail={setEmail} onConfirm={() => setSent('confirm')} />}
      {mode === 'magic' && <EmailOnly kind="magic" email={email} setEmail={setEmail} back={() => setMode('signin')} onSent={() => setSent('magic')} />}
      {mode === 'reset' && <EmailOnly kind="reset" email={email} setEmail={setEmail} back={() => setMode('signin')} onSent={() => setSent('reset')} />}
      {mode === 'guest' && <GuestEntry onBack={()=>setMode('signin')}/>}
      {(mode==='signin'||mode==='register')&&<div className="guest-auth-choice"><Button block variant="secondary" icon={<UserIcon/>} onClick={()=>setMode('guest')}>{t('Continue as guest')}</Button></div>}
    </Shell>
  );
}

interface EmailProps {
  email: string;
  setEmail: (v: string) => void;
}

function SignIn({ email, setEmail, setMode }: EmailProps & { setMode: (m: Mode) => void }) {
  const captcha=useCaptcha();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if(busy)return;
    setBusy(true);
    setError(null);
    try{const err = await signIn(email, password,await captcha.verify('signin'));if(err)setError(authErrorText(err));}catch(error){setError(authErrorText(error as Error));}finally{setBusy(false);}
  };

  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      <h1 className="auth-title">{t('Welcome back')}</h1>
      {error && <Notice tone="danger">{error}</Notice>}
      <TextField label={t('Email')} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} prefix={<Mail size={16} />} required autoFocus disabled={busy} />
      <PasswordField label={t('Password')} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={busy}/>
      <button type="button" className="auth-link auth-forgot" onClick={() => setMode('reset')}>
        {t('Forgot your password?')}
      </button>
      {captcha.control}<Button type="submit" block size="lg" loading={busy} disabled={!email.trim() || !password}>
        {t('Sign in')}
      </Button>
      <Button block variant="ghost" icon={<MailCheck />} disabled={busy} onClick={() => setMode('magic')}>
        {t('Email me a sign-in link')}
      </Button>
    </form>
  );
}

function EmailOnly({ kind, email, setEmail, back, onSent }: EmailProps & { kind: 'magic' | 'reset'; back: () => void; onSent: () => void }) {
  const captcha=useCaptcha();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if(busy)return;
    setBusy(true);
    setError(null);
    try{const proof=await captcha.verify(kind);const err = kind === 'magic' ? await sendMagicLink(email,proof) : await sendPasswordReset(email,proof);if(err)setError(authErrorText(err));else onSent();}catch(error){setError(authErrorText(error as Error));}finally{setBusy(false);}
  };
  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      <button type="button" className="auth-link auth-back" onClick={back}>
        <ArrowLeft size={15} /> {t('Back')}
      </button>
      <h1 className="auth-title">{kind === 'magic' ? t('Sign in with a link') : t('Reset password')}</h1>
      <p className="auth-sub">
        {kind === 'magic' ? t('We’ll email you a link that signs you in – no password needed. Works for existing accounts.') : t('We’ll email you a link to choose a new password.')}
      </p>
      {error && <Notice tone="danger">{error}</Notice>}
      <TextField label={t('Email')} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} prefix={<Mail size={16} />} required autoFocus disabled={busy} />
      {captcha.control}<Button type="submit" block size="lg" loading={busy} disabled={!email.trim()}>
        {kind === 'magic' ? t('Send sign-in link') : t('Send reset link')}
      </Button>
    </form>
  );
}

function Register({ email, setEmail, onConfirm }: EmailProps & { onConfirm: () => void }) {
  const captcha=useCaptcha();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [country, setCountry] = useEntryCountry();
  const [birthDate,setBirthDate]=useState('');
  const [birthError,setBirthError]=useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [touched, setTouched] = useState(false);

  const validName = USERNAME_RE.test(username);
  useEffect(() => {
    setAvailable(null);
    if (!validName) return;
    let current=true;
    const timer = setTimeout(() => void usernameAvailable(username).then(value=>{if(current)setAvailable(value);}).catch(()=>{}), 350);
    return () => {current=false;clearTimeout(timer);};
  }, [username, validName]);

  const usernameError = touched && username && !validName ? t('2–32 characters: lowercase letters, numbers, “_” and “.”.') : available === false ? t('This username is already taken.') : null;
  const passwordError = touched && password && password.length < MIN_PASSWORD ? t('At least {count} characters.', { count: MIN_PASSWORD }) : null;
  const canSubmit = !!email.trim() && validName && available !== false && password.length >= MIN_PASSWORD && !!displayName.trim();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if(busy)return;
    setTouched(true);
    if (!canSubmit) return;
    const issue=birthDateIssue(birthDate);setBirthError(issue?policyError(issue):'');if(issue){setError(null);return;}if(!country){setError(policyError('country_required'));return;}
    setBusy(true);
    setError(null);
    try{const { error: err, needsConfirmation } = await signUp({ email, password, username, displayName: displayName || username, country,birthDate,captchaToken:await captcha.verify('signup') });if(err)setError(authErrorText(err));else if(needsConfirmation){rememberPending(email,password);onConfirm();}}catch(error){setError(authErrorText(error as Error));}finally{setBusy(false);}
  };

  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      <h1 className="auth-title">{t('Create your account')}</h1>
      {error && <Notice tone="danger">{error}</Notice>}
      <TextField label={t('Email')} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} prefix={<Mail size={16} />} required autoFocus disabled={busy} />
      <div className="auth-row">
        <TextField
          label={t('Username')}
          autoComplete="username"
          value={username}
          maxLength={32}
          onChange={(e) => setUsername(cleanUsername(e.target.value))} disabled={busy}
          onBlur={() => setTouched(true)}
          prefix={<AtSign size={16} />}
          error={usernameError}
          required
        />
        <TextField
          label={t('Display name')}
          autoComplete="nickname"
          value={displayName}
          maxLength={32}
          onChange={(e) => setDisplayName(e.target.value)} disabled={busy}
          prefix={<UserIcon size={16} />}
          required
        />
      </div>
      <PasswordField
        label={t('Password')}
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onBlur={() => setTouched(true)}
        prefix={<KeyRound size={16} />}
        error={passwordError}
        hint={t('At least {count} characters.', { count: MIN_PASSWORD })}
        required
      />
      <BirthDateField value={birthDate} onChange={value=>{setBirthDate(value);setBirthError('');setError(null);}} disabled={busy} error={birthError}/>
      <CountryField value={country} onChange={setCountry} disabled={busy}/>
      {captcha.control}
      <Button type="submit" block size="lg" loading={busy} disabled={busy}>
        {t('Create account')}
      </Button>
    </form>
  );
}

function NewPassword() {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) return setError(t('At least {count} characters.', { count: MIN_PASSWORD }));
    setBusy(true);
    setError(null);
    const err = await setNewPassword(password);
    setBusy(false);
    if (err) setError(authErrorText(err));
  };
  return (
    <Shell>
      <form className="auth-form" onSubmit={submit} noValidate>
        <h1 className="auth-title">{t('Choose a new password')}</h1>
        <p className="auth-sub">{t('You opened a reset link. Set your new password here.')}</p>
        {error && <Notice tone="danger">{error}</Notice>}
        <TextField
          label={t('New password')}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          prefix={<KeyRound size={16} />}
          hint={t('At least {count} characters.', { count: MIN_PASSWORD })}
          autoFocus
        />
        <Button type="submit" block size="lg" loading={busy} disabled={!password}>
          {t('Save password')}
        </Button>
      </form>
    </Shell>
  );
}
