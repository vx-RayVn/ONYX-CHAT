import {useEffect,useRef} from 'react';
import {useStore} from '../store/store';
import {dmTitle} from '../store/selectors';
import {t} from '../i18n';
type View=ReturnType<typeof useStore.getState>['view'];
const key=(view:View)=>JSON.stringify(view);
/** Display values and local view history only; no filesystem/authentication commands. */
export function useDesktopChrome(){
  const view=useStore(s=>s.view),theme=useStore(s=>s.settings.theme),language=useStore(s=>s.settings.language),me=useStore(s=>s.meId);
  const context=useStore(s=>s.view.kind==='server'?s.servers[s.view.serverId]?.name:s.view.kind==='dm'&&s.dms[s.view.dmId]?dmTitle(s,s.dms[s.view.dmId]):'');
  const history=useRef({me,items:[view],index:0});
  useEffect(()=>()=>{
    const host=(window as unknown as {chrome?:{webview?:{postMessage:(message:unknown)=>void}}}).chrome?.webview;
    if(host){const css=getComputedStyle(document.documentElement);host.postMessage({type:'onyx:chrome',background:css.getPropertyValue('--bg-main').trim(),foreground:css.getPropertyValue('--text').trim(),title:'',canBack:false,canForward:false});}
  },[me]);
  useEffect(()=>{
    const host=(window as unknown as {chrome?:{webview?:{postMessage:(message:unknown)=>void;addEventListener:(type:string,cb:(e:MessageEvent)=>void)=>void;removeEventListener:(type:string,cb:(e:MessageEvent)=>void)=>void}}}).chrome?.webview;
    if(!host)return;
    if(history.current.me!==me)history.current={me,items:[view],index:0};
    const h=history.current;
    if(key(h.items[h.index])!==key(view)){h.items=h.items.slice(0,h.index+1);h.items.push(view);if(h.items.length>80)h.items.shift();h.index=h.items.length-1;}
    const post=()=>{
      const css=getComputedStyle(document.documentElement);
      const title=view.kind==='home'?({friends:t('Friends'),discover:t('Discover'),shop:'OnyxServices',plus:'ONYX Plus',supporters:t('Supporter wall')}[view.page]):context;
      host.postMessage({type:'onyx:chrome',background:css.getPropertyValue('--bg-main').trim(),foreground:css.getPropertyValue('--text').trim(),title:(title??'').slice(0,100),canBack:h.index>0,canForward:h.index<h.items.length-1});
    };
    const navigate=(e:MessageEvent)=>{
      if(e.data?.type!=='onyx:navigate'||!['back','forward'].includes(e.data.direction))return;
      const step=e.data.direction==='back'?-1:1,s=useStore.getState();
      if(s.meId!==h.me)return;
      for(let index=h.index+step;index>=0&&index<h.items.length;index+=step){
        const target=h.items[index];
        if(target.kind==='server'&&(!s.servers[target.serverId]||(target.channelId&&!s.channels[target.channelId])))continue;
        if(target.kind==='dm'&&!s.dms[target.dmId])continue;
        h.index=index;
        if(target.kind==='home')s.goHome(target.page);
        else if(target.kind==='dm')s.openDM(target.dmId);
        else if(target.channelId)s.selectChannel(target.serverId,target.channelId);
        else s.selectServer(target.serverId);
        post();break;
      }
    };
    const frame=requestAnimationFrame(post);
    const observer=new MutationObserver(post);observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','style']});
    host.addEventListener('message',navigate);
    return()=>{cancelAnimationFrame(frame);observer.disconnect();host.removeEventListener('message',navigate);};
  },[view,context,theme,language,me]);
}
