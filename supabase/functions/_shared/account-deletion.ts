import {accountSessionAllowed} from './account-session.ts';
import {deletionReauthenticated} from './deletion-reauth.ts';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const json=(status:number,body:Record<string,unknown>)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
type Deps={admin:()=>any;guestSessionAllowed:(token:string,userId:string)=>Promise<boolean>;closeBilling:(admin:any,userId:string)=>Promise<void>;now?:()=>number};
interface Prepared{owned_servers:{id:string;name:string}[];media:string[];attachments:string[]}

/** Dependency boundary permits complete, side-effect-free deletion-policy tests. */
export function createAccountDeletionHandler(deps:Deps){return async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return json(405,{error:'method_not_allowed'});
 const token=req.headers.get('Authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
 if(!token)return json(401,{error:'unauthorized'});
 const admin=deps.admin();if(!admin)return json(500,{error:'not_configured'});
 const {data:auth,error:authError}=await admin.auth.getUser(token),user=auth?.user;
 if(authError||!user)return json(401,{error:'unauthorized'});
 const registered=await accountSessionAllowed(token,user.id,(name,args)=>admin.rpc(name,args));
 // The registered-only RPC intentionally excludes guests. Their own RLS read uses
 // the caller JWT (not service_role) and the same API-hook/revoked-session gate.
 let guest=false;
 if(!registered){
  try{guest=await deps.guestSessionAllowed(token,user.id);}catch{return json(403,{error:'account_verification_required'});}
  if(!guest)return json(403,{error:'account_verification_required'});
 }
 let mfaRequired=false;
 if(!guest){
  const {data,error}=await admin.auth.admin.mfa.listFactors({userId:user.id});
  if(error||!Array.isArray(data?.factors))return json(503,{error:'lookup_failed'});
  mfaRequired=data.factors.some((factor:any)=>factor.status==='verified');
 }
 if(!deletionReauthenticated(token,user.id,mfaRequired,guest,(deps.now?.()??Date.now())/1000))return json(403,{error:'reauthentication_required'});
 let body:{username?:unknown}={};try{body=await req.json();}catch{/* Same response as an incorrect username. */}
 const {data:profile,error:profileError}=await admin.from('profiles').select('username').eq('id',user.id).maybeSingle();
 if(profileError)return json(500,{error:'lookup_failed'});
 const typed=typeof body?.username==='string'?body.username.trim().replace(/^@/,'').toLowerCase():'';
 if(!profile||!typed||typed!==String(profile.username).toLowerCase())return json(400,{error:'confirmation_mismatch'});
 const {data:bans,error:banError}=await admin.from('platform_bans').select('id').eq('user_id',user.id).is('lifted_at',null).limit(1);
 if(banError&&banError.code!=='PGRST205'&&banError.code!=='42P01')return json(500,{error:'lookup_failed'});
 if(bans?.length)return json(403,{error:'suspended'});
 const {data,error:prepError}=await admin.rpc('account_deletion_prepare',{p_user:user.id});
 if(prepError||!data)return json(500,{error:'prepare_failed'});
 const prep=data as Prepared;
 if(prep.owned_servers.length)return json(409,{error:'owns_servers',servers:prep.owned_servers});
 try{await deps.closeBilling(admin,user.id);}catch{return json(503,{error:'billing_cleanup_failed'});}
 for(const[bucket,paths]of[['media',prep.media],['attachments',prep.attachments]]as const){
  for(let i=0;i<paths.length;i+=100){const {error}=await admin.storage.from(bucket).remove(paths.slice(i,i+100));if(error)return json(500,{error:'storage_failed'});}
 }
 const {error:deleteError}=await admin.auth.admin.deleteUser(user.id);
 if(deleteError)return json(500,{error:'delete_failed'});
 return json(200,{deleted:true,files:prep.media.length+prep.attachments.length});
};}
