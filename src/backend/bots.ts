import { supabase } from './client';
export interface BotApp {id:string;owner_id:string;name:string;description:string;avatar:string|null;commands:{name:string;description:string}[]}
export interface BotInstall {bot_id:string;server_id:string;channel_ids:string[]}
export async function botApps(){const{data,error}=await supabase().from('bot_apps').select('*').order('created_at');if(error)throw error;return(data??[])as BotApp[];}
export async function botInstalls(){const{data,error}=await supabase().from('bot_installs').select('*');if(error)throw error;return(data??[])as BotInstall[];}
export async function createBot(name:string){const{error}=await supabase().from('bot_apps').insert({name:name.trim()});if(error)throw error;}
export async function updateBot(id:string,patch:{name:string;description:string;avatar:string|null}){const{error}=await supabase().from('bot_apps').update(patch).eq('id',id);if(error)throw error;}
export async function deleteBot(id:string){const{error}=await supabase().from('bot_apps').delete().eq('id',id);if(error)throw error;}
export async function revokeBot(id:string){const{error}=await supabase().rpc('bot_revoke',{p_bot:id});if(error)throw error;}
export async function approveBot(code:string){const{data,error}=await supabase().rpc('bot_pair_approve',{p_code:code.trim()});if(error)throw error;return data as string;}
export async function installBot(botId:string,serverId:string,channels:string[],exists:boolean){
 const result=exists?await supabase().from('bot_installs').update({channel_ids:channels}).eq('bot_id',botId).eq('server_id',serverId):await supabase().from('bot_installs').insert({bot_id:botId,server_id:serverId,channel_ids:channels});
 if(result.error)throw result.error;
}
export async function removeBot(botId:string,serverId:string){const{error}=await supabase().from('bot_installs').delete().eq('bot_id',botId).eq('server_id',serverId);if(error)throw error;}
export async function dispatchBot(botId:string,channelId:string,command:string,args:string){const{error}=await supabase().rpc('bot_dispatch',{p_bot:botId,p_channel:channelId,p_command:command,p_args:args});if(error)throw error;}
