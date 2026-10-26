import {useState} from 'react';
import {Download,Monitor,Unlink} from 'lucide-react';
import {activityRequest,refreshActivities,useActivityStatus} from '../../backend/activity';
import {CLOUD} from '../../backend/config';
import {useStore} from '../../store/store';
import {toast} from '../../store/ui';
import {t} from '../../i18n';
import {Button} from '../ui/Button';
import {Switch} from '../ui/Field';
export function ActivitySettings(){
 const {data,setData,loading,error,setError}=useActivityStatus(),[busy,setBusy]=useState(false);
 const act=async(action:string,body:Record<string,unknown>)=>{setBusy(true);try{const next=await activityRequest(action,body);setData(next);setError(false);useStore.getState().setSetting('showActivity',next.enabled);await refreshActivities();}catch(e){toast({tone:'danger',title:e instanceof Error?e.message:t('Couldn’t update activity.')});}finally{setBusy(false);}};
 if(!CLOUD)return null;
 return <section className="activity-settings"><h3>{t('Game activity')}</h3>
  <div className="activity-preference"><span>{t('Show activity status')}</span><Switch checked={data.enabled} disabled={loading||busy||error} label={t('Activity status')} onChange={enabled=>void act('settings',{enabled})}/></div>
  <div className="activity-desktop"><Monitor size={24}/><div><strong>{t('ONYX for Windows')}</strong><p>{t('Detect games without linking an account.')}</p></div><a className="btn btn-secondary btn-sm" href="/downloads/ONYX-Activity-Windows.zip" download><Download size={15}/>{t('Download')}</a></div>
  {data.devices.map(device=><div className="activity-device" key={device.id}><Monitor size={17}/><span>{device.name}</span><Button variant="ghost" size="sm" icon={<Unlink size={15}/>} loading={busy} onClick={()=>void act('revoke',{id:device.id})}>{t('Disconnect')}</Button></div>)}
  {error&&<Button variant="ghost" onClick={()=>void act('status',{})}>{t('Try again')}</Button>}
 </section>;
}

export function ActivityVisibilitySwitch(){
 const {data,setData,loading,error}=useActivityStatus(),[busy,setBusy]=useState(false),local=useStore(s=>s.settings.showActivity);
 return <Switch checked={CLOUD?data.enabled:local} disabled={CLOUD&&(loading||busy||error)} label={t('Activity status')} onChange={enabled=>{
  if(!CLOUD){useStore.getState().setSetting('showActivity',enabled);return;}
  setBusy(true);void activityRequest('settings',{enabled}).then(next=>{setData(next);useStore.getState().setSetting('showActivity',next.enabled);return refreshActivities();}).catch(error=>toast({tone:'danger',title:error.message})).finally(()=>setBusy(false));
 }}/>;
}
