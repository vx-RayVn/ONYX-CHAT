import {createClient} from 'npm:@supabase/supabase-js@2.117.3';
import {accountSessionAllowed} from '../_shared/account-session.ts';
import {createBillingHandler} from '../_shared/billing.ts';
import policy from '../_shared/commerce-policy.example.ts';
const env=(name:string)=>(Deno.env.get(name)??'').trim();
function key(service:boolean){const legacy=env(service?'SUPABASE_SERVICE_ROLE_KEY':'SUPABASE_ANON_KEY');if(legacy)return legacy;try{const keys=JSON.parse(env(service?'SUPABASE_SECRET_KEYS':'SUPABASE_PUBLISHABLE_KEYS')||'{}');return keys.default??Object.values(keys)[0]??'';}catch{return '';}}
const options={auth:{persistSession:false,autoRefreshToken:false}},auth=createClient(env('SUPABASE_URL'),key(false),options),db=createClient(env('SUPABASE_URL'),key(true),options);
Deno.serve(createBillingHandler({env,terms:policy,rpc:(name,args)=>db.rpc(name,args),user:async jwt=>{const {data,error}=await auth.auth.getUser(jwt);const id=error?null:data.user?.id;if(!id||data.user?.is_anonymous)return null;return await accountSessionAllowed(jwt,id,(name,args)=>db.rpc(name,args))?id:null;}}));
