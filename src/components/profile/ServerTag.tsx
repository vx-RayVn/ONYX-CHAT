import { useState } from 'react';
import { Check, ChevronRight, Shield, X } from 'lucide-react';
import { CLOUD } from '../../backend/config';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { refreshCommunity } from '../../backend/community';
import { t } from '../../i18n';
import { useCommunity, selectServerTag } from '../../backend/community';
import { useStore } from '../../store/store';
import { toast, useUI } from '../../store/ui';
import { describeError } from '../../backend/queue';
import { SettingsSection } from '../settings/SettingsLayout';

export function ServerTagPill({userId}:{userId:string}) {
  const serverId=useCommunity(s=>s.selected[userId]);
  const tag=useCommunity(s=>serverId?s.tags[serverId]:undefined);
  if(!tag?.enabled||!tag.invite_code)return null;
  const open=()=>useUI.getState().openModal({type:'invitePreview',code:tag.invite_code!});
  return <span role="button" tabIndex={0} className="server-tag" aria-label={t('View server: {tag}',{tag:tag.label})} onClick={e=>{e.preventDefault();e.stopPropagation();open();}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();open();}}}>
    {tag.image&&<img src={tag.image} alt=""/>}<span>{tag.label}</span>
  </span>;
}
export function ServerTagPicker() {
  const me=useStore(s=>s.meId),servers=useStore(s=>s.servers);
  const selected=useCommunity(s=>s.selected[me]??''),tags=useCommunity(s=>s.tags),error=useCommunity(s=>s.error);
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false);
  const tag=tags[selected];
  const available=Object.values(tags).filter(tag=>tag.enabled&&servers[tag.server_id]?.members[me]);
  const choose=(id:string|null)=>{setBusy(true);void selectServerTag(id).then(()=>setOpen(false)).catch(error=>toast({tone:'danger',title:t('That didn’t work'),body:describeError(error)})).finally(()=>setBusy(false));};
  return <SettingsSection title={t('Server tag')} className="server-tag-picker"><div className="tag-picker-summary"><span className="tag-picker-icon">{tag?.image?<img src={tag.image} alt=""/>:<Shield size={25}/>}</span><div className="tag-picker-copy"><strong>{tag?.enabled?tag.label:t('None')}</strong>{tag?.enabled&&<p>{servers[selected]?.name}</p>}</div><Button variant="secondary" disabled={!CLOUD} iconRight={<ChevronRight size={16}/>} onClick={()=>{setOpen(true);void refreshCommunity().catch(()=>useCommunity.setState({error:'unavailable'}));}}>{t('Change')}</Button></div>
    <Modal open={open} onClose={()=>setOpen(false)} size="md" title={t('Server tag')} className="tag-picker-dialog">
      {error&&<div className="tag-picker-error" role="alert">{t('Couldn’t load server tags.')}<Button variant="ghost" size="sm" onClick={()=>void refreshCommunity().catch(()=>{})}>{t('Try again')}</Button></div>}
      <div className="tag-picker-options" role="radiogroup" aria-label={t('Choose server')}>
        <button role="radio" aria-checked={!selected} className={!selected?'is-selected':''} disabled={busy} onClick={()=>choose(null)}><span className="tag-option-icon"><X size={22}/></span><span className="grow">{t('None')}</span>{!selected&&<Check size={20}/>}</button>
        {available.map(option=><button role="radio" aria-checked={selected===option.server_id} className={selected===option.server_id?'is-selected':''} key={option.server_id} disabled={busy} onClick={()=>choose(option.server_id)}><span className="tag-option-icon">{option.image?<img src={option.image} alt=""/>:<Shield size={24}/>}</span><span className="tag-option-copy"><strong>{servers[option.server_id].name}</strong><span className="server-tag">{option.label}</span></span>{selected===option.server_id&&<Check size={20}/>}</button>)}
      </div>{!error&&!available.length&&<p className="tag-picker-empty">{t('No server tags available yet.')}</p>}
    </Modal></SettingsSection>;
}
