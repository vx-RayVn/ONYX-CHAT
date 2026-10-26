import {useEffect,useState} from 'react';
import {t} from '../../i18n';
import {CLOUD} from '../../backend/config';
import {botApps,botInstalls,createBot,updateBot,deleteBot,revokeBot,approveBot,installBot,removeBot,type BotApp,type BotInstall} from '../../backend/bots';
import {ImageInput} from './CommunitySettings';
import {useStore} from '../../store/store';
import {canServer} from '../../store/selectors';
import {toast,useUI} from '../../store/ui';
import {describeError} from '../../backend/queue';
import {copyText} from '../../lib/utils';
import {Button} from '../ui/Button';
import {TextField} from '../ui/Field';
import {SettingsHeader,SettingsSection} from './SettingsLayout';

export function DeveloperSettings(){
 const me=useStore(s=>s.meId),servers=useStore(s=>s.servers),channels=useStore(s=>s.channels);
 const [apps,setApps]=useState<BotApp[]>([]),[installs,setInstalls]=useState<BotInstall[]>([]),[name,setName]=useState(''),[code,setCode]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[selected,setSelected]=useState(()=>{const view=useUI.getState().settings;return view?.kind==='user'?view.tab??'':'';}),[server,setServer]=useState(''),[allowed,setAllowed]=useState<string[]>([]);
 const load=async()=>{if(!CLOUD)return;const[a,i]=await Promise.all([botApps(),botInstalls()]);setApps(a);setInstalls(i);};
 useEffect(()=>{void load().catch(e=>setError(describeError(e)));},[me]);
 const run=(job:()=>Promise<unknown>)=>{setBusy(true);setError('');void job().then(load).catch(e=>setError(describeError(e))).finally(()=>setBusy(false));};
 const copy=(text:string)=>void copyText(text).then(()=>toast({title:t('Copied')})).catch(()=>toast({tone:'danger',title:t('Copy failed')}));
 const existing=installs.some(i=>i.bot_id===selected&&i.server_id===server);
 return <><SettingsHeader title={t('Developer')} description={t('Create real bots, approve their connection and choose exactly which channels they can use.')}/>
 {!CLOUD&&<p>{t('This feature needs an ONYX account.')}</p>}{error&&<p role="alert" className="report-error">{error}</p>}
 <SettingsSection title={t('Your bots')}><div className="community-editor"><TextField label={t('Name')} value={name} maxLength={32} onChange={e=>setName(e.target.value)}/><Button disabled={!CLOUD||name.trim().length<2} loading={busy} onClick={()=>run(async()=>{await createBot(name);setName('');})}>{t('Create bot')}</Button></div>
 <div className="developer-bots">{apps.filter(a=>a.owner_id===me).map(app=><article key={app.id}><strong>{app.name}</strong><code>{app.id}</code><div className="row-actions"><Button size="sm" onClick={()=>copy(`node onyx-bot.mjs ${app.id}`)}>{t('Copy start command')}</Button><Button size="sm" onClick={()=>copy(`https://onyxchat.site/?developer=1&bot=${app.id}`)}>{t('Copy install link')}</Button><Button size="sm" variant="secondary" onClick={()=>run(()=>revokeBot(app.id))}>{t('Revoke bot access')}</Button><Button size="sm" variant="danger-ghost" onClick={()=>useUI.getState().openModal({type:'confirm',title:t('Delete bot'),body:t('This removes the bot, its installations and access.'),confirmLabel:t('Delete'),danger:true,onConfirm:()=>run(()=>deleteBot(app.id))})}>{t('Delete')}</Button></div><BotEditor app={app} onSave={run}/></article>)}</div></SettingsSection>
 <SettingsSection title={t('Approve bot connection')} description={t('Only approve a code shown by your own bot process. Access tokens are delivered to the bot, never to this browser.')}><div className="community-editor"><TextField label={t('Pairing code')} value={code} maxLength={10} onChange={e=>setCode(e.target.value.toUpperCase())}/><Button disabled={!/^[A-F0-9]{10}$/.test(code)||busy} onClick={()=>run(async()=>{const botName=await approveBot(code);setCode('');toast({tone:'success',title:t('Bot connected'),body:botName});})}>{t('Approve')}</Button></div></SettingsSection>
 <SettingsSection title={t('Install bot')} description={t('Only server managers can install bots. Bots can send messages and receive invoked commands in selected text channels; they cannot read chat history.')}><div className="community-editor">
 <select className="community-select" aria-label={t('Bot')} value={selected} onChange={e=>{setSelected(e.target.value);setAllowed(installs.find(i=>i.bot_id===e.target.value&&i.server_id===server)?.channel_ids??[]);}}><option value="">{t('Choose bot')}</option>{apps.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select>
 <select className="community-select" aria-label={t('Server')} value={server} onChange={e=>{setServer(e.target.value);setAllowed(installs.find(i=>i.bot_id===selected&&i.server_id===e.target.value)?.channel_ids??[]);}}><option value="">{t('Choose server')}</option>{Object.values(servers).filter(s=>canServer(useStore.getState(),s.id,'manageServer')).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
 {Object.values(channels).filter(c=>c.serverId===server&&c.type==='text').map(c=><label className="community-check" key={c.id}><input type="checkbox" checked={allowed.includes(c.id)} onChange={e=>setAllowed(e.target.checked?[...allowed,c.id]:allowed.filter(id=>id!==c.id))}/>#{c.name}</label>)}
 <div className="row-actions"><Button disabled={!selected||!server||!allowed.length||busy} onClick={()=>run(()=>installBot(selected,server,allowed,existing))}>{t('Save')}</Button>{existing&&<Button variant="danger-ghost" disabled={busy} onClick={()=>run(()=>removeBot(selected,server))}>{t('Remove bot')}</Button>}</div></div></SettingsSection>
 <SettingsSection title={t('Bot API')}><p>{t('Run bots on your own server or computer. ONYX does not host their code. The example worker and API documentation are included in the project.')}</p><a href="/developers" target="_blank" rel="noopener noreferrer" className="link-btn">{t('Developer documentation')}</a></SettingsSection></>;
}

function BotEditor({app,onSave}:{app:BotApp;onSave:(job:()=>Promise<unknown>)=>void}){
 const[name,setName]=useState(app.name),[description,setDescription]=useState(app.description),[avatar,setAvatar]=useState(app.avatar);
 return <details className="bot-editor"><summary>{t('Edit')}</summary><div className="community-editor"><TextField label={t('Name')} maxLength={32} value={name} onChange={e=>setName(e.target.value)}/><TextField label={t('Description')} maxLength={300} value={description} onChange={e=>setDescription(e.target.value)}/><ImageInput value={avatar} onChange={setAvatar}/><Button disabled={name.trim().length<2} onClick={()=>onSave(()=>updateBot(app.id,{name:name.trim(),description,avatar}))}>{t('Save')}</Button></div></details>;
}
