import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,mkdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHandler,inviteMetadata,invitationCode} from '../server-handler.js';
import {createServer} from 'node:http';

const html='<html><head><title>ONYX</title><meta name="description" content="Chat"></head><body>APP</body></html>';
const project='https://your-project.supabase.co';
test('crawler metadata escapes user content and rejects external image URLs',()=>{
  const result=inviteMetadata(html,{name:'"><script>bad</script>',description:'" onload="bad',members:3,icon:'https://tracker.invalid/img'},'abc',project);
  assert.ok(!result.includes('<script>'));assert.ok(result.includes('&lt;script&gt;'));
  assert.ok(!result.includes('tracker.invalid'));assert.ok(result.includes('https://onyxchat.site/invite/abc'));
  assert.equal(invitationCode(new URL('https://onyxchat.site/developers')),null);
  assert.equal(invitationCode(new URL('https://onyxchat.site/abc')),'abc');
});
test('Windows download delivers the original binary with HEAD support and survives a cancelled transfer',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'onyx-download-'));
 if(!path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(dir).startsWith('onyx-download-'))throw Error('unsafe fixture directory');
 let server;
 try{
  await writeFile(path.join(dir,'index.html'),html);await mkdir(path.join(dir,'downloads'));const binary=Buffer.alloc(1024*1024,73);binary.write('PK');await writeFile(path.join(dir,'downloads','ONYX-Activity-Windows.zip'),binary);
  server=createServer(await createHandler({directory:dir,config:{url:project,key:'sb_publishable_synthetic'}}));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port,url=base+'/downloads/ONYX-Activity-Windows.zip';
  const head=await fetch(url,{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),String(binary.length));assert.equal((await head.arrayBuffer()).byteLength,0);
  const full=await fetch(url);assert.equal(full.headers.get('content-type'),'application/zip');assert.match(full.headers.get('content-disposition'),/attachment/);assert.deepEqual(Buffer.from(await full.arrayBuffer()),binary);
  const aborted=await fetch(url);await aborted.body.cancel();assert.equal((await fetch(base+'/_onyx/health')).status,200);
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
});
test('server returns real invite metadata, handles upstream failures and serves no environment files',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'onyx-invites-'));
  try{
    await writeFile(path.join(dir,'index.html'),html);await mkdir(path.join(dir,'assets'));
    await writeFile(path.join(dir,'assets','app.js'),'console.log("app")');
    let calls=0,fail=false;
    const handler=await createHandler({directory:dir,config:{url:project,key:'sb_publishable_synthetic'},fetcher:async(url,opts)=>{
      calls++;assert.equal(url,project+'/rest/v1/rpc/invite_preview');
      if(fail)throw new Error('offline');
      return {ok:true,json:async()=>JSON.parse(opts.body).p_code==='expired'?null:{name:'Test server',description:'Real invitation',members:7}};
    }});
    const run=async(url,method='GET')=>{
      let status=200,body;const headers={};
      const res={setHeader:(k,v)=>headers[k]=v,writeHead:(s,h)=>{status=s;Object.assign(headers,h);return res;},end:value=>body=value};
      await handler({url,method},res);return {status,body,headers};
    };
    const health=await run('/_onyx/health');assert.equal(health.status,200);assert.deepEqual(JSON.parse(health.body),{service:'onyx',status:'ok'});assert.equal(calls,0);
    for(const source of ['/abc','/i/abc','/invite/ABC','/?invite=abc']){const redirect=await run(source);assert.equal(redirect.status,302);assert.equal(redirect.headers.Location,'/invite/abc');assert.equal(calls,0);}
    assert.equal((await run('/abc?code=auth-code')).headers.Location,'/invite/abc?code=auth-code');
    const invite=await run('/invite/abc');assert.equal(invite.status,200);assert.ok(invite.body.includes('Test server · ONYX'));assert.ok(invite.body.includes('7 members'));
    await run('/invite/abc');assert.equal(calls,1);
    assert.equal((await run('/invite/expired')).status,404);
    fail=true;assert.equal((await run('/invite/outage')).body,html);
    assert.equal((await run('/.env.production')).body,html);
    assert.equal((await run('/%2e%2e%2fpackage.json')).body.toString(),html);
    assert.equal((await run('/invite/abc','HEAD')).body,undefined);
    assert.equal((await run('/','POST')).status,405);
    const asset=await run('/assets/app.js');assert.equal(asset.body.toString(),'console.log("app")');assert.match(asset.headers['Cache-Control'],/immutable/);
    assert.equal((await run('/%E0%A4%A')).status,400);
  }finally{await rm(dir,{recursive:true,force:true});}
});
