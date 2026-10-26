import {useEffect,useState,useRef} from 'react';
import {CLOUD} from './config';
import {supabase} from './client';
import {useStore} from '../store/store';
import defaults from '../config/commerce.json';
export type Product={sku:string;amount:number;days:number;level:number;kind:string};
export type Catalog={products:Product[];ready:boolean;mode:'live'|'test'|'unavailable';topAvailable:number|null};
export type BillingStatus={legacy:boolean;listed:boolean;category?:string;rank?:number|null;projections?:Record<string,number>;listedCount?:number;rankCheckedAt?:string;pendingActivation?:number;subscription:null|{state:string;until:string|null;cancelAtEnd:boolean};promotions:{sku:string;kind:string;endsAt:string}[]};
export async function billingAction(data:Record<string,unknown>){
 if(!CLOUD)throw Error('payments unavailable');
 for(let attempt=0;attempt<2;attempt++){
  const result=await supabase().functions.invoke('billing',{body:data});if(!result.error&&!result.data?.error)return result.data;
  const context=result.error?.context instanceof Response?result.error.context:null;
  const payload=context?await context.clone().json().catch(()=>null):result.data;
  const code=['checkout_in_progress','promotion_active'].includes(payload?.error)?payload.error:'billing_unavailable';
  if(data.action==='checkout'&&attempt===0&&code==='billing_unavailable'&&(!context||context.status>=500)){await new Promise(resolve=>setTimeout(resolve,350));continue;}
  throw Error(code);
 }
 throw Error('billing_unavailable');
}
export function billingErrorKey(error:unknown){return error instanceof Error&&error.message==='checkout_in_progress'?'A checkout is already in progress. Please wait.':error instanceof Error&&error.message==='promotion_active'?'This promotion or subscription is already active.':'Payment could not be started.';}
const checkouts=new Map<string,{key:string;operation:Promise<void>}>();
export function openCheckout(sku:string,serverId?:string,showSupporter=false){
 const me=useStore.getState().meId,key=JSON.stringify([sku,serverId,showSupporter]);const current=checkouts.get(me);if(current)return current.key===key?current.operation:Promise.reject(Error('checkout_in_progress'));
 const operation=(async()=>{
  const data=await billingAction({action:'checkout',sku,serverId,showSupporter});
  if(useStore.getState().meId!==me)throw Error('account changed');
  const url=new URL(data.url);if(url.protocol!=='https:'||url.hostname!=='checkout.stripe.com'||url.username||url.password||url.port)throw Error('invalid checkout');
  window.location.assign(url.href);
 })().finally(()=>{if(checkouts.get(me)?.operation===operation)checkouts.delete(me);});checkouts.set(me,{key,operation});return operation;
}
export function useBilling(serverId?:string){
 const me=useStore(s=>s.meId),[revision,setRevision]=useState(0);
 const identity=JSON.stringify([me,serverId]),loaded=useRef<string|null>(null);
 const [catalog,setCatalog]=useState<Catalog>({products:defaults.products,ready:false,mode:'unavailable',topAvailable:null}),[status,setStatus]=useState<BillingStatus|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(false);
 useEffect(()=>{
  let stopped=false;setLoading(loaded.current!==identity);setError(false);if(loaded.current!==identity)setStatus(null);
  if(!CLOUD){loaded.current=identity;setLoading(false);return;}
  void (async()=>{try{
   const [publicResult,own]=await Promise.all([supabase().functions.invoke('billing',{method:'GET'}),billingAction({action:'status',serverId})]);
   if(stopped||useStore.getState().meId!==me)return;
   if(publicResult.error||!Array.isArray(publicResult.data?.products))throw Error();
   loaded.current=identity;setCatalog(publicResult.data);setStatus(own);
  }catch{if(!stopped){setError(true);setCatalog(c=>({...c,ready:false,mode:'unavailable',topAvailable:null}));}}finally{if(!stopped)setLoading(false);}})();
  const focus=()=>{if(!document.hidden)setRevision(r=>r+1);};window.addEventListener('focus',focus);
  return()=>{stopped=true;window.removeEventListener('focus',focus);};
 },[me,serverId,revision]);
 return {catalog:loaded.current===identity?catalog:{...catalog,ready:false},status:loaded.current===identity?status:null,loading:loading||CLOUD&&!error&&loaded.current!==identity,error,refresh:()=>setRevision(r=>r+1)};
}
