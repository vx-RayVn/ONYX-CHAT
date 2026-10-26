import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const me='00000000-0000-4000-8000-0000000000f1',other='00000000-0000-4000-8000-0000000000f2';
test.beforeEach(async({page})=>{
 await page.route('**/rest/v1/**',r=>r.fulfill({json:[]}));await page.route('**/functions/v1/**',r=>r.fulfill({json:{enabled:true,devices:[]}}));
 await page.route('**/functions/v1/connections/providers',r=>r.fulfill({json:{providers:[{id:'steam',available:true}]}}));
});
test('Steam persona and independent connection card heights on desktop and mobile',async({page},info)=>{
 await page.route('**/rest/v1/profile_connections**',r=>r.fulfill({json:[{user_id:me,provider:'steam',external_id:'76561198000000001',display_name:'SyntheticSteamPlayer',profile_handle:null,is_visible:true}]}));
 for(const width of [1280,834,390]){
  await page.setViewportSize({width,height:900});await page.goto('/?ui-e2e&strict-ids&section=connections');
  const steam=page.locator('.connection-card').filter({has:page.getByText('Steam',{exact:true})}),epic=page.locator('.connection-card').filter({has:page.getByText('Epic Games',{exact:true})});
  await expect(steam.getByRole('link',{name:'SyntheticSteamPlayer'})).toBeVisible();await expect(steam.getByRole('switch')).toBeChecked();
  const s=await steam.boundingBox(),e=await epic.boundingBox();expect(s!.height-e!.height).toBeGreaterThan(40);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({animations:'disabled',path:`test-results/${info.project.name}-steam-cards-${width}.png`});
 }
});
test('Steam signed return relay stays on the fixed backend and preserves the original return URL',async({page})=>{
 const state='s'.repeat(43),returnTo='https://onyxchat.site/connections/steam-return.html?state='+state;let reached=false;
 await page.route('https://your-project.supabase.co/functions/v1/connections/callback/steam**',r=>{const url=new URL(r.request().url());expect(url.searchParams.get('state')).toBe(state);expect(url.searchParams.get('openid.return_to')).toBe(returnTo);reached=true;return r.fulfill({contentType:'text/html',body:'<p>Verified relay fixture</p>'});});
 await page.goto('/connections/steam-return.html?'+new URLSearchParams({state,'openid.return_to':returnTo,'openid.mode':'id_res'}));await expect(page.getByText('Verified relay fixture')).toBeVisible();expect(reached).toBe(true);
});
test('real activity card shows a Steam game and a server-enforced privacy toggle',async({page},info)=>{
 await page.setViewportSize({width:1280,height:900});
 let enabled=true;await page.route('**/functions/v1/activity/**',r=>{const path=new URL(r.request().url()).pathname;if(path.endsWith('/settings'))enabled=r.request().postDataJSON().enabled;return r.fulfill({json:{enabled,devices:[]}});});
 await page.route('**/rest/v1/game_activities**',r=>r.fulfill({json:enabled?[{user_id:other,source:'steam',title:'Counter-Strike 2',game_key:'steam:730',since:new Date(Date.now()-180000).toISOString(),timing:'observed',expires_at:new Date(Date.now()+90000).toISOString()}]:[]}));
 await page.route('https://cdn.cloudflare.steamstatic.com/**',r=>r.fulfill({status:404}));
 await page.goto('/?ui-e2e&strict-ids&game-activity');await expect(page.locator('.dm-profile .activity-text strong')).toHaveText('Counter-Strike 2');await expect(page.locator('.dm-profile .activity-time')).toContainText('Detected');
 await expect(page.locator('.dm-profile').getByRole('link',{name:'View game',exact:true})).toHaveAttribute('href','https://store.steampowered.com/app/730/');
 await page.screenshot({animations:'disabled',path:`test-results/${info.project.name}-steam-activity.png`});
 await page.locator('.dm-profile').getByRole('button',{name:'Full profile',exact:true}).click();await page.setViewportSize({width:390,height:844});await expect(page.locator('.pmodal .activity-text strong')).toHaveText('Counter-Strike 2');
 await page.keyboard.press('Escape');await expect(page.locator('.pmodal')).toHaveCount(0);
 await page.goto('/?ui-e2e&strict-ids&game-activity&section=connections');const toggle=page.getByRole('switch',{name:'Activity status',exact:true});await expect(toggle).toBeChecked();await toggle.click();await expect(toggle).not.toBeChecked();expect(enabled).toBe(false);
 await page.reload();await expect(page.getByRole('switch',{name:'Activity status',exact:true})).not.toBeChecked();
});
test('Windows pairing requires explicit code confirmation and only sends the hash',async({page})=>{
 const hash='a'.repeat(64);let pairs=0;await page.route('**/functions/v1/activity/**',r=>{
  if(r.request().url().endsWith('/pair')){expect(r.request().postDataJSON()).toEqual({hash,name:'Windows'});pairs++;}return r.fulfill({json:{enabled:true,devices:[]}});
 });
 await page.goto('/?ui-e2e&strict-ids&game-activity#activity_pair='+hash);const dialog=page.getByRole('dialog',{name:'Connect Windows'});await expect(dialog).toBeVisible();await expect(dialog).toContainText('AAAA-AAAA');expect(pairs).toBe(0);expect(await page.evaluate(()=>location.hash)).toBe('');
 await dialog.getByRole('button',{name:'Connect',exact:true}).click();await expect(page.getByText('Windows connected',{exact:true})).toBeVisible();expect(pairs).toBe(1);
});
test('a fresh Windows game remains visible without browser presence and disappears after stopping',async({page})=>{
 await page.setViewportSize({width:1280,height:900});let playing=true;
 await page.route('**/rest/v1/game_activities**',r=>r.fulfill({json:playing?[{user_id:other,source:'desktop',title:'Unlinked Windows game',game_key:'custom:synthetic',since:new Date(Date.now()-60000).toISOString(),timing:'started',expires_at:new Date(Date.now()+70000).toISOString()}]:[]}));
 await page.goto('/?ui-e2e&strict-ids&game-activity&other-offline');await expect(page.locator('.dm-profile .activity-text strong')).toHaveText('Unlinked Windows game');await expect(page.locator('.dm-profile .activity-time')).toHaveText(/\d{2}:\d{2}/);
 playing=false;await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await expect(page.locator('.dm-profile .activity')).toHaveCount(0);
});

test('Fortnite uses its native icon, loads it once and keeps it in the mobile full profile',async({page},info)=>{
 await page.setViewportSize({width:1280,height:900});let iconReads=0;
 const png=process.env.ONYX_E2E_GAME_ICON?readFileSync(process.env.ONYX_E2E_GAME_ICON).toString('base64'):'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==';
 await page.route('**/rest/v1/game_activities**',r=>{
  if(new URL(r.request().url()).searchParams.get('select')==='artwork_png'){iconReads++;return r.fulfill({json:{artwork_png:png}});}
  return r.fulfill({json:[{user_id:other,source:'desktop',title:'Fortnite',game_key:'epic:Fortnite',artwork_hash:'a'.repeat(32),since:new Date(Date.now()-120000).toISOString(),timing:'started',expires_at:new Date(Date.now()+70000).toISOString()}]});
 });
 await page.goto('/?ui-e2e&strict-ids&game-activity');
 const icon=page.locator('.dm-profile .activity-art img');await expect(icon).toHaveAttribute('src','data:image/png;base64,'+png);await expect.poll(()=>icon.evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBeGreaterThan(0);
 await expect(page.locator('.dm-profile .activity-text strong')).toHaveText('Fortnite');
 await page.locator('.dm-profile').getByRole('button',{name:'Full profile',exact:true}).click();await page.setViewportSize({width:390,height:844});
 await expect(page.locator('.pmodal .activity-art img')).toHaveAttribute('src','data:image/png;base64,'+png);await expect(page.locator('.pmodal .activity-text strong')).toHaveText('Fortnite');expect(iconReads).toBe(1);
 await page.screenshot({animations:'disabled',path:`test-results/${info.project.name}-fortnite-native-icon.png`});
});

test('a missing native icon leaves a usable activity card without loading arbitrary URLs',async({page})=>{
 await page.setViewportSize({width:1280,height:900});
 await page.route('**/rest/v1/game_activities**',r=>new URL(r.request().url()).searchParams.get('select')==='artwork_png'?r.fulfill({json:{artwork_png:'https://attacker.invalid/image.svg'}}):r.fulfill({json:[{user_id:other,source:'desktop',title:'A game without artwork',game_key:'custom:unknown',artwork_hash:'b'.repeat(32),since:new Date().toISOString(),timing:'started',expires_at:new Date(Date.now()+70000).toISOString()}]}));
 await page.goto('/?ui-e2e&strict-ids&game-activity');await expect(page.locator('.dm-profile .activity-text strong')).toHaveText('A game without artwork');await expect(page.locator('.dm-profile .activity-art img')).toHaveCount(0);await expect(page.locator('.dm-profile .activity-art svg')).toBeVisible();
});
