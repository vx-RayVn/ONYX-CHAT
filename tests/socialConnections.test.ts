import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizationURL,exchangeIdentity,providerConfig,PROVIDERS,pkceChallenge,type Provider} from '../supabase/functions/_shared/social-oauth.ts';
import {createSocialHandler} from '../supabase/functions/_shared/social-handler.ts';
import {hashState} from '../supabase/functions/_shared/steam.ts';
import {connectionURL} from '../src/lib/socialConnections.ts';

const callback='https://project.invalid/functions/v1/connections/callback/twitch';
const env=(key:string)=>key==='SUPABASE_URL'?'https://project.invalid':key.endsWith('_ENABLED')?'true':key.endsWith('_CLIENT_ID')?'synthetic-client':key.endsWith('_CLIENT_SECRET')?'synthetic-secret':key.endsWith('_DEPLOYMENT_ID')?'synthetic-deployment':key.endsWith('_RELYING_PARTY')?'rp://onyx.example/':key.endsWith('_SANDBOX_ID')?'synthetic-sandbox':'';
const responses=(changes:Record<string,unknown>={})=>({
 'https://id.twitch.tv/oauth2/token':{access_token:'synthetic-access',token_type:'Bearer'},
 'https://id.twitch.tv/oauth2/validate':{client_id:'synthetic-client',user_id:'123'},
 'https://api.twitch.tv/helix/users':{data:[{id:'123',display_name:'Streamer',login:'streamer'}]},
 'https://accounts.spotify.com/api/token':{access_token:'synthetic-access',token_type:'Bearer'},
 'https://api.spotify.com/v1/me':{account_id:'immutable-spotify-account',id:'changeable-profile-id',display_name:'Listener'},
 'https://oauth2.googleapis.com/token':{access_token:'synthetic-access',token_type:'Bearer'},
 'https://www.googleapis.com/youtube/v3/channels?part=id%2Csnippet&mine=true':{items:[{id:'UC'+'a'.repeat(22),snippet:{title:'Creator'}}]},
 'https://api.epicgames.dev/epic/oauth/v2/token':{access_token:'synthetic-access',token_type:'Bearer'},
 'https://api.epicgames.dev/epic/oauth/v2/tokenInfo':{active:true,client_id:'synthetic-client',account_id:'a'.repeat(32)},
 ['https://api.epicgames.dev/epic/id/v2/accounts?accountId='+'a'.repeat(32)]:[{accountId:'a'.repeat(32),displayName:'Epic player'}],
 'https://auth.riotgames.com/token':{access_token:'synthetic-access',token_type:'Bearer'},
 'https://europe.api.riotgames.com/riot/account/v1/accounts/me':{puuid:'stable-riot-puuid',gameName:'Player',tagLine:'EUW'},
 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token':{access_token:'synthetic-access',token_type:'Bearer'},
 'https://user.auth.xboxlive.com/user/authenticate':{Token:'synthetic-xbox-user',DisplayClaims:{xui:[{uhs:'same-user'}]}},
 'https://xsts.auth.xboxlive.com/xsts/authorize':{DisplayClaims:{xui:[{uhs:'same-user',xid:'2533274991020393',gtg:'Player One'}]}},
 ...changes,
});
function providerFetch(changes:Record<string,unknown>={},calls:{url:string;init?:RequestInit}[]=[]):typeof fetch{
 const fixtures=responses(changes);
 return async(url,init)=>{
  const target=String(url);calls.push({url:target,init});assert.equal(init?.redirect,'error');assert.ok(init?.signal);
  if(target.endsWith('/revoke'))return new Response(null,{status:200});
  assert.ok(target in fixtures,'Unexpected provider URL: '+target);
  return new Response(JSON.stringify(fixtures[target as keyof typeof fixtures]),{headers:{'Content-Type':'application/json'}});
 };
}
test('PKCE uses the RFC 7636 S256 transform',async()=>{
 assert.equal(await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
});
test('provider activation requires both explicit enablement and server configuration',()=>{
 for(const provider of PROVIDERS){assert.equal(providerConfig(provider,env),true);assert.equal(providerConfig(provider,()=>''),provider==='steam');}
 assert.equal(providerConfig('xbox',key=>key.endsWith('_RELYING_PARTY')?'':env(key)),false);
});
for(const provider of PROVIDERS.filter(p=>p!=='steam'))test(provider+' authorization is code based, state bound and uses fixed hosts with minimal scopes',async()=>{
 const url=new URL(await authorizationURL(provider,'test-state',callback,'v'.repeat(43),env));
 assert.equal(url.searchParams.get('state'),'test-state');assert.equal(url.searchParams.get('redirect_uri'),callback);assert.equal(url.searchParams.get('response_type'),'code');
 assert.ok(!url.searchParams.get('scope')?.includes('offline_access'));assert.ok(!url.searchParams.get('scope')?.includes('email'));
 assert.equal(url.searchParams.get('code_challenge_method'),['twitch','epic'].includes(provider)?null:'S256');
});
for(const provider of PROVIDERS.filter(p=>p!=='steam'))test(provider+' exchanges only on the server and returns a verified identity without tokens',async()=>{
 const calls:{url:string;init?:RequestInit}[]=[];
 const result=await exchangeIdentity(provider,'synthetic-code',callback,'v'.repeat(43),env,providerFetch({},calls));
 assert.ok(result.external_id);assert.ok(result.display_name);assert.ok(!JSON.stringify(result).includes('synthetic-access'));
 assert.equal((calls[0].init!.body as URLSearchParams).get('code'),'synthetic-code');
 if(provider==='spotify'){assert.equal(result.external_id,'immutable-spotify-account');assert.equal(result.profile_handle,'changeable-profile-id');}
 if(provider==='xbox')assert.ok(String(calls.find(c=>c.url.includes('/xsts/'))?.init?.body).includes('rp://onyx.example/'));
});
test('wrong Twitch token audience or identity is rejected',async()=>{
 await assert.rejects(()=>exchangeIdentity('twitch','code',callback,'v'.repeat(43),env,providerFetch({'https://id.twitch.tv/oauth2/validate':{client_id:'other-client',user_id:'123'}})));
 await assert.rejects(()=>exchangeIdentity('twitch','code',callback,'v'.repeat(43),env,providerFetch({'https://api.twitch.tv/helix/users':{data:[{id:'456',login:'other'}]}})));
});
test('Spotify requires the new immutable account_id; a mutable profile id alone cannot be linked',async()=>{
 await assert.rejects(()=>exchangeIdentity('spotify','code',callback,'v'.repeat(43),env,providerFetch({'https://api.spotify.com/v1/me':{id:'old-only'}})));
});
test('YouTube without a channel and ambiguous Xbox claims fail honestly',async()=>{
 await assert.rejects(()=>exchangeIdentity('youtube','code',callback,'v'.repeat(43),env,providerFetch({'https://www.googleapis.com/youtube/v3/channels?part=id%2Csnippet&mine=true':{items:[]}})));
 await assert.rejects(()=>exchangeIdentity('xbox','code',callback,'v'.repeat(43),env,providerFetch({'https://xsts.auth.xboxlive.com/xsts/authorize':{DisplayClaims:{xui:[{uhs:'other-user',xid:'1',gtg:'Wrong'}]}}})));
});
test('Epic verifies token audience instead of trusting an account id from the browser',async()=>{
 await assert.rejects(()=>exchangeIdentity('epic','code',callback,'v'.repeat(43),env,providerFetch({'https://api.epicgames.dev/epic/oauth/v2/tokenInfo':{active:true,client_id:'wrong-client',account_id:'a'.repeat(32)}})));
});
test('profile links use fixed origins and encode provider identities',()=>{
 const item={user_id:'fixture',provider:'spotify' as const,external_id:'immutable-id',profile_handle:'some/id?x=1',display_name:'Test',is_visible:true};
 assert.equal(connectionURL(item),'https://open.spotify.com/user/some%2Fid%3Fx%3D1');
 assert.equal(connectionURL({...item,provider:'epic'}),null);
});
test('HTTP linking needs Auth, same account/browser binding and a fresh callback receipt',async()=>{
 const actor='00000000-0000-4000-8000-0000000000e1',other='00000000-0000-4000-8000-0000000000e2';
 let pending:Record<string,unknown>={},receipt='',linked=false,claimed=false;
 const calls:string[]=[];
 const handler=createSocialHandler({env,user:async jwt=>jwt==='fixture-jwt'?actor:other,fetcher:providerFetch(),rpc:async(name,args)=>{
  calls.push(name);
  if(name==='social_start'){pending=args;return {data:null,error:null};}
  if(name==='social_claim'){
   if(args.p_hash!==pending.p_state_hash||claimed)return {data:null,error:{message:'invalid state'}};claimed=true;
   return {data:{origin:pending.p_origin,verifier:pending.p_verifier},error:null};
  }
  if(name==='social_verify'){receipt=args.p_receipt as string;assert.equal(args.p_external_id,'123');return {data:null,error:null};}
  if(name==='social_finish'){
   if(args.p_user!==pending.p_user||args.p_binding!==pending.p_binding_hash||args.p_receipt!==receipt)return {data:null,error:{message:'invalid state'}};
   linked=true;return {data:'twitch',error:null};
  }
  throw Error('unexpected RPC');
 }});
 const post=(body:unknown,jwt='fixture-jwt')=>handler(new Request('https://project.invalid/functions/v1/connections',{method:'POST',headers:{Authorization:'Bearer '+jwt},body:JSON.stringify(body)}));
 assert.equal((await handler(new Request('https://project.invalid/functions/v1/connections',{method:'POST',body:'{}'}))).status,401);
 const start=await(await post({action:'start',provider:'twitch',binding:'b'.repeat(43),origin:'https://evil.invalid',user_id:other})).json();
 assert.equal(pending.p_user,actor);assert.equal(pending.p_origin,'https://onyxchat.site');assert.equal(pending.p_binding_hash,await hashState('b'.repeat(43)));
 const response=await handler(new Request(callback+'?state='+start.state+'&code=synthetic-code'));
 assert.equal(response.status,303);assert.equal(linked,false);assert.ok(!calls.includes('social_finish'));
 const returned=new URL(response.headers.get('Location')!),params=new URLSearchParams(returned.hash.slice(1));assert.equal(returned.origin,'https://onyxchat.site');assert.ok(!returned.href.includes('synthetic-access'));
 const finish={action:'finish',state:start.state,receipt:params.get('receipt'),binding:'b'.repeat(43)};
 assert.equal((await post(finish,'other-account-jwt')).status,400);assert.equal(linked,false);
 assert.equal((await post({...finish,binding:'c'.repeat(43)})).status,400);assert.equal(linked,false);
 assert.equal((await post(finish)).status,200);assert.equal(linked,true);
 const replay=await handler(new Request(callback+'?state='+start.state+'&code=synthetic-code'));assert.ok(replay.headers.get('Location')!.includes('connection=failed'));
});
test('missing setup, duplicate fields and unsupported providers never reach provider services',async()=>{
 let count=0;
 const handler=createSocialHandler({env:key=>key==='SUPABASE_URL'?'https://project.invalid':'',user:async()=> 'fixture',rpc:async()=>{count++;return {data:null,error:null};},fetcher:async()=>{throw Error('must not fetch');}});
 const status=await handler(new Request('https://project.invalid/functions/v1/connections/providers'));const body=await status.json();
 assert.deepEqual(body.providers.filter((p:{available:boolean})=>p.available).map((p:{id:string})=>p.id),['steam']);
 for(const provider of ['spotify','playstation'])assert.ok((await handler(new Request('https://project.invalid/functions/v1/connections',{method:'POST',headers:{Authorization:'Bearer fixture'},body:JSON.stringify({action:'start',provider,binding:'b'.repeat(43)})}))).status>=400);
 await handler(new Request(callback+'?state='+'a'.repeat(43)+'&state='+'b'.repeat(43)+'&code=anything'));
 assert.equal(count,0);
});
