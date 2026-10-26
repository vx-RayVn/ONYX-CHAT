/** Remembered Auth sessions on this device only. Never passwords or cached chat data. */
import {create} from 'zustand';
import type {Session} from '@supabase/supabase-js';

export const ACCOUNT_LIMIT=5;
const KEY='onyx-accounts-v1';
export interface AccountIdentity {id:string;email:string;name:string;color:string}
interface SavedAccount extends AccountIdentity {access_token:string;refresh_token:string}
function read():SavedAccount[]{
 try{
  const parsed:unknown=JSON.parse(localStorage.getItem(KEY)||'[]');
  if(!Array.isArray(parsed))return [];
  const seen=new Set<string>();
  return parsed.filter((a):a is SavedAccount=>{
   if(!a||typeof a!=='object'||typeof a.id!=='string'||!(/^[0-9a-f-]{36}$/i.test(a.id))||seen.has(a.id))return false;
   if(!['email','name','color','access_token','refresh_token'].every(k=>typeof a[k]==='string'&&a[k].length<20000)||!a.access_token||!a.refresh_token)return false;
   seen.add(a.id);return true;
  }).slice(0,ACCOUNT_LIMIT);
 }catch{return [];}
}
const identities=(entries:SavedAccount[])=>entries.map(({id,email,name,color})=>({id,email,name,color}));
export const useSavedAccounts=create<{accounts:AccountIdentity[]}>(()=>({accounts:identities(read())}));
function write(entries:SavedAccount[]){
 // Commit storage first. A denied/full store must not pretend an account was saved.
 localStorage.setItem(KEY,JSON.stringify(entries));
 useSavedAccounts.setState({accounts:identities(entries)});
}
export function saveAccount(session:Session,profile?:{displayName:string;avatarColor:string}){
 if(session.user.is_anonymous||!session.user.email)return;
 const entries=read(),old=entries.find(a=>a.id===session.user.id);
 if(!old&&entries.length>=ACCOUNT_LIMIT)throw Error('account_limit');
 const account:SavedAccount={id:session.user.id,email:session.user.email,name:profile?.displayName||old?.name||session.user.email,color:profile?.avatarColor||old?.color||'#0fb988',access_token:session.access_token,refresh_token:session.refresh_token};
 write(old?entries.map(a=>a.id===account.id?account:a):[...entries,account]);
}
export function updateSavedAccount(session:Session){if(read().some(a=>a.id===session.user.id))try{saveAccount(session);}catch{/* The active SDK session remains usable if storage becomes unavailable. */}}
export function savedSession(id:string){return read().find(a=>a.id===id);}
export function forgetAccount(id:string){
 try{write(read().filter(a=>a.id!==id));}
 catch(error){
  // Removing storage remains possible in some browsers even when writing is denied.
  // Prefer forgetting all local entries to retaining a session after explicit sign-out.
  localStorage.removeItem(KEY);useSavedAccounts.setState({accounts:[]});throw error;
 }
}
if(typeof window!=='undefined')window.addEventListener('storage',event=>{if(event.key===KEY||event.key===null)useSavedAccounts.setState({accounts:identities(read())});});
