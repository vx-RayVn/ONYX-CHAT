import { useEffect,useState } from 'react';
import { getInvitePreview,type InvitePreview as Preview } from '../../backend/community';
import { useStore } from '../../store/store';
import { useUI } from '../../store/ui';
import { useAuth } from '../../backend/auth';
import { describeError } from '../../backend/queue';
import { t,tn } from '../../i18n';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { AuthScreen } from '../auth/AuthScreen';
import { parseInvite } from '../../lib/invites';
import { Shield } from 'lucide-react';

export function InviteCard({code,onJoined,onSignIn,onPreview}:{code:string;onJoined?:()=>void;onSignIn?:()=>void;onPreview?:(preview:Preview|null)=>void}) {
  const [preview,setPreview]=useState<Preview|null|undefined>(),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const ready=useAuth(s=>s.status==='ready');
  useEffect(()=>{let current=true;setPreview(undefined);setError('');void getInvitePreview(code).then(value=>{if(current){setPreview(value);onPreview?.(value);}}).catch(e=>{if(current)setError(describeError(e));});return()=>{current=false;};},[code,onPreview]);
  return <div className={`invite-preview-card${preview?.banner?.kind==='image'?' has-banner':''}`} aria-busy={preview===undefined&&!error}>
    {preview?.banner?.kind==='image'&&<img className="invite-preview-banner" src={preview.banner.src} alt=""/>}
    <div className="invite-preview-body">
      {preview&&<span className="invite-preview-avatar">{preview.icon?<img className="invite-preview-icon" src={preview.icon} alt=""/>:<Shield size={32}/>}</span>}
      <h2>{preview?.name??(error?t('Invite unavailable'):preview===undefined?t('Loading …'):t('This invite is invalid or has expired.'))}</h2>
      {preview&&<>{preview.description&&<p>{preview.description}</p>}<small>{tn(preview.members,'{count} member','{count} members')}</small>
      <Button block loading={busy} onClick={()=>{if(!ready){onSignIn?.();return;}setBusy(true);void useStore.getState().joinByInvite(code).then(id=>{if(id)onJoined?.();else setError(t('This invite is invalid or has expired.'));}).catch(e=>setError(describeError(e))).finally(()=>setBusy(false));}}>{ready?t('Join server'):t('Sign in to join')}</Button></>}
      {error&&<p role="alert">{error}</p>}
    </div>
  </div>;
}
export function InvitePreviewModal({code}:{code:string}) {
  const close=useUI(s=>s.closeModal);
  return <Modal open onClose={close} size="sm" title={t('Server invitation')}><InviteCard code={code} onJoined={close}/></Modal>;
}
export function InviteLanding({code}:{code:string}) {
  const [signIn,setSignIn]=useState(false),[preview,setPreview]=useState<Preview|null>(null),ready=useAuth(s=>s.status==='ready');
  useEffect(()=>{
    const canonical=`/invite/${encodeURIComponent(code)}`;
    if(location.pathname!==canonical)history.replaceState(null,'',canonical+location.search+location.hash);
    const previous=document.title;
    document.title=preview?`${preview.name} · ONYX`:t('Server invitation')+' · ONYX';
    return()=>{document.title=previous;};
  },[code,preview]);
  const go=()=>{history.replaceState(null,'','/');window.dispatchEvent(new PopStateEvent('popstate'));};
  return <main className={`invite-landing${signIn&&!ready?' is-auth':''}`}>
    <div className="invite-scene" aria-hidden style={preview?.banner?.kind==='image'?{backgroundImage:`url(${JSON.stringify(preview.banner.src)})`}:undefined}/>
    <a className="invite-brand" href="/" aria-label="ONYX"><img src="/brand/onyx-mark-64.webp" alt=""/><span>ONYX</span></a>
    {signIn&&!ready?<div className="invite-auth"><Button variant="ghost" onClick={()=>setSignIn(false)}>{t('Back')}</Button><AuthScreen/></div>:<section className="invite-landing-content" aria-label={t('Server invitation')}><span className="invite-caption">{t('Server invitation')}</span><InviteCard code={code} onSignIn={()=>setSignIn(true)} onJoined={go} onPreview={setPreview}/><Button variant="ghost" onClick={go}>{t('Back')}</Button></section>}
  </main>;
}

export function InviteEmbeds({content}:{content:string}) {
  const codes=[...new Set([...content.matchAll(/https?:\/\/[^\s<>()]+/g)].map(match=>parseInvite(match[0].replace(/[.,!?;:]+$/,''))).filter((code):code is string=>!!code))].slice(0,3);
  return <>{codes.map(code=><InviteCard key={code} code={code}/>)}</>;
}
