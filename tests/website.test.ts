import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import{renderPage,pageNames}from'../website/render.mjs';
import{publicPage,appLocation,reservedPaths}from'../website/routes.js';
import{createHandler,invitationCode}from'../server-handler.js';
import{locationInvite,parseInvite}from'../src/lib/invites.ts';
import{runInNewContext}from'node:vm';
import{browserBridge}from'../website/browser-bridge.mjs';
import{writeStaticAppEntries,staticAppEntries}from'../website/static-routes.mjs';
import{siteConfig}from'../website/config.mjs';

test('every public route is reserved consistently and English HTML renders without the chat bundle',()=>{
 for(const page of pageNames){const pathname=page==='home'?'/':`/${page}`;assert.equal(publicPage(pathname+'/'),page);assert.equal(locationInvite(pathname,''),null);assert.equal(invitationCode(new URL('https://onyxchat.site'+pathname)),null);const html=renderPage(page);assert.match(html,/<html lang="en"/);assert.equal((html.match(/<h1>/g)||[]).length,1);assert.match(html,/rel="canonical"/);assert.match(html,/social-cover\.(?:png|svg)/);assert.doesNotMatch(html,/src\/main|livekit|krisp|react-dom|<script[^>]*type="module"/);assert.ok(Buffer.byteLength(html)<160_000);}
 for(const path of reservedPaths){assert.equal(parseInvite(`https://onyxchat.site/${path}`),null);assert.equal(locationInvite('/'+path,''),null);assert.equal(locationInvite('/','?invite='+path),null);}
});
test('source release reflects its configured repository and license while private reporting stays in the app',()=>{
 const home=renderPage('home'),source=renderPage('open-source');assert.match(home,/Join as a guest/);assert.match(home,/href="\/app\?guest=1"/);assert.doesNotMatch(home,/Guest access · At launch|Guest access is planned/);assert.equal(Boolean(siteConfig.repositoryUrl),Boolean(siteConfig.license));
 if(siteConfig.repositoryUrl&&siteConfig.license){assert.match(home,/Explore the code and build with the community/);assert.ok(source.includes('href="'+siteConfig.repositoryUrl+'"'));assert.ok(source.includes(siteConfig.license));assert.doesNotMatch(source,/Public source at launch/i);}
 else{assert.match(home,/Public source at launch/);assert.doesNotMatch(home,/href="[^"]*(github|gitlab)\.com/);assert.match(source,/Public source at launch/i);}
 assert.doesNotMatch(home,/Are my messages end-to-end encrypted|How do I control who can reach me/);assert.match(renderPage('privacy'),/End-to-end message encryption is not currently provided/);
 assert.match(renderPage('bugs'),/\/app\?settings=bugs&amp;category=security|\/app\?settings=bugs&category=security/);assert.match(renderPage('developers'),/Bot API v1/);if(siteConfig.desktopDownloads?.windows)assert.match(renderPage('download'),/Download for Windows/i);
});
test('mail callbacks, app entry and legacy developer links stay in the app',()=>{
 for(const pathname of ['/app','/app/','/app.html','/login','/signup','/settings','/?code=oauth-code','/?type=recovery&token_hash=test','/?error=cancelled','/?developer=1','/?settings=bugs'])assert.equal(appLocation(new URL('https://onyxchat.site'+pathname)),true,pathname);
 for(const pathname of ['/','/developers','/bugs/','/open-source','/?utm_source=test'])assert.equal(appLocation(new URL('https://onyxchat.site'+pathname)),false,pathname);
});
test('root bridge preserves successful and failed auth fragments without hijacking page anchors',()=>{
 const script=renderPage('home').match(/<script>([\s\S]*?)<\/script>/)![1];
 for(const hash of['#activity_pair=ABC-DEF','#connection=steam&state=test','#access_token=synthetic&type=recovery','#error=access_denied&error_description=expired','#error_code=otp_expired','#token_hash=synthetic&type=signup']){let target='';runInNewContext(script,{location:{hash,search:'?from=test',replace:(value:string)=>target=value}});assert.equal(target,'/app?from=test'+hash);}
 for(const hash of['#features','#customize','#faq','']){let called=false;runInNewContext(script,{location:{hash,search:'',replace:()=>called=true}});assert.equal(called,false);}
});
test('production handler separates public HTML, app auth routes and invitation metadata',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'onyx-website-'));assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(dir).startsWith('onyx-website-'));
 try{await writeFile(path.join(dir,'index.html'),renderPage('home'));await writeFile(path.join(dir,'app.html'),'<html><head><title>APP</title></head><body>CHAT ENTRY</body></html>');for(const page of pageNames.filter(p=>p!=='home')){await mkdir(path.join(dir,page));await writeFile(path.join(dir,page,'index.html'),renderPage(page));}
  let calls=0;const handler=await createHandler({directory:dir,config:{url:'https://your-project.supabase.co',key:'sb_publishable_synthetic'},fetcher:async()=>{calls++;return{ok:true,json:async()=>({name:'Public invite',members:4})};}});
  const run=async(url:string,method='GET')=>{let status=200,body;const headers={};const res={setHeader:(k,v)=>headers[k]=v,writeHead:(s,h)=>{status=s;Object.assign(headers,h);return res;},end:value=>body=value};await handler({url,method},res);return{status,body:String(body??''),headers};};
  assert.match((await run('/')).body,/Your people/);for(const page of pageNames.filter(p=>p!=='home'))for(const slash of['','/']){const r=await run('/'+page+slash);assert.equal(r.status,200);assert.equal(r.body,renderPage(page));}
  for(const route of['/app','/app/','/login','/signup','/?developer=1','/?code=pkce','/?type=recovery'])assert.match((await run(route)).body,/CHAT ENTRY/);assert.equal(calls,0);
  assert.equal((await run('/realcode')).headers.Location,'/invite/realcode');const invite=await run('/invite/realcode');assert.match(invite.body,/Public invite/);assert.match(invite.body,/CHAT ENTRY/);assert.doesNotMatch(invite.body,/Your people/);assert.equal(calls,1);assert.equal((await run('/developers/','HEAD')).body,'');
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('website build and public source files carry no credentials or remote analytics',async()=>{
 const js=await readFile('public/website/site.js','utf8'),notice='https://your-project.supabase.co/functions/v1/commerce-notice';
 assert.doesNotMatch(js.replaceAll(notice,''),/supabase|gtag\(|localStorage|sessionStorage|document\.cookie|access_token/);
 assert.deepEqual([...js.matchAll(/fetch\(\s*([^,\n)]+)/g)].map(m=>m[1]),['catalogueUrl',"'"+notice+"'"]);
 assert.match(js,/credentials:'omit'/);assert.match(js,/const catalogueUrl='\/website\/v13\/catalog\.[a-f0-9]{16}\.json'/);assert.ok(Buffer.byteLength(js)<16_000);
 const robots=await readFile('public/robots.txt','utf8');assert.match(robots,/Sitemap: https:\/\/onyxchat.site\/sitemap.xml/);
});

test('static-host bridge preserves auth payloads and invitations without redirecting public pages',()=>{
 const script=browserBridge();for(const[pathname,search,hash,expected]of[
  ['/','?code=a%2Bb&from=test','','/app?code=a%2Bb&from=test'],
  ['/','?developer=1','','/app?developer=1'],
  ['/invite/examplecode','?from=web','#hello','/app?from=web&invite=examplecode#hello'],
  ['/examplecode','','','/app?invite=examplecode'],
  ['/i/examplecode','?invite=chosen','','/app?invite=chosen'],
  ['/','?utm_source=test','#features',''],['/developers/','','#start',''],['/download/','','','']
 ]){let actual='';runInNewContext(script,{location:{pathname,search,hash,replace:(value:string)=>actual=value}});assert.equal(actual,expected);}
});

test('static app entry directories contain the same built application rather than the marketing page',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'onyx-static-entries-'));assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(directory).startsWith('onyx-static-entries-'));
 try{const app='<html><head><meta name="robots" content="noindex"><script src="/assets/app-example.js"></script></head></html>';await writeFile(path.join(directory,'app.html'),app);await writeFile(path.join(directory,'index.html'),'Public website');await writeStaticAppEntries(directory);for(const route of staticAppEntries)assert.equal(await readFile(path.join(directory,route,'index.html'),'utf8'),app);assert.equal(await readFile(path.join(directory,'index.html'),'utf8'),'Public website');}
 finally{await rm(directory,{recursive:true,force:true});}
});
