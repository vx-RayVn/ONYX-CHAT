/** Discord public server templates. No Discord account tokens, messages or member identities. */
type Row=Record<string,unknown>;
const mappings:[number,string[]][]=[[3,['administrator']],[10,['viewChannel']],[5,['manageServer','manageBadges']],[4,['manageChannels']],[28,['manageRoles']],[1,['kickMembers']],[2,['banMembers']],[0,['createInvites']],[11,['sendMessages']],[16,['readHistory']],[15,['attachFiles']],[46,['sendVoiceMessages']],[6,['addReactions']],[17,['mentionEveryone']],[13,['manageMessages']],[20,['connect']],[21,['speak']],[9,['video','screenShare']],[22,['muteMembers']],[23,['deafenMembers']],[24,['moveMembers']]];
export class ImportError extends Error{code:string;status:number;constructor(code:string,status=400){super(code);this.code=code;this.status=status;}}
const object=(value:unknown):Row=>{if(!value||typeof value!=='object'||Array.isArray(value))throw new ImportError('template_invalid');return value as Row;};
const text=(value:unknown,max:number,required=false)=>{if(value===undefined||value===null){if(required)throw new ImportError('template_invalid');return '';}if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))throw new ImportError('template_invalid');const out=value.trim();if(required&&!out)throw new ImportError('template_invalid');return out;};
const key=(value:unknown)=>{if(typeof value==='number'&&Number.isSafeInteger(value)&&value>=0)return String(value);if(typeof value==='string'&&/^\d{1,20}$/.test(value))return value;throw new ImportError('template_invalid');};
const bits=(value:unknown)=>{if(value===undefined)return 0n;if(typeof value==='number'&&Number.isSafeInteger(value)&&value>=0)return BigInt(value);if(typeof value==='string'&&/^\d{1,40}$/.test(value))return BigInt(value);throw new ImportError('template_invalid');};
export const mappedPermissions=(value:unknown)=>{const source=bits(value);return mappings.flatMap(([bit,names])=>(source&(1n<<BigInt(bit)))!==0n?names:[]);};
const integer=(value:unknown,max:number)=>{if(value===undefined||value===null)return 0;if(!Number.isInteger(value)||Number(value)<0||Number(value)>max)throw new ImportError('template_invalid');return Number(value);};
const list=(value:unknown,max:number)=>{if(!Array.isArray(value)||value.length>max)throw new ImportError('template_too_large');return value.map(object);};
export function templateCode(input:unknown){
 if(typeof input!=='string'||input.length>250)throw new ImportError('template_link_required');let code=input.trim();if(/\/\.{1,2}(?:\/|$)/.test(code))throw new ImportError('template_link_required');
 if(code.includes('://')){let url:URL;try{url=new URL(code);}catch{throw new ImportError('template_link_required');}if(url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash)throw new ImportError('template_link_required');const host=url.hostname.toLowerCase();const match=host==='discord.new'?url.pathname.match(/^\/([\w-]+)\/?$/):['discord.com','www.discord.com','discordapp.com'].includes(host)?url.pathname.match(/^\/template\/([\w-]+)\/?$/):null;if(!match)throw new ImportError('template_link_required');code=match[1];}
 if(!/^[A-Za-z0-9_-]{2,100}$/.test(code))throw new ImportError('template_link_required');return code;
}
export function normalizeTemplate(input:unknown){
 const root=object(input),guild=object(root.serialized_source_guild),sourceRoles=list(guild.roles,50),sourceChannels=list(guild.channels,250),roleIds=new Set<string>(),channelIds=new Set<string>();
 const roles=sourceRoles.map((role,index)=>{const id=key(role.id);if(roleIds.has(id))throw new ImportError('template_invalid');roleIds.add(id);const name=text(role.name,100,true),color=integer(role.color,0xffffff);return {key:id,name,color:color?'#'+color.toString(16).padStart(6,'0'):null,hoist:role.hoist===true,position:integer(role.position??index,1000),permissions:mappedPermissions(role.permissions),isDefault:id==='0'&&name==='@everyone'};});
 if(roles.filter(role=>role.isDefault).length!==1)throw new ImportError('template_invalid');
 for(const channel of sourceChannels){const id=key(channel.id);if(channelIds.has(id))throw new ImportError('template_invalid');channelIds.add(id);}
 const excluded=new Set(sourceChannels.filter(channel=>![0,2,4,5].includes(Number(channel.type))||list(channel.permission_overwrites??[],100).some(overwrite=>Number(overwrite.type)===1)).map(channel=>key(channel.id)));
 const categories=sourceChannels.filter(channel=>channel.type===4&&!excluded.has(key(channel.id))).map(channel=>({key:key(channel.id),name:text(channel.name,100,true),position:integer(channel.position,1000)}));
 if(categories.length>50)throw new ImportError('template_too_large');const categoryIds=new Set(categories.map(category=>category.key));
 const channels=sourceChannels.filter(channel=>channel.type!==4&&!excluded.has(key(channel.id))).flatMap(channel=>{
  const parent=channel.parent_id===null||channel.parent_id===undefined?null:key(channel.parent_id);if(parent!==null&&!categoryIds.has(parent)){if(excluded.has(parent)){excluded.add(key(channel.id));return [];}throw new ImportError('template_invalid');}
  const seen=new Set<string>(),overwrites=list(channel.permission_overwrites??[],100).map(overwrite=>{const role=key(overwrite.id);if(Number(overwrite.type)!==0||!roleIds.has(role)||seen.has(role))throw new ImportError('template_invalid');seen.add(role);return {roleKey:role,allow:mappedPermissions(overwrite.allow),deny:mappedPermissions(overwrite.deny)};});
  return [{key:key(channel.id),name:text(channel.name,100,true),type:channel.type===2?'voice':'text',categoryKey:parent,position:integer(channel.position,1000),topic:text(channel.topic,1024),slowmode:integer(channel.rate_limit_per_user,21600),ageRestricted:channel.nsfw===true,userLimit:integer(channel.user_limit,99),overwrites}];
 });
 if(!channels.length||channels.length>200)throw new ImportError('template_too_large');
 return {name:text(guild.name??root.name,100,true),description:text(root.description,120),roles,categories,channels,skipped:excluded.size};
}
export type DiscordTemplate=ReturnType<typeof normalizeTemplate>;
export async function fingerprint(template:DiscordTemplate){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(template)));return [...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2,'0')).join('');}
export function importPayload(template:DiscordTemplate,id:string,name?:string){
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))throw new ImportError('invalid_request');
 const roleIds=new Map(template.roles.map(role=>[role.key,crypto.randomUUID()])),categoryIds=new Map(template.categories.map(category=>[category.key,crypto.randomUUID()])),channelIds=new Map(template.channels.map(channel=>[channel.key,crypto.randomUUID()]));
 return {id,name:name?text(name,100,true):template.name,description:template.description,iconColor:'#5865f2',memberRoleIds:[],roles:template.roles.map(({key,...role})=>({...role,id:roleIds.get(key)})),categories:template.categories.map(({key,...category})=>({...category,id:categoryIds.get(key)})),channels:template.channels.map(({key,categoryKey,overwrites,...channel})=>({...channel,id:channelIds.get(key),categoryId:categoryKey?categoryIds.get(categoryKey):null})),overwrites:template.channels.flatMap(channel=>channel.overwrites.map(overwrite=>({channelId:channelIds.get(channel.key),roleId:roleIds.get(overwrite.roleKey),allow:overwrite.allow,deny:overwrite.deny}))),systemChannelId:null};
}
async function boundedJSON(body:ReadableStream<Uint8Array>|null,max:number){if(!body)throw new ImportError('invalid_request');const reader=body.getReader(),chunks:Uint8Array[]=[];let size=0;try{while(true){const{done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw new ImportError('template_too_large',413);}chunks.push(value);}}finally{reader.releaseLock();}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new ImportError('template_invalid');}}
export async function fetchTemplate(code:string,fetcher:typeof fetch=fetch){
 let response:Response;try{response=await fetcher('https://discord.com/api/v10/guilds/templates/'+encodeURIComponent(code),{redirect:'error',signal:AbortSignal.timeout(8000),headers:{Accept:'application/json','User-Agent':'ONYX (https://onyxchat.site, 1)'}});}catch{throw new ImportError('discord_unavailable',502);}
 if(response.status===429)throw new ImportError('discord_rate_limited',429);if(response.status===404)throw new ImportError('template_unavailable',404);if(!response.ok)throw new ImportError('discord_unavailable',502);
 return normalizeTemplate(await boundedJSON(response.body,1_000_000));
}
interface Dependencies{user:(jwt:string)=>Promise<string|null>;rpc:(jwt:string,name:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:unknown}>;fetcher?:typeof fetch}
const origins=new Set(['https://onyxchat.site','https://www.onyxchat.site','http://127.0.0.1:5173','http://localhost:5173']);
export function createDiscordImportHandler(deps:Dependencies){return async(request:Request)=>{
 const origin=request.headers.get('origin');const headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'};if(origin&&origins.has(origin))headers['Access-Control-Allow-Origin']=origin;
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(origin&&!origins.has(origin))return reply({error:'origin_denied'},403);if(request.method==='OPTIONS')return new Response(null,{status:204,headers});if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
 try{
  const jwt=request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];if(!jwt||jwt.length>16000||!await deps.user(jwt))throw new ImportError('sign_in_required',401);
  const body=object(await boundedJSON(request.body,4096));if(!['preview','import'].includes(String(body.action)))throw new ImportError('invalid_request');const code=templateCode(body.code);
  const gate=await deps.rpc(jwt,'discord_import_gate',{p_kind:body.action});if(gate.error){const message=JSON.stringify(gate.error);throw new ImportError(message.includes('rate limited')?'import_rate_limited':'not_allowed',message.includes('rate limited')?429:403);}
  const template=await fetchTemplate(code,deps.fetcher),hash=await fingerprint(template);
  if(body.action==='preview')return reply({name:template.name,description:template.description,roles:template.roles.length,categories:template.categories.length,channels:template.channels.length,examples:template.channels.slice(0,8).map(channel=>({name:channel.name,type:channel.type})),skipped:template.skipped,fingerprint:hash});
  if(typeof body.fingerprint!=='string'||hash!==body.fingerprint)throw new ImportError('template_changed',409);
  const payload=importPayload(template,String(body.requestId),body.name===undefined?undefined:text(body.name,100,true));const result=await deps.rpc(jwt,'import_discord_server',{p:payload});if(result.error){const message=JSON.stringify(result.error);throw new ImportError(message.includes('server limit')?'server_limit':'import_failed',409);}return reply({serverId:result.data});
 }catch(error){return reply({error:error instanceof ImportError?error.code:'import_failed'},error instanceof ImportError?error.status:500);}
};}
