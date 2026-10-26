import {useEffect,useState} from 'react';
import {CLOUD} from './config';
import {supabase} from './client';
import {useStore} from '../store/store';
import {isUuid} from '../lib/ids';
import {t} from '../i18n';
import type {Activity} from '../types';
import {browserPresenceOf} from './presence';
export interface ActivityDevice {id:string;name:string;last_seen:string|null;created_at:string}
export interface ActivityStatus {enabled:boolean;devices:ActivityDevice[]}
export async function activityRequest(action:string,body:Record<string,unknown>={}):Promise<ActivityStatus>{
 const {data,error}=await supabase().functions.invoke('activity/'+action,{body});
 if(error)throw Error(t('Couldn’t update activity.'));return data;
}
export function useActivityStatus(){
 const [data,setData]=useState<ActivityStatus>({enabled:useStore.getState().settings.showActivity,devices:[]}),[loading,setLoading]=useState(CLOUD),[error,setError]=useState(false);
 useEffect(()=>{if(!CLOUD)return;let alive=true;void activityRequest('status').then(value=>{if(alive){setData(value);useStore.getState().setSetting('showActivity',value.enabled);}}).catch(()=>{if(alive)setError(true);}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};},[]);
 return {data,setData,loading,error,setError};
}
const watched=new Map<string,number>();
let schedule:ReturnType<typeof setTimeout>|undefined;
export function useLiveActivity(userId:string){
 useEffect(()=>{
  if(!CLOUD||!isUuid(userId))return;
  watched.set(userId,(watched.get(userId)??0)+1);clearTimeout(schedule);schedule=setTimeout(()=>void refreshActivities(),150);
  return()=>{const n=(watched.get(userId)??1)-1;if(n)watched.set(userId,n);else watched.delete(userId);};
 },[userId]);
}
let refreshing=false;
export async function refreshActivities(){
 if(!CLOUD||document.hidden||refreshing||!isUuid(useStore.getState().meId))return;
 refreshing=true;const owner=useStore.getState().meId;
 try{
  useStore.setState(state=>{for(const user of Object.values(state.users))if(user.activity?.expiresAt&&user.activity.expiresAt<=Date.now()){const native=user.activity.source==='desktop';user.activity=undefined;if(native&&user.id!==state.meId)user.status=browserPresenceOf(user.id);}});
  const ids=[...watched.keys()];
  for(let i=0;i<ids.length;i+=100){
   const batch=ids.slice(i,i+100),{data,error}=await supabase().from('game_activities').select('user_id,source,title,game_key,since,timing,expires_at,artwork_hash').in('user_id',batch);
   if(error||useStore.getState().meId!==owner)continue;
   const rows=new Map((data??[]).map(row=>[row.user_id,row]));
   useStore.setState(state=>{for(const id of batch){const user=state.users[id];if(!user)continue;const row=rows.get(id);
    const native=user.activity?.source==='desktop';
    user.activity=row&&Date.parse(row.expires_at)>Date.now()?{type:'playing',name:row.title,source:row.source,gameKey:row.game_key,artworkHash:row.artwork_hash??undefined,since:Date.parse(row.since),timing:row.timing,expiresAt:Date.parse(row.expires_at)}:undefined;
    if(id!==state.meId){if(user.activity?.source==='desktop')user.status=user.accountStatus??'online';else if(native)user.status=browserPresenceOf(id);}
   }});
  }
 }finally{refreshing=false;}
}
export function currentActivity(activity:Activity|undefined){return activity&&(!activity.expiresAt||activity.expiresAt>Date.now())?activity:undefined;}

// Icons are loaded only for an opened profile, never with member-list heartbeats.
const artworkCache=new Map<string,string>(),artworkPending=new Map<string,Promise<string|undefined>>();
export function useGameArtwork(userId:string,hash:string|undefined){
 const owner=useStore(s=>s.meId),cacheKey=owner+':'+userId+':'+hash;
 const [loaded,setLoaded]=useState<{key:string;url:string}>();
 useEffect(()=>{
  if(!CLOUD||!isUuid(userId)||!hash||!/^[a-f0-9]{32}$/.test(hash))return;
  let alive=true;
  if(!artworkCache.has(cacheKey)&&!artworkPending.has(cacheKey)){
   const pending=(async()=>{
    const {data,error}=await supabase().from('game_activities').select('artwork_png').eq('user_id',userId).eq('artwork_hash',hash).maybeSingle();
    const png=data?.artwork_png;if(error||typeof png!=='string'||png.length>43692||!/^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(png))return;
    const url='data:image/png;base64,'+png;if(artworkCache.size>=64)artworkCache.delete(artworkCache.keys().next().value!);artworkCache.set(cacheKey,url);return url;
   })().catch(()=>undefined).finally(()=>artworkPending.delete(cacheKey));artworkPending.set(cacheKey,pending);
  }
  void Promise.resolve(artworkCache.get(cacheKey)??artworkPending.get(cacheKey)).then(url=>{if(alive&&url&&useStore.getState().meId===owner)setLoaded({key:cacheKey,url});});
  return()=>{alive=false;};
 },[cacheKey,userId,hash,owner]);
 return loaded?.key===cacheKey?loaded.url:undefined;
}
