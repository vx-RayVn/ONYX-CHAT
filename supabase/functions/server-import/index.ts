import {createClient} from 'npm:@supabase/supabase-js@2.117.3';
import {createDiscordImportHandler} from '../_shared/discord-import.ts';
const env=(name:string)=>(Deno.env.get(name)??'').trim();
function publicKey(){const legacy=env('SUPABASE_ANON_KEY');if(legacy)return legacy;try{const keys=JSON.parse(env('SUPABASE_PUBLISHABLE_KEYS')||'{}');return keys.default??Object.values(keys)[0]??'';}catch{return '';}}
const url=env('SUPABASE_URL'),key=publicKey(),options={auth:{persistSession:false,autoRefreshToken:false}},auth=createClient(url,key,options);
Deno.serve(createDiscordImportHandler({user:async jwt=>{const{data,error}=await auth.auth.getUser(jwt);return error?null:data.user?.id??null;},rpc:(jwt,name,args)=>createClient(url,key,{...options,global:{headers:{Authorization:'Bearer '+jwt}}}).rpc(name,args)}));
