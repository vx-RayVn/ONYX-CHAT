// Deploy only after package 40 with deletion reauthentication is publicly available.
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import {createAccountDeletionHandler} from '../_shared/account-deletion.ts';
import {guestDeletionSessionAllowed} from '../_shared/deletion-reauth.ts';
import {closeAccountBilling} from '../_shared/billing.ts';

function secretKey(): string | null {
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
    if (typeof keys.default === 'string' && keys.default) return keys.default;
  } catch {
    // Kein neuer Schlüssel hinterlegt – legacy service_role verwenden.
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || null;
}

Deno.serve(createAccountDeletionHandler({
 admin:()=>{const url=Deno.env.get('SUPABASE_URL'),key=secretKey();return url&&key?createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}):null;},
 guestSessionAllowed:async(token,userId)=>{
  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_ANON_KEY');if(!url||!key)return false;
  const caller=createClient(url,key,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}});
  return guestDeletionSessionAllowed(caller,userId);
 },
 closeBilling:(admin,userId)=>closeAccountBilling({env:name=>(Deno.env.get(name)??'').trim(),rpc:(name,args)=>admin.rpc(name,args),user:async()=>null},userId),
}));
