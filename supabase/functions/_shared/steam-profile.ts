/** Public Steam profile data, separate from the signed identity proof. Never trust a supplied URL. */
export interface SteamProfile {steam_id:string;name:string|null;title:string|null;key:string|null}
const clean=(value:string,max:number)=>value.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,max)||null;
export function parseSteamProfile(xml:string,id:string):SteamProfile {
 if(xml.length>256000||/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('invalid Steam profile');
 const field=(tag:string)=>{
  const match=xml.match(new RegExp('<'+tag+'>([\\s\\S]*?)</'+tag+'>'))?.[1];if(!match)return '';
  if(match.startsWith('<![CDATA[')&&match.endsWith(']]>'))return match.slice(9,-3);
  if(match.includes('<'))throw Error('invalid Steam field');
  const entities:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
  return match.replace(/&#(x[0-9a-f]+|[0-9]+);|&(amp|lt|gt|quot|apos);/gi,(_,num,named)=>num?String.fromCodePoint(Math.min(0x10ffff,parseInt(num.replace(/^x/i,''),/^x/i.test(num)?16:10))):entities[String(named).toLowerCase()]);
 };
 if(!/^\d{17}$/.test(id)||field('steamID64')!==id)throw Error('wrong Steam identity');
 const playing=field('onlineState')==='in-game',name=clean(field('steamID'),100),title=playing?clean(field('gameName'),128):null;
 // gameLink is only interpreted as an app id, never fetched or rendered as an arbitrary URL.
 const app=field('gameLink').match(/^https?:\/\/(?:store\.steampowered\.com\/app|steamcommunity\.com\/app)\/(\d{1,10})(?:\/|$)/)?.[1];
 return {steam_id:id,name,title:title&&app?title:null,key:title&&app?'steam:'+app:null};
}
export async function fetchSteamProfile(id:string,apiKey='',fetcher:typeof fetch=fetch):Promise<SteamProfile>{
 if(!/^\d{17}$/.test(id))throw Error('invalid Steam id');
 const url=apiKey?'https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?'+new URLSearchParams({key:apiKey,steamids:id}):'https://steamcommunity.com/profiles/'+id+'/?xml=1';
 const response=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(6000),headers:{Accept:apiKey?'application/json':'application/xml'}});
 if(!response.ok)throw Error('Steam unavailable');const body=await response.text();if(body.length>256000)throw Error('invalid Steam profile');
 if(!apiKey)return parseSteamProfile(body,id);
 const players=JSON.parse(body).response?.players,p=players?.[0];
 if(players?.length!==1||p?.steamid!==id)throw Error('wrong Steam identity');
 const title=typeof p.gameextrainfo==='string'?clean(p.gameextrainfo,128):null,app=typeof p.gameid==='string'&&/^\d{1,10}$/.test(p.gameid)?p.gameid:null;
 return {steam_id:id,name:typeof p.personaname==='string'?clean(p.personaname,100):null,title:title&&app?title:null,key:title&&app?'steam:'+app:null};
}
