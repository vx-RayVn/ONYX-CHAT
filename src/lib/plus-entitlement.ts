import {useCallback,useSyncExternalStore} from 'react';
export function plusActive(since?:number,until?:number,now=Date.now()){
 return !!since&&(until===undefined||Number.isFinite(until)&&until>now);
}
// One expiry timer for all visible names; background throttling/sleep is rechecked on focus.
const watchers=new Map<()=>void,number>();let timer:ReturnType<typeof setTimeout>|undefined;
function schedule(){clearTimeout(timer);const now=Date.now(),next=Math.min(...[...watchers.values()].filter(value=>value>now));if(Number.isFinite(next))timer=setTimeout(notify,Math.min(2147483647,Math.max(1,next-now+1)));}
function notify(){for(const listener of watchers.keys())listener();schedule();}
function subscribe(until:number|undefined,listener:()=>void){
 if(until===undefined)return()=>{};
 if(!watchers.size){window.addEventListener('focus',notify);document.addEventListener('visibilitychange',notify);}
 watchers.set(listener,until);schedule();
 return()=>{watchers.delete(listener);schedule();if(!watchers.size){window.removeEventListener('focus',notify);document.removeEventListener('visibilitychange',notify);}};
}
export function usePlusActive(since?:number,until?:number){
 return useSyncExternalStore(useCallback(listener=>subscribe(until,listener),[until]),()=>plusActive(since,until),()=>plusActive(since,until));
}
