import {useEffect,useState} from 'react';
import {t} from '../../i18n';
import {CLOUD} from '../../backend/config';
import {botApps,botInstalls,dispatchBot} from '../../backend/bots';
import {describeError} from '../../backend/queue';
import {toast} from '../../store/ui';
import {supabase} from '../../backend/client';
import {Button} from '../ui/Button';

const catalog=new Map<string,{bot:string;name:string;label:string}[]>();
export function matchingBotCommands(channel:string,name:string){return (catalog.get(channel)??[]).filter(c=>c.name===name);}

export function BotCommands({channelId}:{channelId:string}){
 const[commands,setCommands]=useState<{bot:string;name:string;label:string}[]>([]),[selected,setSelected]=useState(''),[args,setArgs]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{
  if(!CLOUD)return;let active=true;
  const load=()=>void Promise.all([botApps(),botInstalls()]).then(([apps,installs])=>{if(active){const list=apps.flatMap(app=>installs.some(i=>i.bot_id===app.id&&i.channel_ids.includes(channelId))?app.commands.map(c=>({bot:app.id,name:c.name,label:`/${c.name} · ${app.name}`})):[]);setCommands(list);catalog.set(channelId,list);}}).catch(()=>{if(active){setCommands([]);catalog.delete(channelId);}});
  load();const ch=supabase().channel(`bot-commands:${channelId}`).on('postgres_changes',{event:'*',schema:'public',table:'bot_apps'},load).on('postgres_changes',{event:'*',schema:'public',table:'bot_installs'},load).subscribe(status=>{if(status==='SUBSCRIBED')load();});
  return()=>{active=false;catalog.delete(channelId);void supabase().removeChannel(ch);};
 },[channelId]);
 if(!commands.length)return null;
 return <details className="bot-command-panel"><summary>{t('Bot commands')}</summary><div className="bot-command-form"><select className="community-select" aria-label={t('Bot commands')} value={selected} onChange={e=>setSelected(e.target.value)}><option value="">{t('Choose command')}</option>{commands.map(c=><option key={`${c.bot}:${c.name}`} value={`${c.bot}:${c.name}`}>{c.label}</option>)}</select><input className="community-select" value={args} maxLength={2000} placeholder={t('Arguments')} aria-label={t('Arguments')} onChange={e=>setArgs(e.target.value)}/><Button disabled={!selected||busy} loading={busy} onClick={()=>{const[bot,command]=selected.split(':');if(!commands.some(c=>c.bot===bot&&c.name===command))return;setBusy(true);void dispatchBot(bot,channelId,command,args).then(()=>{setArgs('');toast({title:t('Command sent')});}).catch(e=>toast({tone:'danger',title:t('That didn’t work'),body:describeError(e)})).finally(()=>setBusy(false));}}>{t('Send')}</Button></div></details>;
}
