import {useEffect,useRef} from 'react';
import {CLOUD,SUPABASE_URL,SUPABASE_KEY} from '../../backend/config';
import {getLanguage,t} from '../../i18n';
type WidgetApi={render:(node:HTMLElement,options:Record<string,unknown>)=>string;execute:(id:string)=>void;remove:(id:string)=>void};
declare global{interface Window{turnstile?:WidgetApi}}
let configuration:Promise<string>|undefined,script:Promise<WidgetApi>|undefined;
const TEST_KEY=/^[123]x0{10,}/;
async function siteKey(){
 if(!configuration)configuration=fetch(`${SUPABASE_URL}/functions/v1/auth-entry-config`,{headers:{apikey:SUPABASE_KEY},credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(8000)})
  .then(async response=>{if(!response.ok)throw Error('captcha_unavailable');const value=await response.json();if(typeof value.siteKey!=='string'||!/^0x[A-Za-z0-9_-]{15,80}$/.test(value.siteKey)||TEST_KEY.test(value.siteKey))throw Error('captcha_unavailable');return value.siteKey as string;})
  .catch(error=>{configuration=undefined;throw error;});
 return configuration;
}
function loadScript(){
 if(window.turnstile)return Promise.resolve(window.turnstile);
 if(!script)script=new Promise<WidgetApi>((resolve,reject)=>{
  const node=document.createElement('script');node.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';node.async=true;node.defer=true;
  const timeout=setTimeout(()=>{node.remove();reject(Error('captcha_unavailable'));},15000);
  node.onload=()=>{clearTimeout(timeout);if(window.turnstile)resolve(window.turnstile);else reject(Error('captcha_unavailable'));};node.onerror=()=>{clearTimeout(timeout);node.remove();reject(Error('captcha_unavailable'));};document.head.append(node);
 }).catch(error=>{script=undefined;throw error;});
 return script;
}
export function captchaError(error:unknown){const message=(error as Error)?.message||'';return /captcha|challenge|timeout|abort/i.test(message)?t('The security check could not be completed. Please try again.'):'';}
export function requireCaptcha(token?:string){if(CLOUD&&!token)throw Error('captcha_required');return token;}

/** One execution and one token per Auth request. Nothing is cached between submits. */
export function useCaptcha(){
 const host=useRef<HTMLDivElement>(null),revision=useRef(0),working=useRef(false),cancel=useRef<(()=>void)|null>(null);
 useEffect(()=>()=>{cancel.current?.();revision.current++;},[]);
 const verify=async(action:string)=>{
  if(working.current)throw Error('captcha_busy');
  working.current=true;
  const epoch=++revision.current;
  try{
   const [key,api]=await Promise.all([siteKey(),loadScript()]);
   if(!host.current||epoch!==revision.current)throw Error('captcha_cancelled');
   return await new Promise<string>((resolve,reject)=>{
    let id:string|undefined,settled=false;
    const timeout=setTimeout(()=>finish(Error('captcha_timeout')),120000);
    const finish=(error?:Error,token?:string)=>{if(settled)return;settled=true;clearTimeout(timeout);cancel.current=null;if(id)api.remove(id);if(error)reject(error);else if(token)resolve(token);else reject(Error('captcha_failed'));};
    cancel.current=()=>finish(Error('captcha_cancelled'));
    try{
     id=api.render(host.current!,{sitekey:key,theme:'dark',language:getLanguage()==='zh-CN'?'zh-cn':getLanguage()==='pt-BR'?'pt-br':getLanguage(),action,execution:'execute',appearance:'interaction-only',size:host.current!.clientWidth<300?'compact':'flexible','response-field':false,retry:'never',callback:(token:string)=>finish(undefined,token),'error-callback':()=>{finish(Error('captcha_failed'));return true;},'expired-callback':()=>finish(Error('captcha_expired')),'timeout-callback':()=>finish(Error('captcha_timeout'))});
     api.execute(id);
    }catch{finish(Error('captcha_failed'));}
   });
  }catch(error){throw Error(captchaError(error)?'captcha_unavailable':(error as Error).message);}finally{working.current=false;}
 };
 return {verify,control:<div className="auth-captcha" ref={host} aria-label={t('Security check')}/>};
}
