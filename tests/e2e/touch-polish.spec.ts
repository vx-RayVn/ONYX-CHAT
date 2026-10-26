import {test,expect,type Page} from '@playwright/test';
import {pngPixels} from './pngPixels';

test.beforeEach(async({page})=>{
 await page.route('https://**',route=>route.fulfill({status:204}));
 await page.route('**/rest/v1/**',route=>route.fulfill({json:[]}));
 await page.route('**/functions/v1/**',route=>route.fulfill({status:401,json:{error:'local_touch_fixture'}}));
});
async function touch(page:Page,selector:string,type:string,points:{x:number;y:number}[]){
 return page.locator(selector).evaluate((el,{type,points})=>{
  const event=new Event(type,{bubbles:true,cancelable:true});
  Object.defineProperty(event,'touches',{value:points.map((p,i)=>({identifier:i,clientX:p.x,clientY:p.y,target:el}))});
  const allowed=el.dispatchEvent(event);return allowed;
 },{type,points});
}
async function frame(page:Page){await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));}
async function keyboardClosed(page:Page){
 // Fine-pointer desktop fixtures autofocus the editor. A pane swipe is only
 // eligible with no active text editor, just like the real touch interaction.
 await frame(page);await page.evaluate(()=>{if(document.activeElement instanceof HTMLElement&&document.activeElement.matches('input,textarea,[contenteditable="true"]'))document.activeElement.blur();});await frame(page);
}
async function swipe(page:Page,selector:string,from:number,to:number,y=240){
 await keyboardClosed(page);
 await touch(page,selector,'touchstart',[{x:from,y}]);
 await touch(page,selector,'touchmove',[{x:to,y}]);await frame(page);
 await touch(page,selector,'touchend',[]);
}
async function keyboardFixture(page:Page){
 await page.addInitScript(()=>{
  const viewport=new EventTarget();Object.assign(viewport,{height:844,offsetTop:0,scale:1});Object.defineProperty(window,'visualViewport',{value:viewport});
  (window as any).touchViewport18=(height:number,offsetTop:number,scale=1)=>{Object.assign(viewport,{height,offsetTop,scale});viewport.dispatchEvent(new Event('resize'));};
 });
}

test('white transparent loading logo fits phones, tablets and desktop and respects reduced motion',async({page},info)=>{
 for(const width of [320,390,834,1440]){
  await page.setViewportSize({width,height:844});await page.goto('/app?ui-e2e&loading');
  const screen=page.locator('.app-loading'),logo=screen.locator('img');await expect(screen).toHaveAttribute('aria-busy','true');await expect(logo).toHaveAttribute('src',/onyx-mark-256\.webp$/);
  await expect.poll(()=>logo.evaluate(el=>(el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const b=(await logo.boundingBox())!;expect(b.x).toBeGreaterThan(0);expect(b.x+b.width).toBeLessThan(width);expect(await page.locator('.auth-card')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(width===390||width===1440)await page.screenshot({path:`test-results/touch18-loading-${info.project.name}-${width}.png`});
 }
 await page.emulateMedia({reducedMotion:'reduce'});await expect.poll(()=>page.locator('.app-loading-emblem').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
 await expect.poll(()=>page.locator('.app-loading-track>span').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
});

test('friends filters have space above the divider and Add friend stays reachable on small phones',async({page},info)=>{
 for(const width of [320,390,834]){
  await page.setViewportSize({width,height:844});await page.goto('/app?ui-e2e&page=friends&empty-friends');
  const header=page.locator('.friends-view .view-header'),tab=header.getByRole('button',{name:'Online',exact:true});await expect(tab).toBeVisible();
  const h=(await header.boundingBox())!,b=(await tab.boundingBox())!;expect(h.y+h.height-b.y-b.height).toBeGreaterThanOrEqual(10);
  const add=header.getByRole('button',{name:'Add friend',exact:true}),a=(await add.boundingBox())!;expect(a.width).toBeGreaterThanOrEqual(44);expect(a.x+a.width).toBeLessThanOrEqual(width);
  await add.click();await expect(page.getByRole('heading',{name:'Add friend',exact:true})).toBeVisible();
  expect(await page.locator('.main').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 }
 await page.screenshot({path:`test-results/touch18-friends-${info.project.name}.png`});
});

test('touch drag reveals the server list and returns to the selected chat without losing the draft',async({page},info)=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/app?ui-e2e');
 await page.locator('.composer-input').fill('Keep this draft');await page.locator('.composer-input').blur();
 await touch(page,'.main','touchstart',[{x:100,y:240}]);await touch(page,'.main','touchmove',[{x:240,y:242}]);await frame(page);
 await expect(page.locator('.app')).toHaveAttribute('data-panning','true');const mid=(await page.locator('.main').boundingBox())!;expect(mid.x).toBeGreaterThan(100);expect(mid.x).toBeLessThan(390);
 await touch(page,'.main','touchend',[]);await expect(page.locator('.app')).toHaveClass(/mobile-nav/);await expect(page.locator('.rail')).toBeVisible();
 await swipe(page,'.sidebar',280,100);await expect(page.locator('.app')).toHaveClass(/mobile-main/);await expect(page.locator('.view-header h1')).toHaveText('Bob');await expect(page.locator('.composer-input')).toHaveValue('Keep this draft');
 await expect(page.locator('.rail-pane')).toHaveAttribute('inert','');
 await expect.poll(async()=>(await page.locator('.main').boundingBox())!.x).toBe(0);
 await page.screenshot({path:`test-results/touch18-chat-${info.project.name}.png`});
});

test('vertical scrolling, text fields, edge gestures, horizontal filter scrolling and multitouch do not navigate',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/app?ui-e2e');
 await page.locator('.composer-input').focus();await touch(page,'.main','touchstart',[{x:110,y:210}]);await touch(page,'.main','touchmove',[{x:290,y:210}]);await touch(page,'.main','touchend',[]);await expect(page.locator('.app')).toHaveClass(/mobile-main/);await keyboardClosed(page);
 await touch(page,'.main','touchstart',[{x:110,y:210}]);await touch(page,'.main','touchmove',[{x:120,y:390}]);await touch(page,'.main','touchend',[]);await expect(page.locator('.app')).toHaveClass(/mobile-main/);
 await swipe(page,'.main',8,220);await expect(page.locator('.app')).toHaveClass(/mobile-main/);
 await swipe(page,'.composer-input',100,280);await expect(page.locator('.app')).toHaveClass(/mobile-main/);
 await touch(page,'.main','touchstart',[{x:110,y:210}]);await touch(page,'.main','touchmove',[{x:230,y:210},{x:280,y:240}]);await touch(page,'.main','touchend',[]);await expect(page.locator('.app')).toHaveClass(/mobile-main/);
 await page.goto('/app?ui-e2e&page=friends');await swipe(page,'.tabs',80,280);await expect(page.locator('.app')).toHaveClass(/mobile-main/);
});

test('server navigation swipes back to the channel already selected',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/app?ui-e2e&nav');await page.locator('.rail-btn-icon').first().click();await page.locator('.channel').filter({hasText:'general'}).first().click();
 await expect(page.locator('.view-header h1')).toHaveText('general');await swipe(page,'.main',100,290);await expect(page.locator('.app')).toHaveClass(/mobile-nav/);await swipe(page,'.sidebar',280,100);await expect(page.locator('.app')).toHaveClass(/mobile-main/);await expect(page.locator('.view-header h1')).toHaveText('general');
});

test('native Chromium touch input drags both panes without activating a row',async({page,browserName})=>{
 test.skip(browserName!=='chromium','Native touch injection is a Chromium protocol check; other engines exercise TouchEvents above.');
 await page.setViewportSize({width:390,height:844});await page.goto('/app?ui-e2e');
 const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true});
 await keyboardClosed(page);
 const drag=async(from:number,to:number)=>{
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:from,y:240}]});
  for(let i=1;i<=8;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from+(to-from)*i/8,y:240}]});await frame(page);}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 };
 await drag(100,290);await expect(page.locator('.app')).toHaveClass(/mobile-nav/);await expect.poll(async()=>(await page.locator('.sidebar').boundingBox())!.x).toBeGreaterThanOrEqual(0);await drag(280,100);await expect(page.locator('.app')).toHaveClass(/mobile-main/);await expect(page.locator('.view-header h1')).toHaveText('Bob');await cdp.detach();
});

test('cancelled and short drags settle back into the original pane',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/app?ui-e2e');
 await keyboardClosed(page);
 await touch(page,'.main','touchstart',[{x:110,y:210}]);await touch(page,'.main','touchmove',[{x:245,y:210}]);await touch(page,'.main','touchcancel',[]);await expect(page.locator('.app')).toHaveClass(/mobile-main/);await expect(page.locator('.app')).not.toHaveAttribute('data-panning');
 await swipe(page,'.main',110,132);await expect(page.locator('.app')).toHaveClass(/mobile-main/);
 await expect.poll(async()=>(await page.locator('.main').boundingBox())!.x).toBe(0);
});

test('a reverse swipe picks up an unfinished animation without jumping to its end',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/app?ui-e2e');await keyboardClosed(page);
 await page.addStyleTag({content:'.app.is-mobile .main,.app.is-mobile .channel-pane,.app.is-mobile .rail-pane{transition-duration:1200ms,0ms!important}'});
 await swipe(page,'.main',100,290);await expect(page.locator('.app')).toHaveClass(/mobile-nav/);await frame(page);
 const before=await page.locator('.main').evaluate(el=>el.getBoundingClientRect().x);expect(before).toBeLessThan(300);
 await touch(page,'.sidebar','touchstart',[{x:280,y:240}]);await touch(page,'.sidebar','touchmove',[{x:245,y:240}]);await frame(page);
 const after=await page.locator('.main').evaluate(el=>el.getBoundingClientRect().x);expect(after).toBeLessThan(before+55);
 await touch(page,'.sidebar','touchcancel',[]);await expect(page.locator('.app')).toHaveClass(/mobile-nav/);
});

test('iPad-sized touch navigation and right-to-left gestures follow their reading direction',async({page})=>{
 await page.setViewportSize({width:834,height:1112});await page.goto('/app?ui-e2e');
 // Desktop projects have a fine pointer; a 600px view exercises the same panes.
 if(!await page.locator('.app').evaluate(el=>el.classList.contains('is-mobile')))await page.setViewportSize({width:600,height:900});
 const width=page.viewportSize()!.width;await swipe(page,'.main',100,width-100);await expect(page.locator('.app')).toHaveClass(/mobile-nav/);await swipe(page,'.sidebar',width-100,100);await expect(page.locator('.app')).toHaveClass(/mobile-main/);
 await page.setViewportSize({width:390,height:844});await page.goto('/app?ui-e2e&lang=ar');await expect(page.locator('html')).toHaveAttribute('dir','rtl');
 await swipe(page,'.main',290,100);await expect(page.locator('.app')).toHaveClass(/mobile-nav/);await swipe(page,'.sidebar',110,290);await expect(page.locator('.app')).toHaveClass(/mobile-main/);
});

test('closing the keyboard releases stale Safari geometry even if the viewport keeps its old offset',async({page})=>{
 await page.setViewportSize({width:390,height:844});await keyboardFixture(page);await page.goto('/app?ui-e2e');await page.locator('.composer-input').focus();
 await page.evaluate(()=>(window as any).touchViewport18(390,72));await expect(page.locator('html')).toHaveAttribute('data-keyboard','open');
 await expect.poll(async()=>{const b=(await page.locator('.composer-wrap').boundingBox())!;return b.y+b.height;}).toBeLessThanOrEqual(462);
 await page.evaluate(()=>(window as any).touchViewport18(844,72));await expect(page.locator('html')).toHaveAttribute('data-keyboard','closed');
 await expect.poll(()=>page.locator('html').evaluate(el=>(el as HTMLElement).style.getPropertyValue('--touch-top'))).toBe('');
 await expect.poll(async()=>(await page.locator('.app').boundingBox())!.height).toBe(844);
 await page.evaluate(()=>(window as any).touchViewport18(390,72));await expect(page.locator('html')).toHaveAttribute('data-keyboard','open');
 await page.locator('.composer-input').blur();await expect(page.locator('html')).toHaveAttribute('data-keyboard','closed');await expect.poll(async()=>(await page.locator('.app').boundingBox())!.height).toBe(844);
 await page.locator('.composer-input').focus();await page.evaluate(()=>{Object.defineProperty(window,'innerHeight',{configurable:true,get:()=>390});(window as any).touchViewport18(390,72);});await expect(page.locator('html')).toHaveAttribute('data-keyboard','open');
 await page.evaluate(()=>(window as any).touchViewport18(844,72));await expect(page.locator('html')).toHaveAttribute('data-keyboard','closed');await expect.poll(async()=>(await page.locator('.app').boundingBox())!.height).toBe(844);
});

test('keyboard resize coalesces within a frame and pinch zoom remains browser-controlled',async({page})=>{
 await page.setViewportSize({width:390,height:844});await keyboardFixture(page);await page.goto('/app?ui-e2e');await page.locator('.composer-input').focus();
 await page.evaluate(()=>{for(const h of [700,610,490,390])(window as any).touchViewport18(h,12);});await expect(page.locator('html')).toHaveAttribute('data-keyboard','open');
 await expect.poll(()=>page.locator('html').evaluate(el=>(el as HTMLElement).style.getPropertyValue('--touch-height'))).toBe('390px');
 await page.evaluate(()=>(window as any).touchViewport18(195,80,2));await frame(page);expect(await page.locator('html').evaluate(el=>(el as HTMLElement).style.getPropertyValue('--touch-height'))).toBe('390px');
 expect(await page.locator('.composer-input').evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
});

test('late Safari viewport restoration fills the chat even without a second event or blur',async({page},info)=>{
 await page.setViewportSize({width:390,height:844});await keyboardFixture(page);await page.goto('/app?ui-e2e');await page.locator('.composer-input').focus();
 for(const event of ['resize','pageshow']){
  await page.evaluate(()=>(window as any).touchViewport18(390,72));await expect(page.locator('html')).toHaveAttribute('data-keyboard','open');
  await page.evaluate(event=>{const viewport=window.visualViewport!;if(event==='resize')viewport.dispatchEvent(new Event('resize'));else window.dispatchEvent(new Event('pageshow'));setTimeout(()=>Object.assign(viewport,{height:844,offsetTop:72}),300);},event);
  await expect(page.locator('html')).toHaveAttribute('data-keyboard','closed');await expect(page.locator('.composer-input')).toBeFocused();
  await expect.poll(async()=>(await page.locator('.app').boundingBox())!.height).toBe(844);
  await expect.poll(()=>page.locator('html').evaluate(el=>(el as HTMLElement).style.getPropertyValue('--touch-height'))).toBe('');
  const app=(await page.locator('.app').boundingBox())!,composer=(await page.locator('.composer-wrap').boundingBox())!;expect(app.y+app.height-composer.y-composer.height).toBeLessThan(18);
 }
 await page.screenshot({path:`test-results/app22-keyboard-restored-${info.project.name}.png`});
});

test('keyboard dismissal clears document pan while the editor stays focused',async({page})=>{
 await page.setViewportSize({width:390,height:844});await keyboardFixture(page);await page.goto('/app?ui-e2e');await page.locator('.composer-input').focus();await page.evaluate(()=>(window as any).touchViewport18(390,72));await expect(page.locator('html')).toHaveAttribute('data-keyboard','open');
 await page.evaluate(()=>{let y=72;Object.defineProperty(window,'scrollY',{configurable:true,get:()=>y});window.scrollTo=(()=>{y=0;}) as any;(window as any).touchViewport18(844,72);});
 await expect(page.locator('html')).toHaveAttribute('data-keyboard','closed');await expect(page.locator('.composer-input')).toBeFocused();await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(0);
});

test('keyboard restoration follows late geometry on the next frame, without a timer-sized gap',async({page})=>{
 await page.setViewportSize({width:390,height:844});await keyboardFixture(page);await page.clock.install();await page.goto('/app?ui-e2e');await page.locator('.composer-input').focus();await frame(page);
 await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));
 await page.evaluate(()=>(window as any).touchViewport18(390,72));await page.clock.runFor(32);await expect(page.locator('html')).toHaveAttribute('data-keyboard','open');
 // The event arrives first, the geometry later, with focus retained. Advance
 // past the old 80ms poll; the next old poll would not run until 240ms.
 await page.evaluate(()=>visualViewport!.dispatchEvent(new Event('resize')));await page.clock.runFor(160);
 await page.evaluate(()=>Object.assign(visualViewport!,{height:844,offsetTop:72}));await page.clock.runFor(32);
 expect(await page.locator('html').getAttribute('data-keyboard')).toBe('closed');
 expect((await page.locator('.app').boundingBox())!.height).toBe(844);await expect(page.locator('.composer-input')).toBeFocused();
});

test('blur releases keyboard sizing synchronously and an open keyboard never expires on a timer',async({page})=>{
 await page.setViewportSize({width:390,height:844});await keyboardFixture(page);await page.clock.install();await page.goto('/app?ui-e2e');await page.locator('.composer-input').focus();await frame(page);
 await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));
 await page.evaluate(()=>{
  (window as any).touchViewport18(390,72);
  let reads=0;Object.defineProperty(visualViewport!,'height',{configurable:true,get:()=>{reads++;return 390;}});
  (window as any).touchViewportReads23=()=>reads;
 });await page.clock.runFor(1600);
 expect(await page.locator('html').getAttribute('data-keyboard')).toBe('open');expect((await page.locator('.app').boundingBox())!.height).toBe(390);
 const reads=await page.evaluate(()=>(window as any).touchViewportReads23());expect(reads).toBeGreaterThan(10);await page.clock.runFor(1000);
 expect(await page.evaluate(()=>(window as any).touchViewportReads23())).toBe(reads);
 const switched=await page.evaluate(()=>{const input=document.createElement('input');document.body.append(input);input.focus({preventScroll:true});return {state:document.documentElement.dataset.keyboard,height:document.documentElement.style.getPropertyValue('--touch-height')};});
 expect(switched).toEqual({state:'open',height:'390px'});await page.clock.runFor(32);await page.locator('.composer-input').focus();await page.clock.runFor(32);
 const closed=await page.locator('.composer-input').evaluate(el=>{(el as HTMLElement).blur();return {state:document.documentElement.dataset.keyboard,height:document.documentElement.style.getPropertyValue('--touch-height'),top:document.documentElement.style.getPropertyValue('--touch-top')};});
 expect(closed).toEqual({state:'closed',height:'',top:''});
 await page.clock.runFor(32);expect((await page.locator('.app').boundingBox())!.height).toBe(844);
});

test('the top edge has one solid color across rail and content on every layout',async({page},info)=>{
 for(const width of [390,834,1440])for(const query of ['&nav','','&guest&nav']){
  await page.setViewportSize({width,height:844});await page.goto('/app?ui-e2e'+query);await keyboardClosed(page);
  await expect(page.locator('.app-body')).toBeVisible();await page.waitForTimeout(300);
  const body=(await page.locator('.app-body').boundingBox())!,ribbon=page.locator('.guest-ribbon'),guest=await ribbon.count();
  const y=Math.floor(body.y-(guest?1:0));const pixel=pngPixels(await page.screenshot({scale:'css'}));
  const colors=[4,Math.floor(width*.12),Math.floor(width*.25),Math.floor(width*.5),width-5].map(x=>pixel(x,y));expect(new Set(colors).size,`${width} ${query}: ${colors}`).toBe(1);expect(colors[0].endsWith(',255')).toBe(true);
  if(query==='&nav')expect(pixel(4,y+1)).not.toBe(colors[0]);
 }
 await page.setViewportSize({width:390,height:844});await page.goto('/app?ui-e2e&nav');await keyboardClosed(page);await page.screenshot({path:`test-results/app22-solid-edge-${info.project.name}.png`});
});

test('guests can browse the real shop offer while profile features still request registration',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/app?ui-e2e&guest&nav');
 await page.locator('.nav-list').getByRole('button',{name:'OnyxServices',exact:true}).click();await expect(page.locator('.shop-view')).toBeVisible();await expect(page.locator('.shop-view')).toContainText('10%');await expect(page.locator('.guest-upgrade')).toHaveCount(0);
 await page.locator('.view-header').getByRole('button',{name:'Back',exact:true}).click();await expect(page.locator('.nav-list').getByRole('button',{name:'ONYX Plus',exact:true})).toHaveCount(0);await page.locator('.nav-list').getByRole('button',{name:'Customize Free',exact:true}).click();await expect(page.locator('.guest-upgrade')).toBeVisible();
});
