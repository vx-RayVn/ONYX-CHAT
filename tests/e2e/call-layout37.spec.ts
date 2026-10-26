import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.route('https://**',route=>route.fulfill({status:204}));
  await page.route('**/rest/v1/**',route=>route.fulfill({json:[]}));
  await page.route('**/functions/v1/**',route=>route.fulfill({status:401,json:{error:'isolated_layout_fixture'}}));
});
test('App37 system and normal identities centre all marks with styled names and scale',async({page},info)=>{
  await page.goto('/app?ui-e2e&community');
  await page.evaluate(async()=>{
    const {useStore}=await import('/src/store/store.ts');const {useCommunity}=await import('/src/backend/community.ts');
    useStore.setState(s=>{s.users.alice.displayName='RAYVN';s.users.alice.nameStyle={font:'heavy',effect:'solid',colors:['#23cdbb'],italic:true,uppercase:true};s.users.alice.plusSince=Date.now()-1000;s.users.alice.plusUntil=Date.now()+600000;s.dmProfileOpen=false;
      s.messages['ui-dm']=['join','call','default'].map((type,index)=>({id:'alignment-'+index,channelId:'ui-dm',authorId:'alice',type:type as 'join'|'call'|'default',content:type==='call'?'3':type==='default'?'Aligned identity fixture':'',createdAt:Date.now()-120000+index*60000,reactions:[],attachments:[],embeds:[]}));
    });useCommunity.setState(s=>({selected:{...s.selected,alice:'s_onyx'}}));
  });
  await expect(page.locator('[data-mid="alignment-2"] .plus-check')).toBeVisible();
  for(const scale of [1,1.25]){
    await page.locator('#root').evaluate((root,value)=>(root as HTMLElement).style.setProperty('--chat-scale',String(value)),scale);
    for(const identity of await page.locator('.msg-identity').all()){
      const metrics=await identity.evaluate(el=>{const center=(e:Element)=>{const r=e.getBoundingClientRect();return r.y+r.height/2;};return {name:center(el.querySelector('.msg-author')!),marks:[...el.querySelectorAll('.server-tag,.plus-check,.plus-identity-badge')].map(center)};});
      for(const mark of metrics.marks)expect(Math.abs(mark-metrics.name)).toBeLessThanOrEqual(1);
    }
  }
  await page.screenshot({path:`test-results/update37-identities-${info.project.name}.png`,animations:'disabled'});
  await page.evaluate(async()=>{const {useStore}=await import('/src/store/store.ts');useStore.setState(s=>{s.settings.density='compact';});});
  await expect(page.locator('[data-mid="alignment-2"] .msg-compact-head .plus-check')).toBeVisible();
  const compact=page.locator('[data-mid="alignment-2"] .msg-identity');
  const centers=await compact.evaluate(el=>[...el.children].filter(child=>child.getBoundingClientRect().height>0).map(child=>{const r=child.getBoundingClientRect();return r.y+r.height/2;}));
  expect(Math.max(...centers)-Math.min(...centers)).toBeLessThanOrEqual(1);
});
test('App37 noise control offers one shared selection and reports actual enhanced status',async({page},info)=>{
  await page.goto('/app?ui-e2e&call=connected');const noise=page.getByRole('button',{name:'Noise suppression',exact:true});
  await expect(noise).toBeVisible();await noise.click();
  await page.getByRole('menuitemradio',{name:'Enhanced noise suppression (Krisp)',exact:false}).click();
  await expect(page.getByRole('menu')).toBeHidden();
  expect(await page.evaluate(async()=>{const {useStore}=await import('/src/store/store.ts');const s=useStore.getState().settings;return [s.noiseSuppression,s.enhancedNoiseSuppression];})).toEqual([true,true]);
  await page.evaluate(async()=>{const {useVoice}=await import('/src/voice/state.ts');useVoice.setState({noiseFilter:'fallback'});});
  await noise.click();await expect(page.getByRole('status').filter({hasText:'Krisp is unavailable here.'})).toBeVisible();
  await expect(page.getByText('Krisp is active',{exact:true})).toHaveCount(0);
  await page.getByRole('menuitemradio',{name:'Off',exact:true}).click();await expect(page.getByRole('menu')).toBeHidden();await expect(noise).toHaveAttribute('aria-pressed','false');
  await noise.click();await page.getByRole('menuitemradio',{name:'Standard noise suppression',exact:false}).click();
  await expect(page.getByRole('menu')).toBeHidden();
  expect(await page.evaluate(async()=>{const {useStore}=await import('/src/store/store.ts');const s=useStore.getState().settings;return [s.noiseSuppression,s.enhancedNoiseSuppression];})).toEqual([true,false]);
  await noise.click();await expect(page.getByRole('menu')).toBeVisible();await page.screenshot({path:`test-results/update37-noise-${info.project.name}.png`,animations:'disabled'});
});
test('App37 responsive chat, call controls, profile, settings and discovery stay within their viewport',async({page},info)=>{
  for(const width of [320,390,768,1024,1440,1920]){
    await page.setViewportSize({width,height:width<700?844:900});await page.goto('/app?ui-e2e&call=connected');
    const controls=page.locator('.call-panel .vcontrols');await expect(controls).toBeVisible();
    for(const button of await controls.getByRole('button').all()){const r=await button.boundingBox();expect(r!.x).toBeGreaterThanOrEqual(0);expect(r!.x+r!.width).toBeLessThanOrEqual(width+1);expect(r!.height).toBeGreaterThanOrEqual(44);}
    await page.getByRole('button',{name:'Noise suppression',exact:true}).click();const menu=await page.getByRole('menu').boundingBox();expect(menu!.x).toBeGreaterThanOrEqual(0);expect(menu!.x+menu!.width).toBeLessThanOrEqual(width+1);await page.keyboard.press('Escape');
    await page.goto('/app?ui-e2e&section=voice');await expect(page.locator('.settings-main')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+1);
    await page.goto('/app?ui-e2e');await page.evaluate(async()=>{const {useUI}=await import('/src/store/ui.ts');useUI.getState().openModal({type:'profile',userId:'bob'});});await expect(page.getByRole('dialog')).toBeVisible();const profile=await page.getByRole('dialog').boundingBox();expect(profile!.x).toBeGreaterThanOrEqual(0);expect(profile!.x+profile!.width).toBeLessThanOrEqual(width+1);
    await page.goto('/app?ui-e2e');await page.evaluate(async()=>{const {useStore}=await import('/src/store/store.ts');useStore.getState().goHome('discover');});await expect(page.locator('.discover-hero')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+1);
  }
  if(info.project.name==='mobile-webkit'){await page.setViewportSize({width:844,height:390});await page.goto('/app?ui-e2e&call=connected');await expect(page.locator('.call-panel .vcontrols')).toBeVisible();await page.screenshot({path:'test-results/update37-landscape-call.png'});}
});
test('App37 download prioritises desktop and browser with usable actions at every width',async({page},info)=>{
  for(const width of [320,390,768,1024,1440,1920]){
    await page.setViewportSize({width,height:900});await page.goto('/download/');
    const desktop=page.locator('.download-choices').getByRole('link',{name:'Download for Windows',exact:true});const browser=page.locator('.download-choices').getByRole('link',{name:'Open ONYX',exact:true});
    await expect(desktop).toHaveAttribute('href','/downloads/ONYX-Desktop-Windows-0.1-Setup.exe');await expect(browser).toHaveAttribute('href','/app');
    await expect(page.getByText('Download companion',{exact:true})).toHaveCount(0);await expect(page.locator('main')).not.toContainText('Your games. On your profile.');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+1);
    if(width>=768){const a=await desktop.boundingBox(),b=await browser.boundingBox();expect(a!.y+a!.height).toBeLessThan(900);expect(b!.y+b!.height).toBeLessThan(900);}
    if(width===390||width===1440)await page.screenshot({path:`test-results/update37-download-${width}-${info.project.name}.png`,fullPage:true});
  }
});
