import {hashState,steamLoginURL,verifySteam} from './steam.ts';
import {fetchSteamProfile} from './steam-profile.ts';
import {PROVIDERS,isProvider,providerConfig,authorizationURL,exchangeIdentity,randomSecret,type Env} from './social-oauth.ts';
interface RpcResult {data:unknown;error:{message?:string;code?:string}|null}
export interface SocialDeps {env:Env;user:(jwt:string)=>Promise<string|null>;rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<RpcResult>;fetcher?:typeof fetch}
const origins=['https://onyxchat.site','http://localhost:5173','http://127.0.0.1:5173'];
const secret=(value:unknown):value is string=>typeof value==='string'&&value.length===43&&/^[A-Za-z0-9_-]+$/.test(value);
export function createSocialHandler({env,user,rpc,fetcher=fetch}:SocialDeps){
 const base=env('SUPABASE_URL')+'/functions/v1/connections';
 const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, GET, OPTIONS','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
 const json=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers:{...headers,'Content-Type':'application/json'}});
 const redirect=(origin:string,params:Record<string,string>)=>new Response(null,{status:303,headers:{...headers,Location:origin+'/#'+new URLSearchParams(params)}});
 const call=async(name:string,args:Record<string,unknown>)=>{const result=await rpc(name,args);if(result.error)throw result.error;return result.data;};
 return async(req:Request):Promise<Response>=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers});
  const url=new URL(req.url),path=url.pathname.slice(url.pathname.indexOf('/connections')+'/connections'.length);
  if(req.method==='GET'&&path==='/providers')return json(200,{providers:[...PROVIDERS.map(id=>({id,available:providerConfig(id,env)})),{id:'playstation',available:false}]});
  if(req.method==='GET'){
   const provider=path.match(/^\/callback\/([a-z]+)$/)?.[1],state=url.searchParams.get('state');let origin=origins[0];
   try{
    if(!isProvider(provider)||!secret(state)||url.searchParams.getAll('state').length!==1||!providerConfig(provider,env))throw Error('invalid callback');
    const hash=await hashState(state),claimed=await call('social_claim',{p_hash:hash,p_provider:provider}) as {origin:string;verifier:string};
    if(!origins.includes(claimed.origin))throw Error('invalid origin');origin=claimed.origin;
    if(url.searchParams.has('error'))return redirect(origin,{connection:'cancelled'});
    const callback=base+'/callback/'+provider;
    const siteReturns=origins.map(site=>site+'/connections/steam-return.html?state='+encodeURIComponent(state));
    const steamReturn=siteReturns.find(site=>site===url.searchParams.get('openid.return_to'))??callback+'?state='+encodeURIComponent(state);
    if(provider==='steam'&&url.searchParams.get('openid.mode')==='cancel')return redirect(origin,{connection:'cancelled'});
    const identity=provider==='steam'?{external_id:await verifySteam(url.searchParams,steamReturn,fetcher),display_name:null as string|null,profile_handle:null}:
     await exchangeIdentity(provider,(()=>{const code=url.searchParams.get('code');if(!code||code.length>4096||url.searchParams.getAll('code').length!==1)throw Error('invalid code');return code;})(),callback,claimed.verifier,env,fetcher);
    if(provider==='steam')try{identity.display_name=(await fetchSteamProfile(identity.external_id,env('CONNECTIONS_STEAM_WEB_API_KEY'),fetcher)).name;}catch{/* A profile-data outage cannot undo a valid signed identity. */}
    const receipt=randomSecret();
    await call('social_verify',{p_hash:hash,p_receipt:await hashState(receipt),p_external_id:identity.external_id,p_display_name:identity.display_name,p_handle:identity.profile_handle});
    // Finish requires this receipt, the initiating browser's secret, and its authenticated account.
    return redirect(origin,{connection:'finish',state,receipt});
   }catch{return redirect(origin,{connection:'failed'});}
  }
  if(req.method!=='POST')return json(405,{error:'method_not_allowed'});
  const jwt=req.headers.get('Authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if(!jwt)return json(401,{error:'unauthorized'});
  const actor=await user(jwt).catch(()=>null);if(!actor)return json(401,{error:'unauthorized'});
  try{
   if(Number(req.headers.get('Content-Length'))>12000)return json(413,{error:'invalid_request'});
   const raw=await req.text();if(raw.length>12000)return json(413,{error:'invalid_request'});const body=JSON.parse(raw);
   if(body.action==='finish'){
    if(!secret(body.state)||!secret(body.binding)||!secret(body.receipt))return json(400,{error:'invalid_request'});
    const provider=await call('social_finish',{p_user:actor,p_hash:await hashState(body.state),p_binding:await hashState(body.binding),p_receipt:await hashState(body.receipt)});
    return json(200,{provider});
   }
   if(!isProvider(body.provider))return json(400,{error:'provider_unavailable'});
   if(body.action==='disconnect'){await call('social_disconnect',{p_user:actor,p_provider:body.provider});return json(200,{ok:true});}
   if(body.action!=='start'||!secret(body.binding))return json(400,{error:'update_required'});
   if(!providerConfig(body.provider,env))return json(503,{error:'provider_unavailable'});
   const state=randomSecret(),verifier=randomSecret(),origin=origins.includes(body.origin)?body.origin:origins[0];
   await call('social_start',{p_user:actor,p_provider:body.provider,p_state_hash:await hashState(state),p_binding_hash:await hashState(body.binding),p_verifier:verifier,p_origin:origin});
   const callback=base+'/callback/'+body.provider;
   const steamReturn=body.site_callback===true?origin+'/connections/steam-return.html?state='+encodeURIComponent(state):callback+'?state='+encodeURIComponent(state);
   return json(200,{url:body.provider==='steam'?steamLoginURL(steamReturn):await authorizationURL(body.provider,state,callback,verifier,env),state});
  }catch(error){
   const e=error as {message?:string;code?:string};
   if(e.code==='23505')return json(409,{error:'connection_taken'});
   if(e.message==='rate limited')return json(429,{error:'rate_limited'});
   if(e.message==='invalid state')return json(400,{error:'connection_expired'});
   return json(403,{error:'connection_not_allowed'});
  }
 };
}
