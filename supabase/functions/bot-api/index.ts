import {createClient} from 'npm:@supabase/supabase-js@2.117.3';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Cache-Control':'no-store'};
const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{...cors,'Content-Type':'application/json',...(status===429?{'Retry-After':'60'}:{})}});
const digest=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(v=>v.toString(16).padStart(2,'0')).join('');
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32))).map(v=>v.toString(16).padStart(2,'0')).join('');
function key(){try{return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')??'{}').default??Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');}catch{return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');}}
const uuid=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);

Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 try{
  const url=new URL(req.url),route=url.pathname.split('/bot-api')[1]||'/';
  if(!['GET','POST'].includes(req.method))return reply({error:'method_not_allowed'},405);
  const secret=key(),project=Deno.env.get('SUPABASE_URL');if(!secret||!project)return reply({error:'not_configured'},503);
  const sb=createClient(project,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  let body:Record<string,unknown>={};
  if(req.method==='POST'){
   if(Number(req.headers.get('content-length')??0)>16384)return reply({error:'too_large'},413);
   const reader=req.body?.getReader(),parts:Uint8Array[]=[];let size=0;
   if(reader){while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>16384){await reader.cancel();return reply({error:'too_large'},413);}parts.push(chunk.value);}}
   const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
   const text=new TextDecoder().decode(bytes);
   try{body=JSON.parse(text);}catch{return reply({error:'invalid_json'},400);}
   if(!body||Array.isArray(body)||typeof body!=='object')return reply({error:'invalid_json'},400);
  }
  if(route==='/pair/start'&&req.method==='POST'){
   if(!uuid(body.bot_id)||typeof body.device_code!=='string'||!/^[a-f0-9]{64}$/.test(body.device_code))return reply({error:'invalid_pairing'},400);
   const code=random().slice(0,10).toUpperCase(),{error}=await sb.rpc('bot_pair_start',{p_bot:body.bot_id,p_device:await digest(body.device_code),p_code:code});
   if(error)return reply({error:error.message.includes('rate limited')?'rate_limited':'pairing_unavailable'},error.message.includes('rate limited')?429:403);
   return reply({user_code:code,verification_uri:'https://onyxchat.site/developers',expires_in:300,interval:3});
  }
  if(route==='/pair/poll'&&req.method==='POST'){
   if(typeof body.device_code!=='string'||!/^[a-f0-9]{64}$/.test(body.device_code))return reply({error:'invalid_pairing'},400);
   const token=`onyx_bot_${random()}`,{data,error}=await sb.rpc('bot_pair_claim',{p_device:await digest(body.device_code),p_token:await digest(token)});
   if(error)return reply({error:'pairing_expired'},403);
   return data?.status==='approved'?reply({...data,token,expires_in:2592000}):reply({status:'pending'},202);
  }
  const token=req.headers.get('authorization')?.match(/^Bearer (onyx_bot_[a-f0-9]{64})$/)?.[1];
  if(!token)return reply({error:'unauthorized'},401);
  let action:string,data:Record<string,unknown>={};
  if(route==='/me'&&req.method==='GET')action='me';
  else if(route==='/events'&&req.method==='GET'){
   const after=url.searchParams.get('after')??'0';if(!/^\d{1,18}$/.test(after))return reply({error:'invalid_cursor'},400);
   action='events';data={after};
  }else if(route==='/commands'&&req.method==='POST'){
   if(!Array.isArray(body.commands)||body.commands.length>20||body.commands.some(c=>!c||typeof c.name!=='string'||!/^[a-z0-9_-]{1,32}$/.test(c.name)||typeof c.description!=='string'||c.description.length<1||c.description.length>100))return reply({error:'invalid_commands'},400);
   action='commands';data={commands:body.commands};
  }else if(route==='/messages'&&req.method==='POST'){
   if(!uuid(body.channel_id)||!uuid(body.nonce)||typeof body.content!=='string'||body.content.trim().length<1||body.content.length>4000)return reply({error:'invalid_message'},400);
   action='message';data={channel_id:body.channel_id,nonce:body.nonce,content:body.content};
  }else return reply({error:'not_found'},404);
  const {data:result,error}=await sb.rpc('bot_api',{p_hash:await digest(token),p_action:action,p_data:data});
  if(error){const message=error.message;return reply({error:message.includes('rate limited')?'rate_limited':error.code==='28000'?'unauthorized':error.code==='42501'?'forbidden':'invalid_request'},message.includes('rate limited')?429:error.code==='28000'?401:error.code==='42501'?403:400);}
  return reply(result);
 }catch{return reply({error:'request_failed'},500);}
});
