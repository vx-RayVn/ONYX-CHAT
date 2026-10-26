import {createClient} from 'npm:@supabase/supabase-js@2.117.3';
import {accountSessionAllowed} from '../_shared/account-session.ts';
import {createSocialHandler} from '../_shared/social-handler.ts';
const env=(name:string)=>(Deno.env.get(name)??'').trim();
function key(kind:'public'|'service'){
 const legacy=env(kind==='public'?'SUPABASE_ANON_KEY':'SUPABASE_SERVICE_ROLE_KEY');if(legacy)return legacy;
 try{const keys=JSON.parse(env(kind==='public'?'SUPABASE_PUBLISHABLE_KEYS':'SUPABASE_SECRET_KEYS')||'{}');return keys.default??Object.values(keys)[0]??'';}catch{return '';}
}
const options={auth:{persistSession:false,autoRefreshToken:false}};
const auth=createClient(env('SUPABASE_URL'),key('public'),options);
const db=createClient(env('SUPABASE_URL'),key('service'),options);
Deno.serve(createSocialHandler({env,user:async jwt=>{const {data,error}=await auth.auth.getUser(jwt);const id=error?null:data.user?.id;return id&&await accountSessionAllowed(jwt,id,(name,args)=>db.rpc(name,args))?id:null;},rpc:(name,args)=>db.rpc(name,args)}));
