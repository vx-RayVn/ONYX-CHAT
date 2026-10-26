import {useEffect,useState} from 'react';
import {Compass,ChevronDown} from 'lucide-react';
import {CLOUD} from '../../backend/config';
import {supabase} from '../../backend/client';
import {invalidateDirectory} from '../../backend/directory';
import {useStore} from '../../store/store';
import {toast} from '../../store/ui';
import {t} from '../../i18n';
import {Button} from '../ui/Button';
import {Switch} from '../ui/Field';
import {Dropdown} from '../ui/Menu';
import {SettingsHeader,SettingsSection} from './SettingsLayout';
import {DIRECTORY_CATEGORIES,categoryName,type DirectoryCategory} from '../home/DiscoverView';

export function DirectorySettings({serverId}:{serverId:string}){
  const [enabled,setEnabled]=useState(true),[category,setCategory]=useState<DirectoryCategory>('general'),[busy,setBusy]=useState(true),[failed,setFailed]=useState(false),[rev,retry]=useState(0);
  const me=useStore(s=>s.meId),owner=useStore(s=>s.servers[serverId]?.ownerId===s.meId);
  useEffect(()=>{
    let stop=false;setBusy(true);setFailed(false);
    if(!CLOUD){setBusy(false);return;}
    void (async()=>{try{const {data,error}=await supabase().from('server_directory').select('enabled,category').eq('server_id',serverId).maybeSingle();if(error)throw error;if(!stop){setEnabled(data?.enabled??true);setCategory(data?.category??'general');}}catch{if(!stop)setFailed(true);}finally{if(!stop)setBusy(false);}})();
    return()=>{stop=true;};
  },[serverId,rev,me]);
  const save=async()=>{
    if(busy||!owner||!CLOUD)return;setBusy(true);
    try{const {error}=await supabase().rpc('save_server_directory',{p_server:serverId,p_enabled:enabled,p_category:category});if(error)throw error;if(useStore.getState().meId===me){invalidateDirectory();toast({title:t('Saved')});}}
    catch{toast({tone:'danger',title:t('Directory settings could not be saved.')});}
    finally{setBusy(false);}
  };
  return <><SettingsHeader title={t('Discover')} description={t('Let people find your server on ONYX.')}/><SettingsSection title={t('Public listing')} description={t('Your server name, icon, banner, description and member count become visible. Channels and messages stay private until someone joins.')}>
    {!CLOUD?<p>{t('A cloud account is required to publish a community.')}</p>:failed?<><p role="alert">{t('Communities could not be loaded.')}</p><Button onClick={()=>retry(r=>r+1)}>{t('Try again')}</Button></>:<>
      <label className="directory-enable"><Compass size={21}/><span>{t('Show this server in Discover')}</span><Switch checked={enabled} disabled={busy||!owner} onChange={setEnabled}/></label>
      <div className="directory-category"><span>{t('Category')}</span><Dropdown items={DIRECTORY_CATEGORIES.map(c=>({type:'radio',label:categoryName(c),checked:category===c,onSelect:()=>setCategory(c)}))} trigger={<button className="select-btn" disabled={busy||!owner}>{categoryName(category)}<ChevronDown size={16}/></button>}/></div>
      <Button disabled={busy||!owner} onClick={()=>void save()}>{t('Save')}</Button>
    </>}
  </SettingsSection></>;
}
