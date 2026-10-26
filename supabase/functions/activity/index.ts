import {createClient} from 'npm:@supabase/supabase-js@2.117.3';
import {accountSessionAllowed} from '../_shared/account-session.ts';
import {createActivityHandler} from '../_shared/activity-handler.ts';
const env=(key:string)=>Deno.env.get(key)??'';
let secret=env('SUPABASE_SERVICE_ROLE_KEY');try{secret=JSON.parse(env('SUPABASE_SECRET_KEYS')||'{}').default??secret;}catch{}
const sb=createClient(env('SUPABASE_URL'),secret,{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(createActivityHandler({env,user:async token=>{const {data,error}=await sb.auth.getUser(token);const id=error?null:data.user?.id;return id&&await accountSessionAllowed(token,id,(name,args)=>sb.rpc(name,args))?id:null;},rpc:(name,args)=>sb.rpc(name,args)}));
