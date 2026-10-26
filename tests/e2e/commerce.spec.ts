import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const catalog=JSON.parse(readFileSync('src/config/commerce.json','utf8'));
test.beforeEach(async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.route('https://**',route=>route.fulfill({status:204}));
 await page.route('**/rest/v1/**',route=>route.fulfill({json:[]}));
 await page.route('**/functions/v1/billing',route=>route.fulfill({json:route.request().method()==='GET'?{...catalog,ready:false,mode:'unavailable',topAvailable:null}:{legacy:false,listed:true,subscription:null,promotions:[]}}));
});
test('promotion owner preview, honest unavailable checkout and responsive layout',async({page},info)=>{
 await page.goto('/app?ui-e2e');
 await page.evaluate(async()=>{const {useStore}=await import('/src/store/store.ts');const s=useStore.getState();useStore.setState({servers:{...s.servers,s_onyx:{...s.servers.s_onyx,members:{}}}});s.goHome('discover');});
 await expect(page.locator('.promote-owner-card')).toBeVisible();
 await page.locator('.promote-owner-card').getByRole('button',{name:'Promote server',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Above the community list'})).toBeVisible();
 await expect(page.getByText('Available after Stripe setup',{exact:true})).toBeVisible();
 await expect(page.locator('.promotion-settings .btn')).toHaveCount(4);for(const button of await page.locator('.promotion-settings .btn').all())await expect(button).toBeDisabled();await expect(page.locator('.promotion-server-preview')).toContainText('0 members');
 await expect(page.locator('.promotion-top-offer')).toContainText('14 days');await expect(page.locator('.promotion-top-price')).toContainText('12.99');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await expect(page.locator('.settings')).toHaveCSS('opacity','1');
 await page.screenshot({path:`test-results/promotion-${info.project.name}.png`,fullPage:true});
});
test('Plus checkout shows monthly consent, keeps wall opt-in off and sends only product identity',async({page},info)=>{
 let purchase:any;await page.route('**/functions/v1/billing',route=>{
  const body=route.request().method()==='GET'?null:route.request().postDataJSON();
  if(body?.action==='checkout'){purchase=body;return route.fulfill({json:{url:'https://checkout.stripe.com/c/pay/local-fixture',mode:'test'}});}
  return route.fulfill({json:body?{legacy:false,listed:true,subscription:null,promotions:[]}:{...catalog,ready:true,mode:'test',topAvailable:4}});
 });
 await page.route('https://checkout.stripe.com/**',route=>route.fulfill({contentType:'text/html',body:'<title>Synthetic Stripe destination</title>'}));
 await page.goto('/app?ui-e2e');await page.evaluate(async()=>{const {useStore}=await import('/src/store/store.ts');const s=useStore.getState();useStore.setState({users:{...s.users,[s.meId]:{...s.users[s.meId],plusSince:undefined}}});s.goHome('plus');});
 await page.getByRole('button',{name:'Get ONYX Plus',exact:true}).click();const dialog=page.getByRole('dialog');
 await expect(dialog).toContainText('Monthly subscription');await expect(dialog).toContainText('/ month');
 await expect(dialog.getByRole('checkbox')).not.toBeChecked();
 await page.screenshot({path:`test-results/plus-${info.project.name}.png`});
 await dialog.getByRole('button',{name:'Continue to Stripe'}).click();
 await expect.poll(()=>purchase).toEqual({action:'checkout',sku:'plus',showSupporter:false});
 await expect(page).toHaveTitle('Synthetic Stripe destination');
});
test('desktop SPA back and forward follow real views and clear the forward branch',async({page})=>{
 await page.addInitScript(()=>{const w=window as any;w.chrome??={};const events=new EventTarget();w.__chromeMessages=[];w.chrome.webview={postMessage:(m:any)=>w.__chromeMessages.push(m),addEventListener:(...args:any[])=>events.addEventListener(...args as [string,EventListener]),removeEventListener:(...args:any[])=>events.removeEventListener(...args as [string,EventListener])};w.__nativeNavigate=(direction:string)=>events.dispatchEvent(new MessageEvent('message',{data:{type:'onyx:navigate',direction}}));});
 await page.goto('/app?ui-e2e');
 await expect.poll(()=>page.evaluate(()=>(window as any).__chromeMessages.length)).toBeGreaterThan(0);
 await page.evaluate(async()=>{const {useStore}=await import('/src/store/store.ts');useStore.getState().goHome('friends');});
 await expect.poll(()=>page.evaluate(()=>(window as any).__chromeMessages.at(-1)?.title)).toBe('Friends');
 await page.evaluate(async()=>{const {useStore}=await import('/src/store/store.ts');useStore.getState().goHome('discover');});
 await expect.poll(()=>page.evaluate(()=>(window as any).__chromeMessages.at(-1)?.canBack)).toBe(true);
 await page.evaluate(()=>(window as any).__nativeNavigate('back'));await expect(page.getByRole('heading',{name:'Friends',exact:true})).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>(window as any).__chromeMessages.at(-1)?.canForward)).toBe(true);
 await page.evaluate(()=>(window as any).__nativeNavigate('forward'));await expect(page.getByRole('heading',{name:'Find your community'})).toBeVisible();
 await page.evaluate(()=>(window as any).__nativeNavigate('back'));await page.evaluate(async()=>{const {useStore}=await import('/src/store/store.ts');useStore.getState().goHome('plus');});
 await expect.poll(()=>page.evaluate(()=>(window as any).__chromeMessages.at(-1)?.canForward)).toBe(false);
});
test('channel grip pointer drag moves across categories without opening the channel',async({page},info)=>{
 await page.route('**/rest/v1/rpc/reorder_server_channel',route=>route.fulfill({json:null}));
 await page.goto('/app?ui-e2e&nav=1');
 const ids=await page.evaluate(async()=>{const {useStore}=await import('/src/store/store.ts');const s=useStore.getState(),server=s.servers.s_onyx;const channels=Object.values(s.channels).filter((c:any)=>c.serverId===server.id&&c.type==='text');s.selectServer(server.id);return {first:channels[0].id,category:server.categories.at(-1)!.id};});
 const handle=page.locator(`[data-reorder-channel="${ids.first}"] .channel-drag-handle`),target=page.locator(`[data-reorder-category="${ids.category}"]`);
 await expect(handle).toBeVisible();await target.scrollIntoViewIfNeeded();await handle.scrollIntoViewIfNeeded();
 const from=(await handle.boundingBox())!,to=(await target.boundingBox())!;
 const type=info.project.name.startsWith('mobile')?'touch':'mouse';
 // Real pointer capture handlers are shared by touch/stylus/mouse; synthetic touch
 // dispatch here tests their path without pretending to be a physical iPhone.
 if(type==='touch'){
  await page.evaluate(()=>{HTMLElement.prototype.setPointerCapture=()=>{};});
  await handle.dispatchEvent('pointerdown',{pointerId:8,pointerType:'touch',button:0,clientX:from.x+5,clientY:from.y+5});
  await handle.dispatchEvent('pointermove',{pointerId:8,pointerType:'touch',button:0,clientX:to.x+30,clientY:to.y+10});
  await page.waitForTimeout(80);await handle.dispatchEvent('pointerup',{pointerId:8,pointerType:'touch',button:0,clientX:to.x+30,clientY:to.y+10});
 }else{await page.mouse.move(from.x+5,from.y+5);await page.mouse.down();await page.mouse.move(to.x+30,to.y+10,{steps:8});await page.waitForTimeout(80);await page.mouse.up();}
 await expect.poll(()=>page.evaluate(async id=>{const {useStore}=await import('/src/store/store.ts');return useStore.getState().channels[id].categoryId;},ids.first)).toBe(ids.category);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});
