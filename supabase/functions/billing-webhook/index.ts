import {createClient} from 'npm:@supabase/supabase-js@2.117.3';
import {createStripeWebhookHandler} from '../_shared/billing.ts';
import policy from '../_shared/commerce-policy.example.ts';
const env=(name:string)=>(Deno.env.get(name)??'').trim();
function key(){const legacy=env('SUPABASE_SERVICE_ROLE_KEY');if(legacy)return legacy;try{const keys=JSON.parse(env('SUPABASE_SECRET_KEYS')||'{}');return keys.default??Object.values(keys)[0]??'';}catch{return '';}}
const db=createClient(env('SUPABASE_URL'),key(),{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(createStripeWebhookHandler({env,terms:policy,rpc:(name,args)=>db.rpc(name,args),user:async()=>null}));
