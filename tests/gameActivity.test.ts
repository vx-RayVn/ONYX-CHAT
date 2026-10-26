import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSteamProfile,fetchSteamProfile} from '../supabase/functions/_shared/steam-profile.ts';
import {createActivityHandler} from '../supabase/functions/_shared/activity-handler.ts';
import {createSocialHandler} from '../supabase/functions/_shared/social-handler.ts';
import {hashState} from '../supabase/functions/_shared/steam.ts';
const id='76561198000000001';
const xml=(extra='')=>`<?xml version="1.0"?><profile><steamID64>${id}</steamID64><steamID><![CDATA[SyntheticSteamPlayer]]></steamID>${extra}</profile>`;
test('Steam persona comes from the matching profile rather than the numeric identifier',()=>{
 assert.deepEqual(parseSteamProfile(xml(),id),{steam_id:id,name:'SyntheticSteamPlayer',title:null,key:null});
 assert.equal(parseSteamProfile(xml().replace('SyntheticSteamPlayer','A & B <name>'),id).name,'A & B <name>');
});
test('Steam public game is displayed only with an in-game state and canonical app id',()=>{
 const content='<onlineState>in-game</onlineState><inGameInfo><gameName><![CDATA[Counter-Strike 2]]></gameName><gameLink><![CDATA[https://store.steampowered.com/app/730/]]></gameLink></inGameInfo>';
 assert.equal(parseSteamProfile(xml(content),id).key,'steam:730');
 assert.equal(parseSteamProfile(xml(content.replace('in-game','offline')),id).title,null);
 assert.equal(parseSteamProfile(xml(content.replace('https://store.steampowered.com','https://attacker.invalid')),id).title,null);
});
test('Steam parser rejects wrong identities, external entities and oversized responses',()=>{
 assert.throws(()=>parseSteamProfile(xml(), '76561198000000002'));
 assert.throws(()=>parseSteamProfile('<!DOCTYPE evil>'+xml(),id));
 assert.throws(()=>parseSteamProfile(xml()+' '.repeat(260000),id));
 assert.equal(parseSteamProfile(xml().replace('<![CDATA[SyntheticSteamPlayer]]>','A &amp; B &#x26; C'),id).name,'A & B & C');
});
test('Steam profile fetch uses only the fixed Steam host and fails closed on redirects',async()=>{
 const result=await fetchSteamProfile(id,'',async(url,init)=>{assert.equal(String(url),`https://steamcommunity.com/profiles/${id}/?xml=1`);assert.equal(init?.redirect,'error');assert.ok(init?.signal);return new Response(xml());});
 assert.equal(result.name,'SyntheticSteamPlayer');await assert.rejects(()=>fetchSteamProfile('https://attacker.invalid'));
});
test('optional Steam Web API key stays server-side and absent games clear activity',async()=>{
 const result=await fetchSteamProfile(id,'synthetic-key',async(url)=>{assert.equal(new URL(String(url)).hostname,'api.steampowered.com');return Response.json({response:{players:[{steamid:id,personaname:'Persona'}]}});});
 assert.equal(result.name,'Persona');assert.equal(result.title,null);assert.ok(!JSON.stringify(result).includes('synthetic-key'));
});
test('new Steam starts use the ONYX site realm while old frontends remain compatible',async()=>{
 const handler=createSocialHandler({env:k=>k==='SUPABASE_URL'?'https://project.invalid':'',user:async()=>id,rpc:async()=>({data:null,error:null})});
 for(const site_callback of [true,false]){
  const response=await handler(new Request('https://project.invalid/functions/v1/connections',{method:'POST',headers:{Authorization:'Bearer fixture'},body:JSON.stringify({action:'start',provider:'steam',binding:'b'.repeat(43),origin:'https://onyxchat.site',site_callback})}));
  const body=await response.json(),url=new URL(body.url);assert.equal(response.status,200);
  assert.equal(url.searchParams.get('openid.realm'),site_callback?'https://onyxchat.site/':'https://project.invalid/');
  assert.equal(new URL(url.searchParams.get('openid.return_to')!).pathname,site_callback?'/connections/steam-return.html':'/functions/v1/connections/callback/steam');
 }
});
const token='onyx_activity_'+'a'.repeat(64),actor='00000000-0000-4000-8000-000000000001';
function activity(){const calls:{name:string;args:Record<string,unknown>}[]=[];const handler=createActivityHandler({env:()=>'',user:async jwt=>jwt==='user-fixture'?actor:null,rpc:async(name,args)=>{calls.push({name,args});return {data:args.p_action==='steam_begin'?{steam_id:id}:{enabled:true,devices:[]},error:null};},fetcher:async()=>new Response(xml())});return {calls,handler};}
const request=(route:string,body:unknown={},jwt='user-fixture')=>new Request('https://project.invalid/functions/v1/activity/'+route,{method:'POST',headers:jwt?{Authorization:'Bearer '+jwt}:{},body:JSON.stringify(body)});
test('device tokens can only publish or disconnect and never act as general ONYX sessions',async()=>{
 const {handler,calls}=activity();assert.equal((await handler(request('publish',{title:'Game',key:'custom:game'},token))).status,200);
 assert.equal(calls[0].name,'activity_publish_artwork');assert.equal(calls[0].args.p_hash,await hashState(token));assert.ok(!JSON.stringify(calls).includes(token));
 assert.equal((await handler(request('settings',{enabled:false},token))).status,401);
 assert.equal((await handler(request('publish',{title:'Game',key:'x'},'user-fixture'))).status,401);
 assert.equal((await handler(request('disconnect',{},token))).status,200);assert.equal(calls.at(-1)?.name,'activity_disconnect');
});
test('pairing and privacy use the authenticated actor and validate all input',async()=>{
 const {handler,calls}=activity();assert.equal((await handler(request('pair',{hash:'a'.repeat(64),name:'Windows',user_id:'attacker'}))).status,200);assert.equal(calls[0].args.p_user,actor);
 assert.equal((await handler(request('pair',{hash:'bad',name:'Windows'}))).status,400);assert.equal((await handler(request('settings',{enabled:'true'}))).status,400);
 assert.equal((await handler(request('settings',{enabled:false},''))).status,401);
});
test('game input rejects control characters, injected keys and oversized bodies',async()=>{
 const {handler,calls}=activity();for(const body of [{title:'bad\nname',key:'game'},{title:'Game',key:'https://evil'},{title:'x'.repeat(5000),key:'game'}])assert.ok((await handler(request('publish',body,token))).status>=400);
 assert.equal(calls.length,0);
});
test('Steam refresh can only refresh the caller linked identity and does not return provider data',async()=>{
 const {handler,calls}=activity(),response=await handler(request('steam',{steam_id:'76561198000000002'}));
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{updated:true});assert.equal(calls[1].args.p_user,actor);assert.equal((calls[1].args.p_data as {steam_id:string}).steam_id,id);
});
