import {hashState} from './steam.ts';
import {fetchSteamProfile} from './steam-profile.ts';
import {sanitizeGameArtwork} from './game-artwork.ts';
interface ActivityDeps {env:(key:string)=>string;user:(jwt:string)=>Promise<string|null>;rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{code?:string;message?:string}|null}>;fetcher?:typeof fetch}
export function createActivityHandler({env,user,rpc,fetcher=fetch}:ActivityDeps){
 const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store','Content-Type':'application/json'};
 const reply=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers});
 const call=async(name:string,args:Record<string,unknown>)=>{const result=await rpc(name,args);if(result.error)throw result.error;return result.data;};
 return async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});if(req.method!=='POST')return reply(405,{error:'method_not_allowed'});
  try{
   if(Number(req.headers.get('content-length'))>46000)return reply(413,{error:'invalid_request'});
   const reader=req.body?.getReader(),parts:Uint8Array[]=[];let size=0;
   if(reader)while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>46000){await reader.cancel();return reply(413,{error:'invalid_request'});}parts.push(part.value);}
   const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
   const body=JSON.parse(new TextDecoder().decode(bytes)),route=new URL(req.url).pathname.split('/activity')[1]||'/',bearer=req.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
   if(!bearer)return reply(401,{error:'unauthorized'});
   if(route==='/publish'||route==='/disconnect'){
    if(!/^onyx_activity_[a-f0-9]{64}$/.test(bearer))return reply(401,{error:'unauthorized'});
    if(route==='/disconnect'){await call('activity_disconnect',{p_hash:await hashState(bearer)});return reply(200,{ok:true});}
    const title=body.title??null,key=body.key??null,started=body.started_at??null;
    if(title!==null&&(typeof title!=='string'||!title.trim()||title.length>128||/[\u0000-\u001f\u007f]/.test(title)||typeof key!=='string'||!/^[a-zA-Z0-9_.:-]{1,128}$/.test(key)))return reply(400,{error:'invalid_activity'});
    if(started!==null&&(typeof started!=='string'||!Number.isFinite(Date.parse(started))))return reply(400,{error:'invalid_activity'});
    const args={p_hash:await hashState(bearer),p_title:title,p_key:key,p_started:started};
    if(body.artwork!==undefined&&body.artwork!==null){
     if(title===null)return reply(400,{error:'invalid_artwork'});
     let artwork:string;try{artwork=await sanitizeGameArtwork(body.artwork);}catch{return reply(400,{error:'invalid_artwork'});}
     return reply(200,await call('activity_publish_artwork',{...args,p_artwork:artwork}));
    }
    return reply(200,await call('activity_publish_artwork',{...args,p_artwork:null}));
   }
   const actor=await user(bearer).catch(()=>null);if(!actor)return reply(401,{error:'unauthorized'});
   if(!['/status','/settings','/pair','/revoke','/steam'].includes(route))return reply(404,{error:'not_found'});
   if(route==='/steam'){
    const pending=await call('activity_control',{p_user:actor,p_action:'steam_begin'}) as {steam_id:string}|null;
    if(!pending)return reply(200,{updated:false});
    const profile=await fetchSteamProfile(pending.steam_id,env('CONNECTIONS_STEAM_WEB_API_KEY'),fetcher);
    await call('activity_control',{p_user:actor,p_action:'steam_finish',p_data:profile});return reply(200,{updated:true});
   }
   if(route==='/pair'&&(!/^[a-f0-9]{64}$/.test(body.hash??'')||typeof body.name!=='string'||!body.name.trim()||body.name.length>40||/[\u0000-\u001f\u007f]/.test(body.name)))return reply(400,{error:'invalid_device'});
   if(route==='/settings'&&typeof body.enabled!=='boolean')return reply(400,{error:'invalid_settings'});
   if(route==='/revoke'&&!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.id??''))return reply(400,{error:'invalid_device'});
   const data=route==='/pair'?{hash:body.hash,name:body.name}:route==='/settings'?{enabled:body.enabled}:route==='/revoke'?{id:body.id}:{};
   return reply(200,await call('activity_control',{p_user:actor,p_action:route.slice(1),p_data:data}));
  }catch(error){const e=error as {code?:string;message?:string};return reply(e.message==='rate limited'?429:e.code==='28000'?401:403,{error:e.message==='rate limited'?'rate_limited':'request_failed'});}
 };
}
