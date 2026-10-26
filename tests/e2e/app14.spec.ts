import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{
 await page.route('**/rest/v1/**',route=>route.fulfill({json:[]}));
 await page.route('**/functions/v1/**',route=>route.fulfill({status:401,json:{error:'local_fixture'}}));
});
test('Discord import previews the real structure and preserves the request ID after a failed commit',async({page},info)=>{
 const requests:any[]=[];
 await page.route('**/functions/v1/server-import',async route=>{
  const body=route.request().postDataJSON();requests.push(body);
  if(body.action==='preview')return route.fulfill({json:{name:'The squad',description:'Local template fixture',roles:3,categories:2,channels:8,examples:[{name:'welcome',type:'text'},{name:'Lobby',type:'voice'}],skipped:1,fingerprint:'fixture-hash'}});
  if(requests.filter(item=>item.action==='import').length===1)return route.fulfill({status:503,json:{error:'import_failed'}});
  return route.fulfill({json:{serverId:'10000000-0000-4000-8000-000000000014'}});
 });
 await page.goto('/?ui-e2e&strict-ids&create-server');
 await expect(page.getByRole('button',{name:/Standard structure/})).toBeVisible();
 await expect(page.getByRole('button',{name:/Gaming community|Friend group|Creator & stream/})).toHaveCount(0);
 await page.getByRole('button',{name:/Import from Discord/}).click();
 await page.getByLabel('Discord template link',{exact:true}).fill('https://discord.new/localfixture');
 await page.getByRole('button',{name:'Preview import',exact:true}).click();
 await expect(page.locator('.discord-import-counts')).toContainText('8');
 await expect(page.locator('.discord-import-warning')).toContainText('1 unsupported channels');
 await page.getByLabel('Server name',{exact:true}).fill('My squad');
 await page.getByRole('button',{name:'Import server',exact:true}).click();
 await expect(page.getByRole('alert').filter({hasText:'safely try again'})).toBeVisible();
 await expect(page.getByLabel('Server name',{exact:true})).toHaveValue('My squad');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.evaluate(()=>document.fonts.ready);
 await page.screenshot({path:`test-results/app14-import-${info.project.name}.png`});
 await page.getByRole('button',{name:'Import server',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 const imports=requests.filter(item=>item.action==='import');expect(imports).toHaveLength(2);
 expect(imports[0].requestId).toBe(imports[1].requestId);expect(imports[1].fingerprint).toBe('fixture-hash');
 expect(imports[1]).not.toHaveProperty('roles');
});
test('10% offer copies the actual code and fits narrow and wide screens',async({page},info)=>{
 await page.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(value:string)=>{(window as any).__copied=value;}}});});
 await page.goto('/?ui-e2e&page=shop');
 await expect(page.locator('#os-perk-title')).toContainText('10%');
 await page.getByRole('button',{name:'Copy discount code',exact:true}).click();
 await expect(page.locator('.os-copy-code')).toContainText('Copied');
 expect(await page.evaluate(()=>(window as any).__copied)).toBe('ONYXCHAT');
 for(const width of [320,390,834,1440]){
  await page.setViewportSize({width,height:900});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const coupon=await page.locator('.os-coupon').boundingBox();expect(coupon!.width).toBeLessThanOrEqual(width);
 }
 await page.setViewportSize({width:info.project.name.startsWith('mobile')?390:1440,height:1000});
 await page.evaluate(()=>document.fonts.ready);
 await page.locator('.os-coupon').scrollIntoViewIfNeeded();
 await page.screenshot({path:`test-results/app14-shop-${info.project.name}.png`});
});
test('official community has no leave action; ordinary servers retain their management actions',async({page})=>{
 await page.setViewportSize({width:1280,height:900});
 await page.goto('/?ui-e2e&official&nav');
 await page.locator('.server-header-btn').click();
 await expect(page.getByRole('menuitem',{name:/Leave server|Delete server/})).toHaveCount(0);
 await expect(page.getByRole('menuitem',{name:/Server profile/})).toBeVisible();
 await page.keyboard.press('Escape');
 await page.locator('.rail-item.is-active .rail-btn').click({button:'right'});
 await expect(page.getByRole('menuitem',{name:/Leave server|Delete server/})).toHaveCount(0);
 await page.keyboard.press('Escape');
 await page.goto('/?ui-e2e&server-section=overview');
 await expect(page.locator('.settings').getByText('Delete server',{exact:true}).first()).toBeVisible();
 await page.goto('/?ui-e2e&official&server-section=overview');
 await expect(page.locator('.settings')).toBeVisible();
 await expect(page.locator('.settings').getByText(/Leave server|Delete server/)).toHaveCount(0);
});
test('compact server tag keeps its label and clickable invitation',async({page})=>{
 await page.goto('/?ui-e2e&community');
 const tag=page.locator('.msg .server-tag').first();
 await expect(tag).toHaveText('ONYX');
 expect((await tag.boundingBox())!.height).toBeLessThanOrEqual(18);
 await tag.click();
 await expect(page.getByRole('dialog')).toBeVisible();
});
