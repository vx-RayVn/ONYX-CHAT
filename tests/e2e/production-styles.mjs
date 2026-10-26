import fs from 'node:fs/promises';
import {createServer} from 'node:http';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from '@playwright/test';
const dir=path.resolve(process.argv[2]??'dist');
const {createHandler}=await import(pathToFileURL(path.resolve('server-handler.js')));
const server=createServer(await createHandler({directory:dir,config:{url:'https://your-project.supabase.co',key:'sb_publishable_css_only_fixture'},fetcher:()=>{throw Error('Unexpected server backend request');}}));
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const html=await fs.readFile(path.join(dir,'app.html'),'utf8'),cssPath=html.match(/href="(\/assets\/[^"?#]+\.css)"/)[1],css=await fs.readFile(path.join(dir,cssPath.slice(1)));
const head=await fetch(base+cssPath,{method:'HEAD'});assert.equal(Number(head.headers.get('content-length')),css.length);
await fs.mkdir('test-results',{recursive:true});
const reports=[];
try{
 for(const [name,type] of [['chromium',chromium],['firefox',firefox],['webkit',webkit]]){
  const browser=await type.launch();
  try{
   for(const permanent of [false,true]){
    const page=await browser.newPage({viewport:{width:1366,height:850}});let requests=0,allowFull;const gate=new Promise(r=>allowFull=r);
    await page.route('**/*.supabase.co/**',r=>r.fulfill({status:401,json:{error:'synthetic_style_check'}}));
    await page.route('**/assets/*.css*',async route=>{
      requests++;
      if(requests===1||permanent)return route.fulfill({contentType:'text/css',body:css.subarray(0,218952)});
      await gate;return route.fulfill({contentType:'text/css',body:css});
    });
    await page.goto(base+'/login/',{waitUntil:'domcontentloaded'});
    await page.waitForTimeout(150);
    assert.equal(await page.locator('.auth-screen').count(),0,'No unstyled interactive login');
    assert.equal(await page.locator('#onyx-startup').isVisible(),true);
    if(!permanent){
      allowFull();await page.locator('.auth-card').waitFor();
      const metrics=await page.locator('.auth-card').evaluate(e=>({width:e.getBoundingClientRect().width,x:e.getBoundingClientRect().x,screen:getComputedStyle(document.querySelector('.auth-screen')).display}));
      assert.equal(metrics.screen,'flex');assert.ok(metrics.width<=460&&metrics.width>=400);assert.ok(metrics.x>400);assert.ok(requests>=2);
      const computed=await page.evaluate(()=>{const e=document.createElement('div');e.className='discover-hero';document.body.append(e);const result=getComputedStyle(e).display;e.remove();return result;});assert.equal(computed,'flex');
      await page.screenshot({path:`test-results/production-styles-${name}.png`});
    }else{
      await page.locator('#onyx-startup button').waitFor();assert.equal(await page.locator('.auth-screen').count(),0);assert.equal(requests,3);
    }
    reports.push({name,permanent,requests,passed:true});await page.close();
   }
  }finally{await browser.close();}
 }
 await fs.writeFile('test-results/production-styles-tests.json',JSON.stringify(reports,null,2));console.log(JSON.stringify({cases:reports.length,allPassed:true}));
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
