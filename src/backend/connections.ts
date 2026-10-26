import {useCallback,useEffect,useState} from 'react';
import {FunctionsHttpError} from '@supabase/supabase-js';
import {CLOUD,SUPABASE_URL} from './config';
import {supabase} from './client';
import {useStore} from '../store/store';
import {isUuid} from '../lib/ids';
import {t} from '../i18n';
import type {ConnectionProvider,ProfileConnection} from '../lib/socialConnections';
export type {ProfileConnection} from '../lib/socialConnections';

const changed=()=>window.dispatchEvent(new Event('onyx:connections'));
export function useProfileConnections(userId:string){
 const [items,setItems]=useState<ProfileConnection[]>([]),[loadedFor,setLoadedFor]=useState(''),[error,setError]=useState(false),[loading,setLoading]=useState(CLOUD),[revision,setRevision]=useState(0);
 const refresh=useCallback(()=>setRevision(n=>n+1),[]);
 useEffect(()=>{window.addEventListener('onyx:connections',refresh);return()=>window.removeEventListener('onyx:connections',refresh);},[refresh]);
 useEffect(()=>{
  let alive=true;const canQuery=CLOUD&&isUuid(userId);setError(false);setLoading(canQuery);
  if(!canQuery)setItems([]);
  if(canQuery)void supabase().from('profile_connections').select('user_id,provider,external_id,display_name,profile_handle,is_visible').eq('user_id',userId).then(({data,error})=>{
   if(!alive)return;setError(!!error);setLoading(false);if(!error){setItems((data??[]) as ProfileConnection[]);setLoadedFor(userId);}
  });
  return()=>{alive=false;};
 },[userId,revision]);
 return {items:loadedFor===userId?items:[],error,loading,refresh};
}
export function useConnectionProviders(){
 const [available,setAvailable]=useState<Record<string,boolean>>({}),[loading,setLoading]=useState(CLOUD),[error,setError]=useState(false),[revision,setRevision]=useState(0);
 const refresh=useCallback(()=>setRevision(n=>n+1),[]);
 useEffect(()=>{
  if(!CLOUD)return;let alive=true;setLoading(true);setError(false);
  void fetch(SUPABASE_URL+'/functions/v1/connections/providers',{cache:'no-store',signal:AbortSignal.timeout(10000)}).then(async response=>{
   if(!response.ok)throw Error('unavailable');const body=await response.json();if(!Array.isArray(body.providers))throw Error('unavailable');
   if(alive)setAvailable(Object.fromEntries(body.providers.map((row:{id:string;available:boolean})=>[row.id,row.available===true])));
  }).catch(()=>{if(alive)setError(true);}).finally(()=>{if(alive)setLoading(false);});
  return()=>{alive=false;};
 },[revision]);
 return {available,loading,error,refresh};
}
async function invoke(body:Record<string,unknown>){
 const {data,error}=await supabase().functions.invoke('connections',{body});
 if(error){let code='';if(error instanceof FunctionsHttpError)try{code=(await error.context.json()).error;}catch{/* No provider details or tokens in errors. */}
  const message=code==='connection_taken'?t('This account is already connected to another ONYX account.'):code==='provider_unavailable'?t('This connection is currently unavailable.'):code==='connection_expired'?t('The connection expired. Please start again.'):code==='rate_limited'?t('Please wait a moment before connecting again.'):t('Couldn’t update connection');
  throw Error(message);
 }
 return data;
}
interface Pending {binding:string;user:string;provider:ConnectionProvider;at:number}
const key=(state:string)=>'onyx:connection:'+state;
const secret=()=>btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const valid=(value:unknown):value is string=>typeof value==='string'&&value.length===43&&/^[A-Za-z0-9_-]+$/.test(value);
const authorizationOrigins:Record<ConnectionProvider,string>={steam:'https://steamcommunity.com',twitch:'https://id.twitch.tv',youtube:'https://accounts.google.com',spotify:'https://accounts.spotify.com',epic:'https://www.epicgames.com',xbox:'https://login.microsoftonline.com',riot:'https://auth.riotgames.com'};
export async function startConnection(provider:ConnectionProvider){
 const binding=secret(),user=useStore.getState().meId;
 try{sessionStorage.setItem('onyx:connection:storage-test','1');sessionStorage.removeItem('onyx:connection:storage-test');}catch{throw Error(t('Allow session storage to connect accounts.'));}
 const data=await invoke({action:'start',provider,origin:location.origin,binding,site_callback:true});
 const url=new URL(data?.url);
 if(url.origin!==authorizationOrigins[provider]||!valid(data?.state))throw Error(t('Couldn’t update connection'));
 const pending:Pending={binding,user,provider,at:Date.now()};
 sessionStorage.setItem(key(data.state),JSON.stringify(pending));
 location.assign(url.toString());
}
export async function finishConnection(fragment:string){
 const params=new URLSearchParams(fragment.replace(/^#/,'')),state=params.get('state'),receipt=params.get('receipt');
 if(params.get('connection')!=='finish'||!valid(state)||!valid(receipt))throw Error(t('The connection expired. Please start again.'));
 let pending:Pending|null=null;
 try{pending=JSON.parse(sessionStorage.getItem(key(state))??'null');}catch{/* A callback in another browser has no proof of initiation. */}
 if(!pending||pending.user!==useStore.getState().meId||!valid(pending.binding)||Date.now()-pending.at>600000)throw Error(t('Return to the browser where you started connecting.'));
 try{const result=await invoke({action:'finish',state,receipt,binding:pending.binding});changed();return result.provider as ConnectionProvider;}
 finally{sessionStorage.removeItem(key(state));}
}
export async function setConnectionVisibility(userId:string,provider:ConnectionProvider,visible:boolean){
 const {error}=await supabase().from('profile_connections').update({is_visible:visible}).eq('user_id',userId).eq('provider',provider).select('provider').single();
 if(error)throw error;changed();
}
export async function disconnectConnection(provider:ConnectionProvider){await invoke({action:'disconnect',provider});changed();}
