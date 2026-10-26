import {purchaseMailV1} from './purchase-mail-v1.ts';
type Result={data:any;error:any};
type Deps={env:(key:string)=>string;rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<Result>;fetch?:typeof fetch;now?:()=>number};
const support='support@onyxchat.site',origin='https://onyxchat.site';
const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'content-type, apikey, authorization','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
const uuid=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const clean=(v:unknown,max:number,min=1)=>typeof v==='string'&&v.trim().length>=min&&v.length<=max&&!/[\x00-\x1f\x7f]/.test(v);
const urlLike=(v:unknown)=>typeof v==='string'&&/:\/\/|www\./i.test(v.normalize('NFKC'));
const nameDomainPath=(v:unknown)=>typeof v==='string'&&/(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?\.)+(?:\p{L}{2,63}|xn--[a-z0-9-]{2,59})\//iu.test(v.normalize('NFKC'));
/** Hosted ingress only: no XFF/X-Real-IP fallback, and never accept a list.
 * A self-hosted deployment must enforce the proxy trust boundary, not set this header itself.
 * IPv6 hosts share their /64 quota; IPv4-mapped addresses share the plain IPv4 quota.
 */
export function declarationClientIp(headers:Headers):string|null{
 const value=headers.get('cf-connecting-ip')?.trim();
 if(!value||value.length>45)return null;
 if(/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value))return value.split('.').every(part=>Number(part)<=255&&String(Number(part))===part)?value:null;
 if(!value.includes(':')||!/^[0-9a-f:.]+$/i.test(value))return null;
 try{
  const canonical=new URL('http://['+value+']/').hostname.slice(1,-1);
  const halves=canonical.split('::'),left=halves[0]?halves[0].split(':'):[],right=halves[1]?halves[1].split(':'):[];
  const words=(halves.length===2?[...left,...Array(8-left.length-right.length).fill('0'),...right]:left).map(part=>parseInt(part,16));
  if(words.length!==8||words.some(part=>!Number.isInteger(part)||part<0||part>0xffff))return null;
  if(words.slice(0,5).every(part=>part===0)&&words[5]===0xffff)return [words[6]>>>8,words[6]&255,words[7]>>>8,words[7]&255].join('.');
  return words.slice(0,4).map(part=>part.toString(16).padStart(4,'0')).join(':')+'::/64';
 }catch{return null;}
}
export const mailConfigured=(env:Deps['env'])=>/^re_[A-Za-z0-9_-]{10,}$/.test(env('RESEND_API_KEY'));
export async function digest(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');}
export function noticeInput(v:any){
 const allowed=['id','kind','name','email','reference','termination','end','reason'];
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!allowed.includes(k))||!uuid.test(v.id??'')||!['cancel','withdraw'].includes(v.kind)||!clean(v.name,160)||urlLike(v.name)||nameDomainPath(v.name)||!clean(v.email,254)||! /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v.email)||!clean(v.reference,240)||urlLike(v.reference))throw Error('invalid_notice');
 const out:any={id:v.id.toLowerCase(),kind:v.kind,name:v.name.trim(),email:v.email.trim().toLowerCase(),reference:v.reference.trim()};
 if(v.kind==='cancel'){
  if(!['ordinary','extraordinary'].includes(v.termination)||!(v.end==='earliest'||typeof v.end==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v.end)&&new Date(v.end+'T00:00:00Z').toISOString().slice(0,10)===v.end)||!clean(v.reason??'',1000,0)||urlLike(v.reason)||v.termination==='ordinary'&&v.reason)throw Error('invalid_notice');
  Object.assign(out,{termination:v.termination,end:v.end,reason:(v.reason??'').trim()});
 }else if(['termination','end','reason'].some(k=>v[k]!==undefined))throw Error('invalid_notice');
 return out;
}
export function noticeReceipt(input:any,receivedAt:string){
 const cancel=input.kind==='cancel';
 return `ONYX — ${cancel?'Kündigungserklärung / Cancellation notice':'Widerrufserklärung / Withdrawal notice'}\nEingegangen / Received: ${receivedAt}\nReferenz / Receipt: ${input.id}\nName: ${input.name}\nE-Mail: ${input.email}\nVertrag / Contract: ${input.reference}\n${cancel?`Art / Type: ${input.termination}\nGewünschtes Ende / Intended end: ${input.end==='earliest'?'zum frühestmöglichen Zeitpunkt / earliest possible date':input.end}\n${input.reason?'Grund / Reason: '+input.reason+'\n':''}`:''}\nDie Erklärung wurde durch Betätigen der Bestätigungsschaltfläche übermittelt und gespeichert.\nThis declaration was submitted using the confirmation button and has been received and saved.\n${cancel?'Wir ordnen die Erklärung dem Vertrag zu und bestätigen den konkreten Beendigungstermin. Die fristgerechte Abgabe bleibt maßgeblich.\nWe will identify the contract and confirm its end date. The recorded submission date remains authoritative.':'Der Eingang wird bestätigt; eine rechtliche Prüfung oder Erstattung ist damit noch nicht vorweggenommen.\nThis confirms receipt, without prejudging the review or any reimbursement.'}\nKontakt / Contact: ${support}\n`;
}
async function read(req:Request){
 if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw Error('invalid_notice');
 const reader=req.body?.getReader();if(!reader)throw Error('invalid_notice');let size=0;const chunks:Uint8Array[]=[];
 try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>8192){await reader.cancel();throw Error('invalid_notice');}chunks.push(part.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
export async function drainCommerceMail(deps:Deps,only:string|null=null){
 if(!mailConfigured(deps.env))return false;
 const request=deps.fetch??fetch,leased=await deps.rpc('commerce_mail_lease_v1',{p_notice:only});if(leased.error)throw Error('mail_queue_unavailable');
 for(const row of leased.data??[]){
  let sent=false;
  try{
   if(row.mail_format!==undefined&&![0,1].includes(row.mail_format))throw Error('unsupported_mail_format');
   const presentation=row.mail_format===1?await purchaseMailV1(row.subject,row.text):{};
   const response=await request('https://api.resend.com/emails',{method:'POST',redirect:'error',signal:AbortSignal.timeout(7000),headers:{Authorization:'Bearer '+deps.env('RESEND_API_KEY'),'Content-Type':'application/json','Idempotency-Key':'onyx-commerce/'+row.id},body:JSON.stringify({from:'ONYX <support@onyxchat.site>',to:[row.recipient],reply_to:support,subject:row.subject,text:row.text,...presentation})});
   sent=response.ok;await response.body?.cancel();
  }catch{/* Keep the durable queue; no provider payload or address is logged. */}
  const result=await deps.rpc('commerce_mail_finish',{p_id:row.id,p_lease:row.lease,p_sent:sent});if(result.error)throw Error('mail_queue_unavailable');
 }
 return true;
}
export function createCommerceNoticeHandler(deps:Deps){
 return async(req:Request)=>{
  if(req.headers.get('origin')&&req.headers.get('origin')!==origin)return json({error:'origin_not_allowed'},403);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method==='GET')return json({service:'onyx-commerce-notices',mailConfigured:mailConfigured(deps.env),supportEmail:support,validation:'format_only'});
  if(req.method!=='POST')return json({error:'method_not_allowed'},405);
  let value:any;
  try{value=await read(req);}catch{return json({error:'invalid_notice'},400);}
  // A public wakeup can only deliver already accepted, immutable outbox records.
  // SQL leasing/backoff bounds calls; it cannot choose recipients or message text.
  if(value?.action==='deliver'&&Object.keys(value).length===1){try{await drainCommerceMail(deps);return json({accepted:true},202);}catch{return json({error:'delivery_pending'},503);}}
  const ip=declarationClientIp(req.headers);
  if(!ip)return json({error:'notice_not_saved',supportEmail:support},503);
  let input:any;
  try{input=noticeInput(value);}catch{return json({error:'invalid_notice'},400);}
  try{
   const now=new Date(deps.now?.()??Date.now()).toISOString(),salt=deps.env('SUPABASE_SERVICE_ROLE_KEY')||deps.env('SUPABASE_SECRET_KEYS');
   if(!salt)throw Error('server_not_configured');
   const hash=await digest(JSON.stringify(input)),ipHash=await digest(salt+'|'+now.slice(0,10)+'|'+ip),emailHash=await digest(salt+'|'+input.email);
   const receipt=noticeReceipt(input,now),result=await deps.rpc('commerce_notice_accept',{p_id:input.id,p_hash:hash,p_ip:ipHash,p_email_hash:emailHash,p_input:input,p_text:receipt,p_received:now});
   if(result.error){if(result.error.code==='P0429')return json({error:'rate_limited',supportEmail:support},429);throw Error('notice_not_saved');}
   const accepted=result.data;let deliveryPending=true;
   try{await drainCommerceMail(deps,input.id);const state=await deps.rpc('commerce_notice_delivery',{p_id:input.id});deliveryPending=state.error||state.data!==true;}catch{/* The declaration itself is already durably received. */}
   return json({received:true,id:input.id,receivedAt:accepted.received_at,receipt:accepted.receipt,deliveryPending},201);
  }catch{return json({error:'notice_not_saved',supportEmail:support},503);}
 };
}
