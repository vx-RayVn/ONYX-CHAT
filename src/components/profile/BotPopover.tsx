import {useEffect,useState,type ReactElement} from 'react';
import {Popover} from 'radix-ui';
import {supabase} from '../../backend/client';
import {t} from '../../i18n';
import {BotTag} from '../ui/misc';
export function BotPopover({bot,children}:{bot:{id:string;name:string;avatar:string|null};children:ReactElement}){
 const[open,setOpen]=useState(false),[description,setDescription]=useState('');
 useEffect(()=>{if(!open)return;let active=true;void supabase().from('bot_apps').select('description').eq('id',bot.id).maybeSingle().then(({data})=>{if(active)setDescription(data?.description??'');});return()=>{active=false;};},[open,bot.id]);
 return <Popover.Root open={open} onOpenChange={setOpen}><Popover.Trigger asChild>{children}</Popover.Trigger><Popover.Portal><Popover.Content className="popover bot-profile" sideOffset={10} collisionPadding={12}><strong>{bot.name}</strong><BotTag verified={false}/>{description&&<p>{description}</p>}<p>{t('This bot only has access to channels approved by a server manager.')}</p></Popover.Content></Popover.Portal></Popover.Root>;
}
