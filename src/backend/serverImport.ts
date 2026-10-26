import {FunctionsHttpError} from '@supabase/supabase-js';
import {supabase} from './client';
import {t} from '../i18n';
import {isUuid} from '../lib/ids';
export interface DiscordPreview{name:string;description:string;roles:number;categories:number;channels:number;examples:{name:string;type:string}[];skipped:number;fingerprint:string}
async function request(body:Record<string,unknown>){
 const {data,error}=await supabase().functions.invoke('server-import',{body});
 if(error){let code='';if(error instanceof FunctionsHttpError)try{code=(await error.context.json()).error;}catch{}
  const messages:Record<string,string>={template_link_required:t('Use a Discord server template link, not an invite.'),template_unavailable:t('This Discord template is unavailable. Create or sync it in Discord and try again.'),template_too_large:t('This template exceeds ONYX limits: 50 roles, 50 categories and 200 channels.'),template_invalid:t('This template contains unsupported or invalid settings. Sync it in Discord and try again.'),template_changed:t('The Discord template changed. Preview it again before importing.'),discord_rate_limited:t('Discord is busy. Try again in a moment.'),discord_unavailable:t('Discord could not be reached. Try again shortly.'),import_rate_limited:t('Too many import attempts. Try again later.'),server_limit:t('You have reached the server limit.'),sign_in_required:t('Sign in to import a server.'),not_allowed:t('This action is unavailable for your account.')};throw Error(messages[code]??t('The import could not finish. You can safely try again.'));
 }
 return data;
}
export async function previewDiscordTemplate(code:string){return await request({action:'preview',code}) as DiscordPreview;}
export async function importDiscordTemplate(code:string,preview:DiscordPreview,name:string,requestId:string){const data=await request({action:'import',code,name,requestId,fingerprint:preview.fingerprint});if(!isUuid(data?.serverId))throw Error(t('The import could not finish. You can safely try again.'));return data.serverId as string;}
