/** Public configuration only. The Turnstile secret belongs to native Supabase Auth, never here. */
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'apikey, content-type, authorization, x-client-info','Access-Control-Allow-Methods':'GET, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='GET')return new Response(null,{status:405,headers});
 // This endpoint precedes sign-in. Validate the project's public API key at the Auth gateway,
 // rather than requiring a user JWT that a guest does not have yet. Never return Auth settings.
 const apiKey=request.headers.get('apikey')||'';
 if(!apiKey||apiKey.length>4096)return new Response(null,{status:401,headers});
 try{
  const check=await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/settings`,{headers:{apikey:apiKey},signal:AbortSignal.timeout(4000)});
  await check.body?.cancel();
  if(!check.ok)return new Response(null,{status:check.status===401||check.status===403?401:503,headers});
 }catch{return new Response(null,{status:503,headers});}
 const siteKey=(Deno.env.get('TURNSTILE_SITE_KEY')||'').trim();
 if(!/^0x[A-Za-z0-9_-]{15,80}$/.test(siteKey))return new Response(JSON.stringify({error:'security_check_unavailable'}),{status:503,headers});
 return new Response(JSON.stringify({siteKey,minAge:16}),{headers});
});
