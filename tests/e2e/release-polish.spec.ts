import {test,expect} from '@playwright/test';import {readFileSync} from 'node:fs';
const catalog=JSON.parse(readFileSync('src/config/commerce.json','utf8'));
test.beforeEach(async({page})=>{await page.emulateMedia({reducedMotion:'reduce'});await page.route('https://**',route=>route.fulfill({status:204}));await page.route('**/rest/v1/**',route=>route.fulfill({json:[]}));await page.route('**/functions/v1/**',route=>route.fulfill({json:{}}));});
test('active Plus identity expires in an already open profile and retired Verified stays hidden',async({page})=>{
 await page.clock.install();await page.goto('/app?ui-e2e');
 await page.evaluate(async()=>{const {useStore}=await import('/src/store/store.ts');const {useUI}=await import('/src/store/ui.ts');const state=useStore.getState();useStore.setState({users:{...state.users,[state.meId]:{...state.users[state.meId],plusSince:Date.now()-60000,plusUntil:Date.now()+5000,badges:['verified']}}});useUI.getState().openModal({type:'profile',userId:state.meId});});
 const dialog=page.getByRole('dialog');await expect(dialog.locator('.plus-identity-badge')).toHaveCount(1);await expect(dialog.locator('.plus-check')).toHaveCount(1);await expect(dialog.getByText('Verified',{exact:true})).toHaveCount(0);await expect(dialog.locator('.pmodal-badges')).toHaveCount(0);
 await page.clock.fastForward(5100);await expect(dialog.locator('.plus-identity-badge')).toHaveCount(0);await expect(dialog.locator('.plus-check')).toHaveCount(0);
});
test('promotion shows actual rank projections, premium tier and quiet purchase details',async({page},info)=>{
 await page.route('**/functions/v1/billing',route=>route.fulfill({json:route.request().method()==='GET'?{...catalog,ready:true,mode:'live',topAvailable:2}:{legacy:false,listed:true,rank:137,projections:{boost:23,super:8,mega:3,top:2},listedCount:500,subscription:null,promotions:[]}}));
 await page.goto('/app?ui-e2e');await page.evaluate(async()=>{const {useUI}=await import('/src/store/ui.ts');useUI.getState().openSettings({kind:'server',serverId:'s_onyx',section:'promote'});});
 await expect(page.locator('.promotion-current-rank')).toContainText('#137');await expect(page.locator('.promotion-projected-rank strong')).toHaveText(['#23','#8','#3']);await expect(page.locator('.promotion-slot-meter .is-open')).toHaveCount(2);
 await expect(page.getByText('Placement does not guarantee new members.',{exact:true})).toHaveCount(0);await expect(page.getByRole('link',{name:'Purchase terms',exact:true})).not.toBeVisible();
 await expect(page.getByText('Purchase information',{exact:true})).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.locator('.settings-main').evaluate(element=>element.scrollTop=0);await page.screenshot({path:`test-results/update35-promotion-${info.project.name}.png`,fullPage:true});
});
test('rapid category changes abort stale results and returning categories reuse their cache',async({page},info)=>{
 const calls:Record<string,number>={};
 await page.route('**/rest/v1/rpc/search_server_directory',async route=>{const category=route.request().postDataJSON().p_category??'all';calls[category]=(calls[category]??0)+1;await new Promise(resolve=>setTimeout(resolve,category==='music'?450:30));try{await route.fulfill({json:Array.from({length:6},(_,index)=>({id:`${category}-${index}`,name:`${category} community ${index}`,description:'Synthetic community for layout checks.',category:category==='all'?'gaming':category,icon_color:['#248b7e','#605dd3','#218eaa'][index%3],members:index+1,code:'synthetic-invite',verified:false,boost_level:index===1?3:0,promotion:index===0?'top':index===1?'boost':undefined,banner:{kind:'preset',id:['celestial','aurora','sunset'][index%3]}}))});}catch{/* A cancelled fetch intentionally ignores its late response. */}});
 await page.goto('/app?ui-e2e');await page.evaluate(async()=>{const {useStore}=await import('/src/store/store.ts');useStore.getState().goHome('discover');});await expect(page.getByRole('heading',{name:'all community 0',exact:true})).toBeVisible();
 const categories=page.getByRole('navigation',{name:'Community categories'});await categories.getByRole('button',{name:'Music',exact:true}).click();await categories.getByRole('button',{name:'Gaming',exact:true}).click();
 await expect(page.getByRole('heading',{name:'gaming community 0',exact:true})).toBeVisible();await page.waitForTimeout(500);await expect(page.getByRole('heading',{name:'music community 0',exact:true})).toHaveCount(0);
 await categories.getByRole('button',{name:'All',exact:true}).click();await expect(page.getByRole('heading',{name:'all community 0',exact:true})).toBeVisible();expect(calls.all).toBe(1);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.screenshot({path:`test-results/update35-discover-${info.project.name}.png`,fullPage:true});
});

test('saving owner opt-out invalidates a previously cached Discover page',async({page})=>{
 let listed=true,calls=0;
 await page.route('**/rest/v1/server_directory*',route=>route.fulfill({json:{enabled:true,category:'general'}}));
 await page.route('**/rest/v1/rpc/save_server_directory',route=>{listed=route.request().postDataJSON().p_enabled;return route.fulfill({json:null});});
 await page.route('**/rest/v1/rpc/search_server_directory',route=>{calls++;return route.fulfill({json:listed?[{id:'s_onyx',name:'Opt-out test community',category:'general',icon_color:'#10b981',members:1,code:'synthetic-invite',verified:false}]:[]});});
 await page.goto('/app?ui-e2e');await page.evaluate(async()=>{const {useStore}=await import('/src/store/store.ts');useStore.getState().goHome('discover');});await expect(page.getByRole('heading',{name:'Opt-out test community'})).toBeVisible();expect(calls).toBe(1);
 await page.evaluate(async()=>{const {useUI}=await import('/src/store/ui.ts');useUI.getState().openSettings({kind:'server',serverId:'s_onyx',section:'discover'});});
 await page.getByRole('switch').uncheck();await page.getByRole('button',{name:'Save',exact:true}).click();await expect.poll(()=>listed).toBe(false);await page.getByRole('button',{name:'Close settings',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Opt-out test community'})).toHaveCount(0);await expect(page.getByRole('heading',{name:'No communities found'})).toBeVisible();expect(calls).toBeGreaterThan(1);
});
