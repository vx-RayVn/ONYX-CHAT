/** Only call after Auth.getUser(jwt) and the current server-side session gate.
 * AMR belongs to that verified token; iat/refresh/user_metadata are never login proof.
 */
export function deletionReauthenticated(jwt:string,userId:string,mfaRequired:boolean,guest:boolean,now=Date.now()/1000):boolean{
 try{
  const part=jwt.split('.')[1];if(!part||part.length>20000)return false;
  const claims=JSON.parse(atob(part.replace(/-/g,'+').replace(/_/g,'/')));
  if(claims.sub!==userId||claims.role!=='authenticated'||typeof claims.session_id!=='string'||!Number.isFinite(now))return false;
  // Guest status is established independently through a session/RLS-protected own-profile read.
  if(guest)return true;
  if(claims.is_anonymous!==false||!Array.isArray(claims.amr))return false;
  const recent=(entry:any)=>Number.isSafeInteger(entry?.timestamp)&&entry.timestamp>0&&entry.timestamp>=now-600&&entry.timestamp<=now+30;
  const primary=claims.amr.filter((entry:any)=>['password','otp','magiclink'].includes(entry?.method)&&recent(entry)).map((entry:any)=>entry.timestamp);
  if(!primary.length)return false;
  return !mfaRequired||claims.aal==='aal2'&&claims.amr.some((entry:any)=>['totp','mfa/totp'].includes(entry?.method)&&recent(entry)&&entry.timestamp>=Math.max(...primary));
 }catch{return false;}
}

/** caller must be a public-key client with the verified caller JWT, never service_role. */
export async function guestDeletionSessionAllowed(caller:any,userId:string):Promise<boolean>{
 const {data,error}=await caller.from('profiles').select('id,is_guest').eq('id',userId).maybeSingle();
 return !error&&data?.id===userId&&data.is_guest===true;
}
