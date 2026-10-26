import{test,expect}from'@playwright/test';
test('public homepage stays lightweight and its profile preview and FAQ work',async({page})=>{
 const requests:string[]=[],errors:string[]=[];page.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await expect(page.getByRole('heading',{level:1})).toContainText('Your people.');
 await page.locator('#customize').scrollIntoViewIfNeeded();await expect(page.locator('.custom-options')).toHaveAttribute('data-ready','true');
 const select=page.locator('[data-custom-select]');
 const choose=async(label:string,id:string)=>{if(await select.isVisible())await select.selectOption(id);else await page.getByRole('button',{name:label,exact:true}).click();};
 await choose('Emerald Aurora','emerald-aurora');await expect(page.locator('.profile-host .banner-emerald-aurora')).toHaveCount(1);
 for(const [tab,label,id,selector,count]of[['Effects','Fireflies','fireflies','.fx-fireflies',6],['Frames','Icicles','winter-frame','.pframe',6],['Avatar','Golden Laurel','laurel','.avatar-deco',6],['Name','Velocity','velocity','.display-name',5]] as const){await page.getByRole('tab',{name:tab,exact:true}).click();await expect(select.locator('option')).toHaveCount(count);await choose(label,id);await expect(page.locator('.profile-host '+selector)).toHaveCount(1);}
 await page.getByRole('button',{name:'Reset profile',exact:true}).click();await expect(page.locator('.profile-host .fx-sakura-petals')).toHaveCount(1);await expect(page.locator('.profile-host .banner-scene')).toHaveCount(1);await expect(page.getByRole('button',{name:'Pause animation',exact:true})).toHaveCount(0);
 const question=page.locator('.faq-list details').first();await question.locator('summary').click();await expect(question.locator('p')).toBeVisible();await expect(question).toContainText('free');
 expect(requests.filter(url=>/supabase|\/src\/|\/assets\/.*\.js|livekit|krisp|google|analytics/.test(url))).toEqual([]);expect(errors).toEqual([]);
});
test('public pages fit phones, tablets and desktop and keep real navigation targets',async({page})=>{
 const widths=[320,360,768,834,1440];for(const width of widths){await page.setViewportSize({width,height:900});for(const route of['/','/developers/','/guidelines/','/bugs/','/safety/','/privacy/','/open-source/','/download/','/roadmap/']){const response=await page.goto(route);expect([200,304],route).toContain(response?.status());await expect(page.getByRole('heading',{level:1})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth),`${route} at ${width}`).toBeLessThanOrEqual(width+1);}}
 await page.goto('/');const targets=await page.locator('a[href]').evaluateAll(links=>links.map(a=>a.getAttribute('href')));expect(targets).toContain('/signup');expect(targets).toContain('/app');expect(targets).not.toContain('#');
});
test('mobile navigation is keyboard accessible and docs copy buttons work',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');const toggle=page.getByRole('button',{name:'Toggle navigation'});await toggle.click();await expect(toggle).toHaveAttribute('aria-expanded','true');await page.keyboard.press('Escape');await expect(toggle).toHaveAttribute('aria-expanded','false');await expect(toggle).toBeFocused();await toggle.click();await page.locator('.nav-links').getByRole('link',{name:'Developers',exact:true}).click();await expect(page).toHaveURL(/\/developers\//);
 await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{value:{writeText:async(text:string)=>{(window as any).__copied=text;}}});});const copy=page.locator('[data-copy]').first();await copy.click();await expect(copy).toContainText('Copied');expect(await page.evaluate(()=>(window as any).__copied)).toContain('node');
});
test('auth CTAs open the intended form while native and mail callbacks preserve their payload',async({page})=>{
 await page.route('**/auth/v1/**',r=>r.fulfill({status:401,json:{message:'local test only'}}));await page.route('**/rest/v1/**',r=>r.fulfill({json:[]}));await page.route('**/functions/v1/**',r=>r.fulfill({status:401,json:{error:'local_test'}}));
 for(const route of['/signup','/signup/']){await page.goto(route);await expect(page.getByRole('tab',{name:'Register',exact:true})).toHaveAttribute('aria-selected','true');await expect(page.getByRole('button',{name:'Create account',exact:true})).toBeVisible();}await page.goto('/login');await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();
 await page.goto('/#activity_pair=TEST-CODE');await expect(page).toHaveURL(/\/app#activity_pair=TEST-CODE/);await expect(page.locator('#root')).not.toBeEmpty();await page.goto('/#error_code=otp_expired&error_description=expired');await expect(page).toHaveURL(/\/app/);
});
test('public content stays readable without JavaScript and respects reduced motion',async({browser})=>{
 const context=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844},reducedMotion:'reduce'});const page=await context.newPage();await page.goto('/');await expect(page.getByRole('heading',{level:1})).toBeVisible();await expect(page.locator('.nav-links').getByRole('link',{name:'Developers',exact:true})).toBeVisible();const faq=page.locator('.faq-list details').first();await faq.locator('summary').click();await expect(faq.locator('p')).toBeVisible();await context.close();
});

test('the floating navigation follows scrolling and preview tabs support keyboard selection',async({page})=>{
 await page.setViewportSize({width:1280,height:900});await page.goto('/');const header=page.locator('.site-header');await page.locator('#customize').scrollIntoViewIfNeeded();await expect(header).toHaveClass(/is-scrolled/);const bounds=await header.boundingBox();expect(bounds?.y).toBeGreaterThanOrEqual(0);expect(bounds?.y).toBeLessThan(30);await page.getByRole('tab',{name:'Banners',exact:true}).focus();await page.keyboard.press('ArrowRight');await expect(page.getByRole('tab',{name:'Effects',exact:true})).toBeFocused();await expect(page.getByRole('tab',{name:'Effects',exact:true})).toHaveAttribute('aria-selected','true');await page.keyboard.press('End');await expect(page.getByRole('tab',{name:'Name',exact:true})).toBeFocused();
 await page.emulateMedia({reducedMotion:'reduce'});await expect(page.locator('.profile-host')).toHaveAttribute('data-offscreen','');expect(await page.locator('.profile-host .sname').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
});
test('download offers the Windows preview without unavailable platform cards',async({page})=>{
 for(const width of [320,390,834,1440]){
  await page.setViewportSize({width,height:900});await page.goto('/download/');
  const card=page.locator('.platform-card');await expect(card).toHaveCount(1);await expect(card.getByRole('heading',{name:'ONYX for Windows.',exact:true})).toBeVisible();
  await expect(card.getByRole('link',{name:'Download for Windows',exact:true})).toHaveAttribute('href','/downloads/ONYX-Desktop-Windows-0.1-Setup.exe');
  await expect(page.locator('main')).not.toContainText('macOS');await expect(page.locator('main')).not.toContainText('Linux');
  await expect(page.locator('main')).toContainText('unsigned preview');expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+1);
  if(width===390||width===1440)await page.screenshot({path:`test-results/windows-download-${width}.png`,fullPage:true});
 }
});
