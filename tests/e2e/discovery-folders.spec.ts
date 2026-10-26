import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{
  await page.route('**/rest/v1/**',route=>route.fulfill({json:[]}));
  await page.route('**/functions/v1/**',route=>route.fulfill({status:401,json:{error:'local_fixture'}}));
  await page.route('https://**',route=>route.fulfill({status:204}));
});

test('server folders create, expand, rename, move and dissolve without losing servers',async({page})=>{
  await page.goto('/app?ui-e2e&nav=1');
  const rail=page.getByRole('navigation',{name:'Servers',exact:true});
  await expect(rail).toBeVisible();
  const before=await page.evaluate(async()=>{const {useStore}=await import('/src/store/store.ts');return useStore.getState().serverOrder;});
  const name=await page.evaluate(async()=>{const {useStore}=await import('/src/store/store.ts');const s=useStore.getState();return s.servers[s.serverOrder[0]].name;});
  await rail.getByRole('button',{name,exact:true}).click({button:'right'});
  await page.getByRole('menuitem',{name:'Server folders'}).hover();
  await page.getByRole('menuitem',{name:'Create folder',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.getByRole('textbox').fill('My games');await dialog.getByRole('button',{name:'Create folder',exact:true}).click();
  await rail.getByRole('button',{name:'My games',exact:true}).click();
  await expect(rail.getByRole('button',{name,exact:true})).toBeVisible();
  await rail.getByRole('button',{name:'Folder settings'}).click();await page.getByRole('menuitem',{name:'Rename folder'}).click();
  await dialog.getByRole('textbox').fill('Friends');await dialog.getByRole('button',{name:'Save',exact:true}).click();
  await expect(rail.getByRole('button',{name:'Friends',exact:true})).toHaveAttribute('aria-expanded','true');
  await page.evaluate(async()=>{const {useStore}=await import('/src/store/store.ts');const {moveToFolder}=await import('/src/lib/serverFolders.ts');const s=useStore.getState();s.setServerFolders(moveToFolder(s.serverFolders,s.serverOrder[1],s.serverFolders[0].id));});
  await expect(rail.locator('.rail-folder .rail-item')).toHaveCount(3);
  const gaps=await rail.locator('.folder-servers .rail-item').evaluateAll(items=>items.slice(1).map((item,i)=>item.getBoundingClientRect().top-items[i].getBoundingClientRect().bottom));expect(gaps.every(gap=>gap>=8)).toBeTruthy();
  await page.screenshot({path:`test-results/folders-${test.info().project.name}.png`});
  await page.reload();await expect(rail.getByRole('button',{name:'Friends',exact:true})).toHaveAttribute('aria-expanded','false');
  const miniatures=await rail.locator('.folder-mini .server-icon').evaluateAll(items=>items.map(item=>({width:item.getBoundingClientRect().width,height:item.getBoundingClientRect().height})));expect(miniatures.length).toBe(2);expect(miniatures.every(size=>size.width<=18.1&&size.height<=18.1)).toBeTruthy();
  await rail.getByRole('button',{name:'Friends',exact:true}).click();await rail.getByRole('button',{name:'Folder settings'}).click();await page.getByRole('menuitem',{name:'Dissolve folder'}).click();
  await expect(rail.locator('.rail-folder')).toHaveCount(0);
  expect(await page.evaluate(async()=>{const {useStore}=await import('/src/store/store.ts');return useStore.getState().serverOrder;})).toEqual(before);
});

test('discovery searches real API results, hides private data, filters and handles failure',async({page})=>{
  let category:string|null=null,query='';let fail=false;
  await page.route('**/rest/v1/rpc/search_server_directory',async route=>{
    const body=route.request().postDataJSON();category=body.p_category;query=body.p_query;
    if(fail){await route.fulfill({status:500,json:{message:'synthetic failure'}});return;}
    await route.fulfill({json:category==='music'||query==='none'?[]:[{id:'synthetic-public',name:'Orbit Garden',description:'A local synthetic community for interface tests.',category:'gaming',icon_color:'#10b981',members:37,code:'synthetic-invite',verified:false,banner:{kind:'preset',id:'celestial'}}]});
  });
  await page.goto('/app?ui-e2e');
  await page.evaluate(async()=>{const {useStore}=await import('/src/store/store.ts');useStore.getState().goHome('discover');});
  await expect(page.getByRole('heading',{name:'Find your community'})).toBeVisible();await expect(page.getByRole('heading',{name:'Orbit Garden'})).toBeVisible();
  await page.getByRole('navigation',{name:'Community categories'}).getByRole('button',{name:'Music',exact:true}).click();
  await expect(page.getByRole('heading',{name:'No communities found'})).toBeVisible();expect(category).toBe('music');
  await page.getByRole('button',{name:'All',exact:true}).click();await expect(page.getByRole('heading',{name:'Orbit Garden'})).toBeVisible();
  await page.getByRole('textbox',{name:'Search communities'}).fill('none');await expect(page.getByRole('heading',{name:'No communities found'})).toBeVisible();expect(query).toBe('none');
  fail=true;await page.getByRole('textbox',{name:'Search communities'}).fill('fail');await expect(page.getByText('Communities could not be loaded.',{exact:true})).toBeVisible();
  fail=false;await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(page.getByRole('heading',{name:'Orbit Garden'})).toBeVisible();
  await page.screenshot({path:`test-results/discover-${test.info().project.name}.png`});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});

test('only owners can opt in and settings use an ONYX category menu',async({page})=>{
  let saved:unknown=null;
  await page.route('**/rest/v1/server_directory*',route=>route.fulfill({json:[]}));
  await page.route('**/rest/v1/rpc/save_server_directory',route=>{saved=route.request().postDataJSON();return route.fulfill({json:null});});
  await page.goto('/app?ui-e2e');
  await page.evaluate(async()=>{const {useUI}=await import('/src/store/ui.ts');useUI.getState().openSettings({kind:'server',serverId:'s_onyx',section:'discover'});});
  await expect(page.getByRole('heading',{name:'Discover',exact:true})).toBeVisible();
  await page.getByRole('switch').check();await page.getByRole('button',{name:'Community',exact:true}).click();await page.getByRole('menuitemradio',{name:'Gaming'}).click();await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect.poll(()=>saved).toEqual({p_server:'s_onyx',p_enabled:true,p_category:'gaming'});
});

test('dragging a server onto another creates a folder with both identities',async({page},info)=>{
  test.skip(info.project.name.startsWith('mobile'),'Touch uses the tested folder menu.');
  await page.goto('/app?ui-e2e&nav');
  const names=await page.evaluate(async()=>{const {useStore}=await import('/src/store/store.ts');const s=useStore.getState();return s.serverOrder.slice(0,2).map(id=>s.servers[id].name);});
  const rail=page.getByRole('navigation',{name:'Servers',exact:true});
  await rail.getByRole('button',{name:names[0],exact:true}).dragTo(rail.getByRole('button',{name:names[1],exact:true}));
  const dialog=page.getByRole('dialog');await dialog.getByRole('textbox').fill('Dragged group');await dialog.getByRole('button',{name:'Create folder',exact:true}).click();
  await rail.getByRole('button',{name:'Dragged group',exact:true}).click();
  for(const name of names)await expect(rail.locator('.rail-folder').getByRole('button',{name,exact:true})).toBeVisible();
});

test('desktop appearance bridge only sends theme colors and visible context',async({page})=>{
  await page.addInitScript(()=>{const w=window as any;w.chrome??={};w.__chromeMessages=[];w.chrome.webview={postMessage:(message:unknown)=>w.__chromeMessages.push(message),addEventListener:()=>{},removeEventListener:()=>{}};});
  await page.goto('/app?ui-e2e');
  await expect.poll(()=>page.evaluate(()=>(window as any).__chromeMessages.at(-1)?.title)).toBe('Bob');
  await page.evaluate(()=>{document.documentElement.dataset.theme='onyx';});
  await expect.poll(()=>page.evaluate(()=>(window as any).__chromeMessages.at(-1)?.background)).toBe('#07090b');
  const messages=await page.evaluate(()=>(window as any).__chromeMessages);
  expect(messages.length).toBeGreaterThan(0);for(const message of messages)expect(Object.keys(message).sort()).toEqual(['background','canBack','canForward','foreground','title','type']);
});
