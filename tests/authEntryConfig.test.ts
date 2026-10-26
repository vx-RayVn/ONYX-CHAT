import test from 'node:test';
import assert from 'node:assert/strict';
import{readFileSync}from'node:fs';
import{runInNewContext}from'node:vm';
const source=readFileSync(new URL('../supabase/functions/auth-entry-config/index.ts',import.meta.url),'utf8');
function fixture({siteKey='0xSyntheticPublicFixtureOnly20',allowed=true,networkFailure=false}={}){
 let handler!:(request:Request)=>Promise<Response>;const requests:{url:string;key:string|null}[]=[];
 runInNewContext(source,{Deno:{serve:(f:typeof handler)=>handler=f,env:{get:(key:string)=>key==='TURNSTILE_SITE_KEY'?siteKey:key==='SUPABASE_URL'?'https://project.supabase.invalid':'private-env-must-not-leak'}},Response,AbortSignal,fetch:async(url:string,options:RequestInit)=>{if(networkFailure)throw Error('offline');requests.push({url,key:new Headers(options.headers).get('apikey')});return new Response('{}',{status:allowed?200:401});}});
 return{request:(method='GET',key='public-fixture-key')=>handler(new Request('https://project.supabase.invalid/functions/v1/auth-entry-config',{method,headers:key?{apikey:key}:{}})),requests};
}
test('pre-auth configuration validates the public API key at Auth and exposes only public widget configuration',async()=>{
 const app=fixture(),response=await app.request();assert.equal(response.status,200);assert.deepEqual(await response.json(),{siteKey:'0xSyntheticPublicFixtureOnly20',minAge:16});assert.deepEqual(app.requests,[{url:'https://project.supabase.invalid/auth/v1/settings',key:'public-fixture-key'}]);assert.equal(response.headers.get('Cache-Control'),'no-store');
});
test('configuration is unavailable for invalid keys, failed gateways, missing configuration or dummy widgets',async()=>{
 assert.equal((await fixture().request('GET','')).status,401);
 assert.equal((await fixture({allowed:false}).request()).status,401);
 assert.equal((await fixture({networkFailure:true}).request()).status,503);
 for(const siteKey of ['','1x00000000000000000000AA','not-a-key'])assert.equal((await fixture({siteKey}).request()).status,503);
});
test('the configuration endpoint permits preflight and GET but no mutations',async()=>{
 const app=fixture();assert.equal((await app.request('OPTIONS','')).status,204);assert.equal((await app.request('POST')).status,405);assert.equal(app.requests.length,0);
});
