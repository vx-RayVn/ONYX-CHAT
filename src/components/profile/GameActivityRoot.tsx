import {useEffect,useState} from 'react';
import {useAuth} from '../../backend/auth';
import {CLOUD} from '../../backend/config';
import {activityRequest,refreshActivities} from '../../backend/activity';
import {useStore} from '../../store/store';
import {toast,useUI} from '../../store/ui';
import {t} from '../../i18n';
import {Modal} from '../ui/Modal';
import {Button} from '../ui/Button';
export function GameActivityRoot(){
 const ready=useAuth(s=>s.status==='ready'),me=useStore(s=>s.meId),[pair,setPair]=useState(''),[busy,setBusy]=useState(false);
 const guest=useStore(s=>s.users[s.meId]?.guest);
 useEffect(()=>{
  if(!CLOUD||!ready||guest)return;
  const read=()=>{const hash=new URLSearchParams(location.hash.slice(1)).get('activity_pair');if(!/^[a-f0-9]{64}$/.test(hash??''))return;history.replaceState(null,'',location.pathname+location.search);setPair(hash!);};
  read();window.addEventListener('hashchange',read);
  let active=true,steamAt=0;
  const poll=async()=>{
   if(document.hidden)return;await refreshActivities();
   if(Date.now()-steamAt>=65000){steamAt=Date.now();try{await activityRequest('steam');if(active)window.dispatchEvent(new Event('onyx:connections'));}catch{/* Keep valid profile data during a provider outage. */}}
  };
  void activityRequest('status').then(data=>{if(active)useStore.getState().setSetting('showActivity',data.enabled);}).catch(()=>{});
  void poll();const timer=setInterval(()=>void poll(),20000);document.addEventListener('visibilitychange',poll);
  return()=>{active=false;clearInterval(timer);window.removeEventListener('hashchange',read);document.removeEventListener('visibilitychange',poll);};
 },[ready,me,guest]);
 if(!pair)return null;
 return <Modal open onClose={()=>setPair('')} size="sm" title={t('Connect Windows')}>
  <p>{t('Compare this code with the ONYX Windows app.')}</p><div className="activity-pair-code">{pair.slice(0,4).toUpperCase()}-{pair.slice(4,8).toUpperCase()}</div>
  <div className="activity-pair-actions"><Button variant="ghost" onClick={()=>setPair('')}>{t('Cancel')}</Button><Button loading={busy} onClick={()=>{
   setBusy(true);void activityRequest('pair',{hash:pair,name:'Windows'}).then(()=>{setPair('');useUI.getState().openSettings({kind:'user',section:'connections'});toast({title:t('Windows connected')});}).catch(error=>toast({tone:'danger',title:error.message})).finally(()=>setBusy(false));
  }}>{t('Connect')}</Button></div>
 </Modal>;
}
