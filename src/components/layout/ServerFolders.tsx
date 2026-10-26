import {useState} from 'react';
import {Folder, FolderOpen, FolderPlus, MoreHorizontal} from 'lucide-react';
import {useShallow} from 'zustand/react/shallow';
import {useStore} from '../../store/store';
import {useUI} from '../../store/ui';
import {serverUnread} from '../../store/selectors';
import {FOLDER_COLORS, moveToFolder, type ServerFolder} from '../../lib/serverFolders';
import {uid,cn} from '../../lib/utils';
import {t} from '../../i18n';
import {ContextMenu,Dropdown,type MenuSpec} from '../ui/Menu';
import {Tooltip} from '../ui/Tooltip';
import {RailServer,ServerIcon} from './ServerRail';
import {useVoiceActivity} from '../../backend/voiceActivity';

function save(folders:ServerFolder[]){useStore.getState().setServerFolders(folders);}
function createFolder(ids:string[]){
  useUI.getState().openModal({type:'prompt',title:t('Create folder'),label:t('Folder name'),initial:t('Server folder'),maxLength:40,confirmLabel:t('Create folder'),onSubmit:name=>{
    const s=useStore.getState();save([...s.serverFolders.map(f=>({...f,serverIds:f.serverIds.filter(id=>!ids.includes(id))})),{id:uid('folder_'),name,color:FOLDER_COLORS[0],serverIds:ids}]);
  }});
}
export function folderDrop(source:string,target:string){
  if(source===target)return;
  const s=useStore.getState(),folder=s.serverFolders.find(f=>f.serverIds.includes(target));
  if(folder)save(moveToFolder(s.serverFolders,source,folder.id));else createFolder([target,source]);
}
export function folderMenuItems(serverId:string):MenuSpec{
  const {serverFolders:folders}=useStore.getState(),current=folders.find(f=>f.serverIds.includes(serverId));
  return [{type:'sub',label:t('Server folders'),icon:<Folder/>,items:[
    {label:t('Create folder'),icon:<FolderPlus/>,onSelect:()=>createFolder([serverId])},
    ...folders.filter(f=>f.id!==current?.id).map(f=>({label:f.name||t('Server folder'),onSelect:()=>save(moveToFolder(useStore.getState().serverFolders,serverId,f.id))})),
    current&&{label:t('Remove from folder'),onSelect:()=>save(moveToFolder(useStore.getState().serverFolders,serverId,null))},
  ]},{type:'separator'}];
}
export function FolderGroup({folder,...drag}:{folder:ServerFolder;dragIndex:number|null;setDragIndex:(i:number|null)=>void;dropIndex:number|null;setDropIndex:(i:number|null)=>void}){
  const [open,setOpen]=useState(false),servers=useStore(s=>s.servers),order=useStore(s=>s.serverOrder);
  const active=useStore(s=>s.view.kind==='server'&&folder.serverIds.includes(s.view.serverId));
  const showBadges=useStore(s=>s.settings.showUnreadBadges);
  const [unread,mentions]=useStore(useShallow(s=>folder.serverIds.reduce((a,id)=>{const u=serverUnread(s,id);return [a[0]+(u.muted?0:(u.unread?1:0)),a[1]+(u.muted?0:u.mentions)];},[0,0])));
  const live=useVoiceActivity(s=>folder.serverIds.some(id=>!!s.active[id]));
  const selfVoice=useStore(s=>!!s.voiceSelf.channelId&&folder.serverIds.includes(s.channels[s.voiceSelf.channelId]?.serverId));
  const list=folder.serverIds.filter(id=>servers[id]).sort((a,b)=>order.indexOf(a)-order.indexOf(b));
  const update=(patch:Partial<ServerFolder>)=>save(useStore.getState().serverFolders.map(f=>f.id===folder.id?{...f,...patch}:f));
  const menu=():MenuSpec=>[
    {label:t('Rename folder'),onSelect:()=>useUI.getState().openModal({type:'prompt',title:t('Rename folder'),label:t('Folder name'),initial:folder.name,maxLength:40,confirmLabel:t('Save'),onSubmit:name=>update({name})})},
    {type:'sub',label:t('Folder color'),items:FOLDER_COLORS.map((color,i)=>({type:'check',label:t('Color {number}',{number:i+1}),color,checked:color===folder.color,onSelect:()=>update({color})}))},
    {label:t('Mark as read'),onSelect:()=>{for(const id of list)useStore.getState().markServerRead(id);}},
    {type:'separator'},
    {label:t('Dissolve folder'),onSelect:()=>save(useStore.getState().serverFolders.filter(f=>f.id!==folder.id))},
  ];
  return <div className={cn('rail-folder',open&&'is-open')} style={{'--folder-color':folder.color} as React.CSSProperties}>
    <div className={cn('rail-item',active&&'is-active',showBadges&&unread>0&&'is-unread')} onDragOver={e=>{if(drag.dragIndex!==null){e.preventDefault();e.dataTransfer.dropEffect='move';}}} onDrop={e=>{e.preventDefault();e.stopPropagation();if(drag.dragIndex!==null){const s=useStore.getState(),id=e.dataTransfer.getData('text/plain');if(s.servers[id]){save(moveToFolder(s.serverFolders,id,folder.id));setOpen(true);}}drag.setDragIndex(null);drag.setDropIndex(null);}}>
      <span className="rail-pill"/>
      <ContextMenu items={menu}><span className="rail-context"><Tooltip side="right" content={folder.name||t('Server folder')} delay={0}>
        <button className="rail-btn folder-toggle" aria-label={folder.name||t('Server folder')} aria-expanded={open} onClick={()=>setOpen(!open)}>
          {open?<FolderOpen size={27}/>:<span className="folder-mini">{list.slice(0,4).map(id=><ServerIcon key={id} server={servers[id]} size={18}/>)}</span>}
          {showBadges&&mentions>0&&<span className="rail-badge">{mentions>99?'99+':mentions}</span>}
          {(live||selfVoice)&&<span className="folder-live"/>}
        </button>
      </Tooltip></span></ContextMenu>
    </div>
    {open&&<><Dropdown items={menu()} trigger={<button className="folder-options" aria-label={t('Folder settings')}><MoreHorizontal size={17}/></button>}/><div className="folder-servers">{list.map(id=><RailServer key={id} server={servers[id]} index={order.indexOf(id)} {...drag}/>)}</div></>}
  </div>;
}
