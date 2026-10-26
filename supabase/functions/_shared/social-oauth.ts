/** Identity linking only: fixed providers, minimal scopes, no token persistence. */
export const PROVIDERS = ['steam','twitch','youtube','spotify','epic','xbox','riot'] as const;
export type Provider = typeof PROVIDERS[number];
export type Env = (name:string)=>string;
export interface Identity { external_id:string; display_name:string|null; profile_handle:string|null }
export const isProvider=(value:unknown):value is Provider=>typeof value==='string'&&(PROVIDERS as readonly string[]).includes(value);
const defs = {
 twitch:{authorize:'https://id.twitch.tv/oauth2/authorize',token:'https://id.twitch.tv/oauth2/token',scope:'',pkce:false,basic:false},
 youtube:{authorize:'https://accounts.google.com/o/oauth2/v2/auth',token:'https://oauth2.googleapis.com/token',scope:'https://www.googleapis.com/auth/youtube.readonly',pkce:true,basic:false},
 spotify:{authorize:'https://accounts.spotify.com/authorize',token:'https://accounts.spotify.com/api/token',scope:'user-read-private',pkce:true,basic:true},
 epic:{authorize:'https://www.epicgames.com/id/authorize',token:'https://api.epicgames.dev/epic/oauth/v2/token',scope:'basic_profile',pkce:false,basic:true},
 xbox:{authorize:'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize',token:'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',scope:'XboxLive.signin',pkce:true,basic:false},
 riot:{authorize:'https://auth.riotgames.com/authorize',token:'https://auth.riotgames.com/token',scope:'openid',pkce:true,basic:true},
} as const;
export function providerConfig(provider:Provider,env:Env){
 if(provider==='steam')return true;
 const prefix=`CONNECTIONS_${provider.toUpperCase()}`;
 return env(prefix+'_ENABLED')==='true'&&!!env(prefix+'_CLIENT_ID')&&!!env(prefix+'_CLIENT_SECRET')
  &&(provider!=='epic'||!!env(prefix+'_DEPLOYMENT_ID'))
  &&(provider!=='xbox'||!!env(prefix+'_RELYING_PARTY')&&!!env(prefix+'_SANDBOX_ID'));
}
const b64url=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
export const randomSecret=()=>b64url(crypto.getRandomValues(new Uint8Array(32)));
export const pkceChallenge=async(verifier:string)=>b64url(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
export async function authorizationURL(provider:Exclude<Provider,'steam'>,state:string,callback:string,verifier:string,env:Env){
 const def=defs[provider],url=new URL(def.authorize);
 url.search=new URLSearchParams({client_id:env(`CONNECTIONS_${provider.toUpperCase()}_CLIENT_ID`),response_type:'code',redirect_uri:callback,state,scope:def.scope}).toString();
 if(def.pkce){url.searchParams.set('code_challenge',await pkceChallenge(verifier));url.searchParams.set('code_challenge_method','S256');}
 if(provider==='twitch')url.searchParams.set('force_verify','true');
 if(provider==='youtube')url.searchParams.set('prompt','select_account');
 return url.toString();
}
const text=(value:unknown,max=128)=>{if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u001f\u007f]/.test(value))throw Error('invalid identity');return value;};
const name=(value:unknown)=>typeof value==='string'&&value.trim()?value.replace(/[\u0000-\u001f\u007f]/g,'').slice(0,100):null;
async function json(fetcher:typeof fetch,url:string,init:RequestInit={}){
 const response=await fetcher(url,{...init,redirect:'error',signal:AbortSignal.timeout(10_000)});
 if(!response.ok)throw Error(response.status===429?'provider_rate_limited':'provider_rejected');
 const body=await response.text();if(body.length>256_000)throw Error('invalid provider response');
 return JSON.parse(body);
}
export async function exchangeIdentity(provider:Exclude<Provider,'steam'>,code:string,callback:string,verifier:string,env:Env,fetcher:typeof fetch=fetch):Promise<Identity>{
 const def=defs[provider],prefix=`CONNECTIONS_${provider.toUpperCase()}`,client=env(prefix+'_CLIENT_ID'),secret=env(prefix+'_CLIENT_SECRET');
 const body=new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:callback});
 const headers:Record<string,string>={'Content-Type':'application/x-www-form-urlencoded'};
 if(def.basic)headers.Authorization='Basic '+btoa(client+':'+secret);else{body.set('client_id',client);body.set('client_secret',secret);}
 if(def.pkce)body.set('code_verifier',verifier);
 if(provider==='epic'){body.set('deployment_id',env(prefix+'_DEPLOYMENT_ID'));body.set('scope',def.scope);}
 const token=await json(fetcher,def.token,{method:'POST',headers,body});
 const access=text(token.access_token,16000);
 if(typeof token.token_type!=='string'||token.token_type.toLowerCase()!=='bearer')throw Error('invalid token');
 const auth={Authorization:'Bearer '+access};
 try{
  if(provider==='twitch'){
   const verified=await json(fetcher,'https://id.twitch.tv/oauth2/validate',{headers:{Authorization:'OAuth '+access}});
   if(verified.client_id!==client||typeof verified.user_id!=='string')throw Error('wrong token audience');
   const profile=await json(fetcher,'https://api.twitch.tv/helix/users',{headers:{...auth,'Client-Id':client}}),user=profile.data?.[0];
   if(profile.data?.length!==1||user?.id!==verified.user_id||!/^\d{1,30}$/.test(user.id)||!/^[a-z0-9_]{1,25}$/i.test(user.login))throw Error('invalid identity');
   return {external_id:user.id,display_name:name(user.display_name),profile_handle:user.login};
  }
  if(provider==='spotify'){
   const profile=await json(fetcher,'https://api.spotify.com/v1/me',{headers:auth});
   // Spotify's current API explicitly requires account_id for stable linking; id is mutable.
   return {external_id:text(profile.account_id),display_name:name(profile.display_name),profile_handle:text(profile.id)};
  }
  if(provider==='youtube'){
   const profile=await json(fetcher,'https://www.googleapis.com/youtube/v3/channels?part=id%2Csnippet&mine=true',{headers:auth});
   if(profile.items?.length!==1||!/^UC[A-Za-z0-9_-]{22}$/.test(profile.items[0]?.id))throw Error('channel unavailable');
   return {external_id:profile.items[0].id,display_name:name(profile.items[0].snippet?.title),profile_handle:null};
  }
  if(provider==='epic'){
   const info=await json(fetcher,'https://api.epicgames.dev/epic/oauth/v2/tokenInfo',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:access})});
   if(info.active!==true||info.client_id!==client||!/^[a-f0-9]{32}$/i.test(info.account_id))throw Error('wrong token audience');
   const profile=await json(fetcher,'https://api.epicgames.dev/epic/id/v2/accounts?accountId='+encodeURIComponent(info.account_id),{headers:auth});
   const account=Array.isArray(profile)?profile.find((p:{accountId?:string})=>p.accountId===info.account_id):null;
   if(!account)throw Error('account unavailable');
   return {external_id:info.account_id,display_name:name(account.displayName),profile_handle:null};
  }
  if(provider==='riot'){
   const profile=await json(fetcher,'https://europe.api.riotgames.com/riot/account/v1/accounts/me',{headers:auth});
   return {external_id:text(profile.puuid),display_name:name(profile.gameName&&profile.tagLine?profile.gameName+'#'+profile.tagLine:null),profile_handle:null};
  }
  const xboxHeaders={'Content-Type':'application/json','x-xbl-contract-version':'1'};
  const user=await json(fetcher,'https://user.auth.xboxlive.com/user/authenticate',{method:'POST',headers:xboxHeaders,body:JSON.stringify({RelyingParty:'http://auth.xboxlive.com',TokenType:'JWT',Properties:{AuthMethod:'RPS',SiteName:'user.auth.xboxlive.com',RpsTicket:'d='+access}})});
  const xsts=await json(fetcher,'https://xsts.auth.xboxlive.com/xsts/authorize',{method:'POST',headers:xboxHeaders,body:JSON.stringify({RelyingParty:env(prefix+'_RELYING_PARTY'),TokenType:'JWT',Properties:{SandboxId:env(prefix+'_SANDBOX_ID'),UserTokens:[text(user.Token,16000)]}})});
  const claims=xsts.DisplayClaims?.xui;
  const users=user.DisplayClaims?.xui;
  if(!Array.isArray(claims)||claims.length!==1||!Array.isArray(users)||users.length!==1||!users[0]?.uhs||claims[0]?.uhs!==users[0].uhs||!/^\d{1,20}$/.test(claims[0]?.xid)||!claims[0]?.gtg)throw Error('Xbox identity unavailable');
  return {external_id:claims[0].xid,display_name:name(claims[0].gtg),profile_handle:text(claims[0].gtg,100)};
 }finally{
  // A verified profile is kept, never access or refresh tokens. Revoke where supported.
  let revoke:RequestInit|undefined,url='';
  if(provider==='twitch'){url='https://id.twitch.tv/oauth2/revoke';revoke={method:'POST',body:new URLSearchParams({client_id:client,token:access})};}
  if(provider==='youtube'){url='https://oauth2.googleapis.com/revoke';revoke={method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:token.refresh_token||access})};}
  if(provider==='epic'){url='https://api.epicgames.dev/epic/oauth/v2/revoke';revoke={method:'POST',headers,body:new URLSearchParams({token:token.refresh_token||access})};}
  if(revoke)try{await fetcher(url,{...revoke,redirect:'error',signal:AbortSignal.timeout(3000)});}catch{/* Token is discarded even when the provider's revoke service is unavailable. */}
 }
}
