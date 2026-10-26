import {useState} from 'react';
import {ExternalLink,Link2,Unlink} from 'lucide-react';
import {t} from '../../i18n';
import {useStore} from '../../store/store';
import {toast} from '../../store/ui';
import {BRAND_LOGOS} from '../../data/brandLogos';
import {connectionURL,type ConnectionProvider} from '../../lib/socialConnections';
import {useProfileConnections,useConnectionProviders,startConnection,disconnectConnection,setConnectionVisibility} from '../../backend/connections';
import {Button} from '../ui/Button';
import {Switch} from '../ui/Field';
import {SettingsHeader} from './SettingsLayout';
import {ActivitySettings} from './ActivitySettings';

export function ConnectionsSettings(){
 const me=useStore(s=>s.meId),connections=useProfileConnections(me),providers=useConnectionProviders();
 const [busy,setBusy]=useState<string|null>(null);
 const act=async(provider:string,work:()=>Promise<unknown>)=>{
  setBusy(provider);try{await work();connections.refresh();}catch(error){toast({tone:'danger',title:t('Couldn’t update connection'),body:error instanceof Error?error.message:t('Try again in a moment.')});}finally{setBusy(null);}
 };
 return <><SettingsHeader title={t('Connections')}/>
  {(connections.error||providers.error)&&<div className="connections-retry"><Button variant="secondary" onClick={()=>{connections.refresh();providers.refresh();}}>{t('Try again')}</Button></div>}
  <div className="connections-grid">{BRAND_LOGOS.map(brand=>{
   const item=connections.items.find(item=>item.provider===brand.id),provider=brand.id as ConnectionProvider,href=item?connectionURL(item):null;
   return <article className={`connection-card${item?' is-connected':''}`} key={brand.id}>
    <div className="connection"><span className={`connection-logo is-${brand.id}`} style={{['--brand' as string]:brand.color}}><svg viewBox="0 0 24 24" aria-hidden>{brand.id==='youtube'&&<path d="M9.2 8 L16.4 12 L9.2 16Z" fill="#fff"/>}<path d={brand.path}/></svg></span>
     <div className="connection-identity"><strong>{brand.name}</strong>{item&&(href?<a href={href} title={item.display_name??(item.provider==='steam'?t('Steam account'):item.external_id)} target="_blank" rel="noopener noreferrer"><span className="connection-account-name">{item.display_name??(item.provider==='steam'?t('Steam account'):item.external_id)}</span><ExternalLink size={12}/></a>:<span className="connection-account-name">{item.display_name??(item.provider==='steam'?t('Steam account'):item.external_id)}</span>)}</div>
     <Button size="sm" variant="secondary" loading={busy===brand.id} icon={item?<Unlink size={15}/>:<Link2 size={15}/>} disabled={!!busy||connections.loading||connections.error||(!item&&(providers.loading||providers.error||!providers.available[brand.id]))} aria-label={t(item?'Disconnect {provider}':'Connect {provider}',{provider:brand.name})} onClick={()=>void act(brand.id,()=>item?disconnectConnection(provider):startConnection(provider))}>
      {item?t('Disconnect'):providers.loading?t('Checking …'):providers.available[brand.id]?t('Connect'):t('Unavailable')}
     </Button>
    </div>
    {item&&<div className="connection-visibility"><span>{t('Display on profile')}</span><Switch checked={item.is_visible} disabled={!!busy} label={t('Display {provider} on profile',{provider:brand.name})} onChange={visible=>void act(brand.id,()=>setConnectionVisibility(me,provider,visible))}/></div>}
   </article>;
  })}</div>
  <ActivitySettings/>
 </>;
}
