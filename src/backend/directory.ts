import {useEffect,useRef,useState} from 'react';
import {supabase} from './client';
import {CLOUD} from './config';
import {useStore} from '../store/store';
import {mediaUrl,sourceFromDb} from './media';
import type {BannerSource} from '../types';
export type DirectoryCategory='general'|'gaming'|'music'|'creative'|'technology'|'learning';
export interface DirectoryEntry {id:string;name:string;icon?:string;icon_color:string;banner?:BannerSource;description?:string;verified:boolean;is_official:boolean;category:DirectoryCategory;code:string;members:number;rank?:number;promotion?:'top'|'boost';boost_level?:number}
type Page={rows:DirectoryEntry[];more:boolean;at:number};
const cache=new Map<string,Page>();const lifetime=45000;
export function invalidateDirectory(){cache.clear();window.dispatchEvent(new Event('onyx:directory-change'));}
export function useDirectory(query:string,category:DirectoryCategory|null,offset:number,revision:number){
 const me=useStore(s=>s.meId),key=JSON.stringify([me,query.trim().slice(0,100),category]);
 const [epoch,setEpoch]=useState(0);
 const [state,setState]=useState<{key:string;rows:DirectoryEntry[];busy:boolean;error:boolean;more:boolean}>({key,rows:[],busy:true,error:false,more:false});
 const generation=useRef(0),previousAccount=useRef(me),previousRevision=useRef(revision);
 useEffect(()=>{const refresh=()=>setEpoch(value=>value+1);window.addEventListener('onyx:directory-change',refresh);return()=>window.removeEventListener('onyx:directory-change',refresh);},[]);
 useEffect(()=>{
  if(previousAccount.current!==me){cache.clear();previousAccount.current=me;setState({key,rows:[],busy:true,error:false,more:false});}
  const forced=previousRevision.current!==revision;previousRevision.current=revision;
  const id=++generation.current,controller=new AbortController(),cached=offset===0?cache.get(key):undefined;
  if(cached){cache.delete(key);cache.set(key,cached);setState({key,rows:cached.rows,busy:forced||Date.now()-cached.at>=lifetime,error:false,more:cached.more});if(Date.now()-cached.at<lifetime&&!forced)return()=>controller.abort();}
  else setState(old=>({...old,busy:true,error:false}));
  const timer=setTimeout(async()=>{
   try{
    const result=CLOUD?await supabase().rpc('search_server_directory',{p_query:query.trim().slice(0,100),p_category:category,p_offset:offset}).abortSignal(controller.signal):{data:[],error:null};
    if(controller.signal.aborted||id!==generation.current||useStore.getState().meId!==me)return;
    if(result.error)throw result.error;
    const raw=(result.data??[]) as DirectoryEntry[],rows=raw.slice(0,24).map(row=>({...row,icon:mediaUrl(row.icon),banner:sourceFromDb(row.banner)}));
    const more=raw.length>24;
    if(!offset){cache.set(key,{rows,more,at:Date.now()});while(cache.size>20)cache.delete(cache.keys().next().value!);}
    setState(old=>({key,rows:offset&&old.key===key?[...old.rows,...rows.filter(row=>!old.rows.some(item=>item.id===row.id))]:rows,busy:false,error:false,more}));
   }catch{if(!controller.signal.aborted&&id===generation.current)setState(old=>({...old,busy:false,error:true}));}
  },query?180:0);
  return()=>{clearTimeout(timer);controller.abort();};
 },[me,key,query,category,offset,revision,epoch]);
 const accountMatches=JSON.parse(state.key)[0]===me;
 return accountMatches?state:{key,rows:[],busy:true,error:false,more:false};
}
