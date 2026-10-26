import {test,expect,type Page,type Locator} from '@playwright/test';

// All accounts and responses are synthetic; no production service is contacted.
test.beforeEach(async({page})=>{
  await page.route('**/rest/v1/**',route=>route.fulfill({json:[]}));
  await page.route('**/functions/v1/**',route=>route.fulfill({status:401,json:{error:'local_fixture'}}));
});
async function fits(page:Page,locator:Locator){
  await expect(locator).toBeVisible();const v=page.viewportSize()!;
  await expect.poll(async()=>{const b=(await locator.boundingBox())!;return b.x>=-1&&b.y>=-1&&b.x+b.width<=v.width+1&&b.y+b.height<=v.height+1;}).toBe(true);
}
async function touchTarget(locator:Locator){await expect.poll(async()=>{const b=(await locator.boundingBox())!;return Math.min(b.width,b.height);}).toBeGreaterThanOrEqual(43.99);}
async function section(page:Page,id:string,label:string,extra=''){
  await page.goto(`/?ui-e2e&section=${id}${extra}`);
  await expect(page.locator('.settings')).toBeVisible();
  const nav=page.locator('.settings-nav').getByRole('button').filter({hasText:new RegExp('^'+label)});if(await nav.isVisible())await nav.tap();
  await expect(page.locator('.settings')).toHaveClass(/show-content/);
}
for(const [width,height] of [[320,568],[390,844],[834,1112],[1024,768],[844,390]]){
  test(`single tap opens chats and channels at ${width}x${height}`,async({page})=>{
    await page.setViewportSize({width,height});await page.goto('/?ui-e2e&nav');
    await expect(page.locator('.app')).toHaveClass(/mobile-nav/);
    await page.locator('.dm-item').filter({hasText:'Charlie'}).tap();
    await expect(page.locator('.app')).toHaveClass(/mobile-main/);
    await expect(page.locator('.view-header h1')).toHaveText('Charlie');
    const back=page.getByRole('button',{name:'Back to navigation'});await touchTarget(back);await back.tap();
    await page.locator('.dm-item').filter({hasText:'Charlie'}).tap();await expect(page.locator('.app')).toHaveClass(/mobile-main/);
    await back.tap();await page.locator('.rail-btn-icon').first().tap();
    await page.locator('.channel').filter({hasText:'general'}).first().tap();
    await expect(page.locator('.app')).toHaveClass(/mobile-main/);await fits(page,page.locator('.view-header'));
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  });
}
test('touch profile is centered, starts at the top and its menu scrolls',async({page},info)=>{
  await page.goto('/?ui-e2e&nav');await page.getByRole('button',{name:'Your profile and status'}).tap();
  const sheet=page.locator('.profile-sheet');await fits(page,sheet);
  await page.screenshot({animations:'disabled',path:`test-results/${info.project.name}-self-profile-top.png`});
  const b=(await sheet.boundingBox())!;expect(Math.abs(b.x+b.width/2-195)).toBeLessThan(2);
  expect(await page.locator('.profile-sheet-scroll').evaluate(el=>el.scrollTop)).toBe(0);
  await touchTarget(sheet.getByRole('button',{name:'Close',exact:true}));
  await sheet.getByRole('button',{name:'Copy user ID',exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({animations:"disabled",path:`test-results/${info.project.name}-self-profile.png`});
  await sheet.getByRole('button',{name:'Edit profile',exact:true}).tap();
  await expect(sheet).toHaveCount(0);await expect(page.locator('.settings')).toBeVisible();
});
test('mobile actions have labels and open the full user profile',async({page},info)=>{
  await page.goto('/?ui-e2e');await touchTarget(page.getByRole('button',{name:'Start voice call',exact:true}));
  await page.getByRole('button',{name:'More actions',exact:true}).tap();
  const menu=page.locator('.header-overflow');await fits(page,menu);
  await touchTarget(menu.getByRole('button',{name:'Mentions',exact:true}));
  await expect(menu.getByRole('button',{name:'ONYX Plus',exact:true})).toHaveCount(0);
  const search=menu.getByRole('textbox',{name:'Search messages',exact:true});expect((await search.boundingBox())!.width).toBeGreaterThan(240);
  await page.screenshot({animations:"disabled",path:`test-results/${info.project.name}-actions.png`});
  await menu.getByRole('button',{name:'Full profile',exact:true}).tap();await fits(page,page.locator('.pmodal'));
});
test('settings sections and Profile Studio tabs stay usable on touch',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await section(page,'account','My Account');
  const head=page.locator('.settings-mobile-head');await fits(page,head);
  await touchTarget(head.getByRole('button',{name:'Back',exact:true}));await touchTarget(head.getByRole('button',{name:'Close settings',exact:true}));
  for(const label of ['Appearance','Voice & Video','Notifications','Badges','Privacy & Safety','Connections','Accessibility','Keybinds','Language','Profile Studio']){
    await head.getByRole('button',{name:'Back',exact:true}).tap();
    await page.locator('.settings-nav').getByRole('button').filter({hasText:new RegExp('^'+label)}).tap();
    const overflow=await page.locator('.settings-main').evaluate(el=>el.scrollWidth>el.clientWidth+1);expect(overflow,label).toBe(false);
  }
  const tabs=page.locator('.studio-nav-item');
  for(let i=0;i<await tabs.count();i++){await tabs.nth(i).scrollIntoViewIfNeeded();await touchTarget(tabs.nth(i));await tabs.nth(i).tap();expect(await page.locator('.settings-main').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);}
  await page.screenshot({animations:"disabled",path:`test-results/${info.project.name}-studio.png`});expect(errors).toEqual([]);
});
test('server tag chooser uses a fitted dialog and saves only after choosing a server',async({page},info)=>{
  let choice:unknown;
  await page.route('**/rest/v1/rpc/choose_server_tag',route=>{choice=route.request().postDataJSON();return route.fulfill({json:'s_onyx'});});
  await section(page,'badges','Badges','&community');
  await expect(page.locator('.server-tag-picker select')).toHaveCount(0);
  await page.locator('.server-tag-picker').getByRole('button',{name:'Change',exact:true}).tap();
  await fits(page,page.locator('.tag-picker-dialog'));
  const radio=page.getByRole('radio').filter({hasText:'ONYX'});await touchTarget(radio);await radio.tap();
  await expect(page.locator('.tag-picker-dialog')).toHaveCount(0);expect(choice).toEqual({p_server_id:'s_onyx'});
  await page.screenshot({animations:"disabled",path:`test-results/${info.project.name}-badges.png`});
});
test('owner saves a server tag atomically without client writes to invitations',async({page},info)=>{
  const inserts:{table:string;data:Record<string,unknown>}[]=[];
  await page.route('**/rest/v1/**',route=>{
    if(route.request().method()==='POST'){const data=route.request().postDataJSON();inserts.push({table:new URL(route.request().url()).pathname.split('/').pop()!,data});
      if('uses' in data)return route.fulfill({status:403,json:{message:'permission denied'}});
      if(route.request().url().includes('/rpc/save_server_tag'))return route.fulfill({json:{server_id:'s_onyx',label:data.p_label,image:null,enabled:true,invite_code:'fixtureinvite'}});
    }return route.fulfill({json:[]});
  });
  await page.goto('/?ui-e2e&server-section=badges');await expect(page.locator('.tag-settings-layout')).toBeVisible();
  await page.getByRole('textbox',{name:'Name',exact:true}).fill('TEST');await page.getByRole('button',{name:'Save',exact:true}).tap();
  await expect(page.getByText('Saved',{exact:true})).toBeVisible();
  expect(inserts.some(x=>x.table==='invites'||x.table==='server_tags')).toBe(false);
  expect(inserts.find(x=>x.table==='save_server_tag')!.data).toEqual({p_server_id:'s_onyx',p_label:'TEST',p_image:null,p_enabled:true});
  await page.screenshot({animations:"disabled",path:`test-results/${info.project.name}-server-tag.png`});
});
test('official badge editor is separate, responsive and previews changes before saving',async({page},info)=>{
  let update:Record<string,unknown>|undefined;
  await page.route('**/rest/v1/badge_catalog**',route=>{if(route.request().method()==='PATCH'){update=route.request().postDataJSON();return route.fulfill({json:{id:'verified',...update,customized:true}});}return route.fulfill({json:[]});});
  await section(page,'badge-admin','Official badge editor','&admin');
  await expect(page.locator('.badge-admin-catalog > button')).toHaveCount(9);
  await page.getByRole('textbox',{name:'Name',exact:true}).fill('ONYX Verified');
  await expect(page.locator('.badge-admin-preview h3')).toHaveText('ONYX Verified');
  await page.screenshot({animations:"disabled",path:`test-results/${info.project.name}-badge-editor.png`});
  await page.getByRole('button',{name:'Save',exact:true}).tap();await expect(page.getByText('Saved',{exact:true})).toBeVisible();expect(update?.name).toBe('ONYX Verified');
  await page.goto('/?ui-e2e&section=account');await expect(page.locator('.settings-nav').getByRole('button',{name:'Official badge editor',exact:true})).toHaveCount(0);
});
test('invite copy waits for server confirmation and uses one protocol, short path and Never',async({page})=>{
  let release!:()=>void;const gate=new Promise<void>(r=>release=r);let payload:Record<string,unknown>|undefined;let posts=0;
  await page.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{value:{writeText:(value:string)=>{(window as unknown as {copied:string}).copied=value;return Promise.resolve();}},configurable:true});});
  await page.route('**/rest/v1/invites**',async route=>{posts++;payload=route.request().postDataJSON();await Promise.race([gate,new Promise(r=>setTimeout(r,10000))]);await route.fulfill({status:201,body:''});});
  await page.goto('/?ui-e2e&invite',{waitUntil:'domcontentloaded'});const copy=page.getByRole('button',{name:'Copy',exact:true});await expect(copy).toBeDisabled();
  await expect(page.locator('.invite-meta').getByRole('button',{name:'Never',exact:true})).toBeVisible();
  await expect.poll(()=>payload?.expires_at).toBeNull();release();await expect(copy).toBeEnabled();await copy.tap();
  const copied=await page.evaluate(()=>(window as unknown as {copied:string}).copied);expect(copied).toMatch(/^https:\/\/onyxchat\.site\/[a-z0-9]+$/);expect(posts).toBe(1);
  await page.locator('.invite-meta').getByRole('button',{name:'Never',exact:true}).tap();await page.getByRole('menuitemradio',{name:'1 day',exact:true}).tap();
  await expect.poll(()=>payload?.expires_at).not.toBeNull();
});
test('failed invite can be retried without copying a nonexistent link',async({page})=>{
  let fail=true;await page.route('**/rest/v1/invites**',route=>fail?route.fulfill({status:403,json:{code:'42501',message:'permission denied'}}):route.fulfill({status:201,body:''}));
  await page.goto('/?ui-e2e&invite');await expect(page.getByText('Invite unavailable',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Copy',exact:true})).toBeDisabled();
  fail=false;await page.getByRole('button',{name:'Try again',exact:true}).tap();await expect(page.getByRole('button',{name:'Copy',exact:true})).toBeEnabled();
});
for(const state of ['ringing','connected'])test(`call ${state} keeps tiles, names and controls inside the mobile panel`,async({page},info)=>{
  await page.goto(`/?ui-e2e&call=${state}`);const panel=page.locator('.call-panel');await fits(page,panel);
  const tile=page.locator(state==='ringing'?'.call-self .vtile':'.call-stage .vtile').first();await expect(tile).toBeVisible();
  const bounds=(await tile.boundingBox())!;expect(bounds.height).toBeGreaterThanOrEqual(150);
  await touchTarget(page.getByRole('button',{name:'Larger',exact:true}));await page.getByRole('button',{name:'Larger',exact:true}).tap();await fits(page,panel);
  expect((await panel.boundingBox())!.height).toBeLessThan(550);
  for(const button of await panel.locator('.vcontrols button').all())await touchTarget(button);
  await page.screenshot({animations:"disabled",path:`test-results/${info.project.name}-call-${state}.png`});
  await page.setViewportSize({width:844,height:390});await fits(page,panel);
});
test('tablet settings and right-to-left profile fit without horizontal overflow',async({page},info)=>{
  await page.setViewportSize({width:834,height:1112});await section(page,'profile','Profile Studio');
  expect(await page.locator('.settings-main').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await page.goto('/?ui-e2e&nav&lang=ar');await expect(page.locator('html')).toHaveAttribute('dir','rtl');
  await page.locator('.user-panel-id').tap();await fits(page,page.locator('.profile-sheet'));
  await page.screenshot({animations:"disabled",path:`test-results/${info.project.name}-tablet-rtl.png`});
});
test('keyboard viewport changes keep the composer visible without disabling pinch zoom',async({page})=>{
  await page.addInitScript(()=>{
    const viewport=new EventTarget();Object.assign(viewport,{height:844,offsetTop:0,scale:1});Object.defineProperty(window,'visualViewport',{value:viewport});
    (window as unknown as {resizeKeyboard:(height:number,top:number,scale?:number)=>void}).resizeKeyboard=(height,top,scale=1)=>{Object.assign(viewport,{height,offsetTop:top,scale});viewport.dispatchEvent(new Event('resize'));};
  });
  await page.goto('/?ui-e2e');await page.getByRole('textbox',{name:'Message @Bob'}).tap();
  await page.evaluate(()=>(window as unknown as {resizeKeyboard:(h:number,t:number,s?:number)=>void}).resizeKeyboard(390,12));
  await expect(page.locator('html')).toHaveAttribute('data-keyboard','open');
  await expect.poll(async()=>{const b=(await page.locator('.composer-wrap').boundingBox())!;return b.y+b.height;}).toBeLessThanOrEqual(402);
  await page.evaluate(()=>(window as unknown as {resizeKeyboard:(h:number,t:number,s?:number)=>void}).resizeKeyboard(200,12,2));
  expect(await page.locator('html').evaluate(el=>(el as HTMLElement).style.getPropertyValue('--touch-height'))).toBe('390px');
  await page.evaluate(()=>(window as unknown as {resizeKeyboard:(h:number,t:number,s?:number)=>void}).resizeKeyboard(844,0));
  await expect(page.locator('html')).toHaveAttribute('data-keyboard','closed');
  await page.setViewportSize({width:1366,height:1024});
  await page.evaluate(()=>(window as unknown as {resizeKeyboard:(h:number,t:number)=>void}).resizeKeyboard(500,0));
  await expect.poll(async()=>{const b=(await page.locator('.composer-wrap').boundingBox())!;return b.y+b.height;}).toBeLessThanOrEqual(500);
});
test('server settings panels stay inside a phone and keep navigation reachable',async({page})=>{
  await page.goto('/?ui-e2e&server-section=overview');
  for(const label of ['Overview','Roles','Emojis','Server tag','Channels','Members','Bans','Invites']){
    await page.locator('.settings-nav').getByRole('button',{name:label,exact:true}).tap();
    expect(await page.locator('.settings-main').evaluate(el=>el.scrollWidth<=el.clientWidth+1),label).toBe(true);
    await page.locator('.settings-mobile-head').getByRole('button',{name:'Back',exact:true}).tap();
  }
});
test('home pages and their header actions fit the smallest phone',async({page},info)=>{
  await page.setViewportSize({width:320,height:568});await page.goto('/?ui-e2e&nav');
  for(const label of ['Friends','OnyxServices']){
    await page.locator('.nav-list').getByRole('button').filter({hasText:label}).tap();
    await fits(page,page.locator('.view-header'));expect(await page.locator('.main').evaluate(el=>el.scrollWidth<=el.clientWidth+1),label).toBe(true);
    await page.getByRole('button',{name:'More actions',exact:true}).tap();await fits(page,page.locator('.header-overflow'));
    await page.locator('.header-overflow-head').getByRole('button',{name:'Close',exact:true}).tap();
    await page.locator('.view-header').getByRole('button',{name:'Back',exact:true}).tap();
  }
  await page.screenshot({animations:'disabled',path:`test-results/${info.project.name}-navigation-small.png`});
});
test('badge artwork upload previews a real PNG and rejects unsupported image types',async({page})=>{
  await section(page,'badge-admin','Official badge editor','&admin');
  const input=page.locator('.badge-admin-detail input[type="file"]');
  await input.setInputFiles('public/brand/favicon-64.png');
  await expect(page.locator('.badge-admin-preview img')).toHaveAttribute('src',/^data:image\/png;base64,/);
  await input.setInputFiles({name:'not-supported.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});
  await expect(page.getByText('Image not applied',{exact:true})).toBeVisible();
  await expect(page.locator('.badge-admin-preview img')).toHaveAttribute('src',/^data:image\/png;base64,/);
  await page.getByRole('button',{name:'Remove',exact:true}).tap();await expect(page.locator('.badge-admin-preview img')).toHaveCount(0);
});

test('connected social cards fit phone and tablet with independent touch visibility controls',async({page},info)=>{
 await page.route('**/functions/v1/connections/providers',route=>route.fulfill({json:{providers:['steam','twitch','spotify','youtube'].map(id=>({id,available:true}))}}));
 await page.route('**/rest/v1/profile_connections**',route=>route.fulfill({json:[{user_id:'00000000-0000-4000-8000-0000000000f1',provider:'twitch',external_id:'123',display_name:'Verified Streamer',profile_handle:'streamer',is_visible:false}]}));
 await section(page,'connections','Connections','&strict-ids');
 for(const width of [320,390,834]){
  await page.setViewportSize({width,height:844});
  expect(await page.locator('.settings-main').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await touchTarget(page.getByRole('button',{name:'Disconnect Twitch',exact:true}));
  await touchTarget(page.getByRole('switch',{name:'Display Twitch on profile',exact:true}));
 }
 await page.screenshot({animations:'disabled',path:`test-results/${info.project.name}-connections.png`});
});
