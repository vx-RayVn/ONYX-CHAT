import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Fixture navigation must never contact cloud services or send account mail.
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }));
  await page.route('**/functions/v1/**', (route) => route.fulfill({ status: 401, json: { error: 'local_fixture' } }));
});

test('restored Plus preserves account data and cannot fake a cloud purchase', async ({ page }) => {
 await page.goto('/app?ui-e2e&nav');await expect(page.locator('.nav-list')).toBeVisible();
 await expect(page.locator('.nav-list').getByRole('button',{name:'ONYX Plus',exact:true})).toBeVisible();
 const result=await page.evaluate(async()=>{const {useStore}=await import('/src/store/store.ts');const s=useStore.getState(),before=JSON.stringify(s.users[s.meId]);s.purchasePlus();s.goHome('plus');return {before,after:JSON.stringify(useStore.getState().users[s.meId])};});
 expect(result.before).toBe(result.after);await expect(page.locator('.plus-view')).toBeVisible();await expect(page.getByText('per month',{exact:true})).toBeVisible();
 await page.evaluate(async()=>{const {useUI}=await import('/src/store/ui.ts');useUI.getState().openModal({type:'plusCheckout'});});
 await expect(page.getByRole('dialog').getByRole('button',{name:'Continue to Stripe'})).toBeDisabled();
});

test('cloud-style account without demo users opens Appearance without crashing', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?ui-e2e&section=appearance');
  await expect(page.getByRole('heading', { name: 'Appearance', exact: true })).toBeVisible();
  await expect(page.locator('.appearance-preview')).toBeVisible();
  expect(errors).toEqual([]);
});

test('DM profile fills the side panel, renders the DE flag and anchors full profile below', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/?ui-e2e');
  const aside = page.locator('.dm-profile');
  const card = aside.locator('.pcard');
  await expect(card).toBeVisible();
  await expect(aside.locator('.pcard-inner')).toHaveCSS('border-bottom-left-radius', '0px');
  await expect(page.getByRole('button', { name: 'Local demo', exact: true })).toHaveCount(0);
  await expect(aside.locator('.flag[aria-label="Germany"] > svg')).toBeVisible();
  const panel = await aside.boundingBox();
  const profile = await card.boundingBox();
  expect(Math.abs(panel!.height - profile!.height)).toBeLessThan(2);
  const expand = aside.getByRole('button', { name: 'Full profile', exact: true });
  expect((await expand.boundingBox())!.y).toBeGreaterThan(panel!.y + panel!.height - 80);
  await page.screenshot({ path: 'test-results/ui-profile-desktop.png' });
  await expand.click();
  await expect(page.locator('.pmodal')).toBeVisible();
});

test('compact mobile header keeps actions accessible without a second logo row', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?ui-e2e');
  await expect(page.locator('.topbar')).toHaveCount(0);
  await page.getByRole('button',{name:'More actions',exact:true}).click();
  await expect(page.getByRole('button', { name: 'ONYX Plus', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mentions', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/ui-header-mobile.png' });
});

test('notifications offers incoming and outgoing calls and all voice tones', async ({ page }) => {
  await page.goto('/?ui-e2e&section=notifications');
  const sounds = page.locator('.sound-previews');
  await expect(sounds.getByRole('button')).toHaveCount(8);
  const outgoing = sounds.getByRole('button', { name: 'Outgoing call', exact: true });
  await outgoing.click();
  await expect(outgoing).toHaveAttribute('aria-pressed', 'true');
  await expect(outgoing).toHaveAttribute('aria-pressed', 'false', { timeout: 5000 });
});

test('profile colors form one continuous account surface and badge tooltips have no arrow', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/?ui-e2e&section=account');
  const body = page.locator('.account-body');
  await expect(body).toBeVisible();
  await expect(page.locator('.settings')).toHaveCSS('opacity', '1');
  expect(await body.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  await page.screenshot({ path: 'test-results/ui-account-colors.png' });
  await page.locator('.account-badges .user-badge').first().hover();
  const tooltip = page.locator('.badge-tooltip-surface');
  await expect(tooltip).toBeVisible();
  await expect(tooltip.locator('polygon')).toHaveCount(0);
});

test('OnyxServices hover keeps its orbit phase and the CTA glow stays blue', async ({ page }) => {
  await page.goto('/?ui-e2e');
  const nav = page.locator('.nav-item-os');
  const orbit = nav.locator('.border-line');
  const animation = () => orbit.evaluate((el) => {
    const a = el.getAnimations({ subtree: true }).find((a) => (a as CSSAnimation).animationName === 'onyx-border-rotate')!;
    return { time: Number(a.currentTime), duration: a.effect!.getTiming().duration, playState: a.playState };
  });
  await expect.poll(async () => (await animation()).time).toBeGreaterThan(10);
  const before = await animation();
  await nav.hover();
  const after = await animation();
  expect(after.duration).toBe(before.duration);
  expect(after.time).toBeGreaterThanOrEqual(before.time);
  expect(after.playState).toBe('running');
  await nav.click();
  const cta = page.locator('.os-card .os-cta');
  await cta.hover();
  await expect.poll(() => cta.evaluate((el) => getComputedStyle(el).boxShadow)).toContain('59, 130, 246');
});

test('short message names stay on one line and header tools sit beside the right actions', async ({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await page.goto('/?ui-e2e&community');
  const name=page.locator('.msg-author').filter({hasText:'rayvn'}).first();
  await expect(name).toBeVisible();await expect(name).toHaveCSS('white-space','nowrap');
  const bounds=await name.boundingBox(),line=await name.evaluate(el=>parseFloat(getComputedStyle(el).lineHeight));
  expect(bounds!.height).toBeLessThanOrEqual(line+2);
  const tools=await page.locator('.view-header-tools').boundingBox(),actions=await page.locator('.view-header > .header-actions').boundingBox();
  expect(actions!.x-(tools!.x+tools!.width)).toBeLessThan(24);
  await expect(page.locator('.dm-profile .pcard-inner')).toHaveCSS('border-bottom-right-radius','0px');
  await expect(page.locator('.workspace')).toHaveCSS('border-bottom-right-radius','0px');
});

test('selected server tag opens a real invitation preview and badge settings contain nine official entries', async ({page})=>{
  await page.route('**/rest/v1/rpc/invite_preview',route=>route.fulfill({json:{code:'fixtureinvite',server_id:'s_onyx',name:'Fixture Community',icon:null,banner:null,description:'Local test only',members:2,created_at:new Date().toISOString()}}));
  await page.goto('/?ui-e2e&community');
  await page.locator('.msg').getByRole('button',{name:'View server: ONYX'}).click();
  await expect(page.getByRole('heading',{name:'Fixture Community'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Sign in to join'})).toBeVisible();
  await page.goto('/?ui-e2e&section=badges');
  await expect(page.locator('.official-badge-grid > article')).toHaveCount(9);
  await expect(page.getByText('Server tag',{exact:true})).toBeVisible();
});

test('developer settings show real app metadata and never render an access-token field',async({page})=>{
  await page.route('**/rest/v1/bot_apps**',route=>route.fulfill({json:[{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',owner_id:'alice',name:'Fixture Bot',description:'Synthetic UI only',avatar:null,commands:[{name:'ping',description:'Ping'}]}]}));
  await page.goto('/?ui-e2e&section=developer');
  await expect(page.getByRole('heading',{name:'Developer',exact:true})).toBeVisible();
  await expect(page.locator('.developer-bots').getByText('Fixture Bot',{exact:true})).toBeVisible();
  await expect(page.getByRole('textbox',{name:'Pairing code'})).toHaveAttribute('maxlength','10');
  await expect(page.getByRole('textbox',{name:/token/i})).toHaveCount(0);
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('.settings')).toHaveClass(/show-content/);
  await expect(page.getByRole('heading',{name:'Developer',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/developer-mobile.png'});
});

test('official badge editor has a dedicated desktop layout and live draft preview',async({page},info)=>{
  await page.setViewportSize({width:1440,height:1000});await page.goto('/?ui-e2e&admin&section=badge-admin');
  await expect(page.getByRole('heading',{name:'Official badge editor',exact:true})).toBeVisible();
  await expect(page.locator('.settings')).toHaveCSS('opacity','1');
  await page.locator('.badge-admin-catalog').getByRole('button').filter({hasText:'Founder'}).click();
  await page.getByRole('textbox',{name:'Name',exact:true}).fill('ONYX Founder');
  await expect(page.locator('.badge-admin-preview h3')).toHaveText('ONYX Founder');
  expect(await page.locator('.settings-main').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await page.screenshot({animations:'disabled',path:`test-results/${info.project.name}-badge-editor-desktop.png`});
});

const realMe='00000000-0000-4000-8000-0000000000f1',realServer='00000000-0000-4000-8000-0000000000a1';
test('deleted-user tombstones never enter UUID filters and acknowledged badge edits survive a failed refresh',async({page})=>{
  const queries:string[]=[];let failReads=false,patches=0;
  let badge={id:'verified',name:'Verified',description:'Identity confirmed',image:null,edited_by:null as string|null,customized:false};
  await page.route('**/rest/v1/**',route=>{
    const request=route.request(),url=new URL(request.url());
    if(request.method()==='PATCH'&&url.pathname.endsWith('/badge_catalog')){
      patches++;badge={...badge,...request.postDataJSON(),customized:true};failReads=true;return route.fulfill({json:badge});
    }
    if(url.pathname.endsWith('/badge_catalog'))return route.fulfill({json:[badge]});
    if(url.pathname.endsWith('/profile_tags')){
      queries.push(url.searchParams.get('user_id')??'');
      if(url.search.includes('deleted-user'))return route.fulfill({status:400,json:{code:'22P02',message:'invalid input syntax for type uuid: "deleted-user"'}});
      if(failReads)return route.fulfill({status:503,json:{message:'read unavailable'}});
      return route.fulfill({json:[]});
    }
    return route.fulfill({json:[]});
  });
  await page.goto('/?ui-e2e&strict-ids&admin&section=badge-admin');
  await expect.poll(()=>queries.length).toBeGreaterThan(0);
  expect(queries.every(query=>!query.includes('deleted-user')&&query.includes(realMe))).toBe(true);
  await page.getByRole('textbox',{name:'Name',exact:true}).fill('Verified live acknowledgement');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByText('Saved',{exact:true})).toBeVisible();
  await expect(page.locator('.badge-admin-catalog').getByText('Verified live acknowledgement',{exact:true})).toBeVisible();
  await expect(page.getByText('That didn’t work',{exact:true})).toHaveCount(0);expect(patches).toBe(1);
  failReads=false;await page.reload();
  await expect(page.getByRole('textbox',{name:'Name',exact:true})).toHaveValue('Verified live acknowledgement');
  await expect(page.getByText('Only platform admins can edit these badges.',{exact:true})).toHaveCount(0);
});

test('tag save works with an empty read cache, repeats and loads the saved configuration on reload',async({page})=>{
  let tag:Record<string,unknown>|null=null;let saves=0,reads=0;
  await page.route('**/rest/v1/**',route=>{
    const url=new URL(route.request().url());
    if(url.pathname.endsWith('/rpc/save_server_tag')){
      const body=route.request().postDataJSON();expect(body.p_server_id).toBe(realServer);
      tag={server_id:realServer,label:body.p_label,image:body.p_image,enabled:body.p_enabled,invite_code:'fixtureinvite'};saves++;
      return route.fulfill({json:tag});
    }
    if(url.pathname.endsWith('/profile_tags')){reads++;return reads===1?route.fulfill({status:503,json:{message:'temporary outage'}}):route.fulfill({json:[]});}
    if(url.pathname.endsWith('/server_tags'))return route.fulfill({json:tag?[tag]:[]});
    if(route.request().method()!=='GET')throw Error('Unexpected direct write '+url.pathname);
    return route.fulfill({json:[]});
  });
  await page.goto('/?ui-e2e&strict-ids&server-section=badges');
  await page.getByRole('textbox',{name:'Name',exact:true}).fill('SAME');
  await page.getByRole('button',{name:'Save',exact:true}).click();await expect.poll(()=>saves).toBe(1);
  await page.getByRole('textbox',{name:'Name',exact:true}).fill('NEW');
  await page.getByRole('button',{name:'Save',exact:true}).click();await expect.poll(()=>saves).toBe(2);
  await expect(page.getByText('That didn’t work',{exact:true})).toHaveCount(0);
  await page.reload();await expect(page.getByRole('textbox',{name:'Name',exact:true})).toHaveValue('NEW');
});

test('rejected badge writes keep the draft and never report Saved',async({page})=>{
  await page.route('**/rest/v1/badge_catalog**',route=>route.request().method()==='PATCH'?route.fulfill({status:403,json:{code:'42501',message:'permission denied'}}):route.fulfill({json:[]}));
  await page.goto('/?ui-e2e&admin&section=badge-admin');
  await page.getByRole('textbox',{name:'Name',exact:true}).fill('Unsaved draft');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByText('That didn’t work',{exact:true})).toBeVisible();
  await expect(page.getByText('Saved',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('textbox',{name:'Name',exact:true})).toHaveValue('Unsaved draft');
});

test('cloud settings contain no stale demo notices or credits block',async({page})=>{
  for(const section of ['whatsnew','demo','plus','profile']){
    await page.goto('/?ui-e2e&section='+section);
    await expect(page.locator('.settings-main')).toBeVisible();
    await expect(page.locator('.settings-main')).not.toContainText(/demo|stored locally|Credits|Couldn’t load server tags\./i);
  }
});

test('public invite landing canonicalises a short path and keeps its invitation through the sign-in screen',async({page},info)=>{
  await page.route('**/rest/v1/rpc/invite_preview',route=>route.fulfill({json:{code:'fixtureinvite',server_id:realServer,name:'ONYX Community',icon:'/brand/onyx-mark-64.webp',banner:{kind:'image',src:'/brand/onyx-logo-512.webp'},description:'A place for your community.',members:42,created_at:new Date().toISOString()}}));
  await page.goto('/?ui-e2e&landing');
  await expect(page).toHaveURL(/\/invite\/fixtureinvite/);
  await expect(page).toHaveTitle('ONYX Community · ONYX');
  await expect(page.getByRole('heading',{name:'ONYX Community'})).toBeVisible();
  await expect(page.getByText('42 members',{exact:true})).toBeVisible();
  await page.screenshot({animations:'disabled',path:`test-results/${info.project.name}-public-invite-desktop.png`});
  await page.setViewportSize({width:390,height:844});
  expect(await page.locator('.invite-landing').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.screenshot({animations:'disabled',path:`test-results/${info.project.name}-public-invite-mobile.png`});
  await page.getByRole('button',{name:'Sign in to join',exact:true}).click();
  await expect(page.locator('.auth-card')).toBeVisible();
  await expect(page).toHaveURL(/\/invite\/fixtureinvite/);
  // No sign-in or real credentials: only the invitation-preserving navigation is tested.
});

async function socialProviders(page:import('@playwright/test').Page,enabled=['steam','twitch']){
 await page.route('**/functions/v1/connections/providers',route=>route.fulfill({json:{providers:['steam','twitch','youtube','spotify','epic','xbox','riot','playstation'].map(id=>({id,available:enabled.includes(id)}))}}));
}
test('connection buttons reflect actual server availability rather than a hardcoded Steam-only UI',async({page})=>{
 await socialProviders(page);
 await page.goto('/?ui-e2e&strict-ids&section=connections');
 await expect(page.getByRole('button',{name:'Connect Twitch',exact:true})).toBeEnabled();
 await expect(page.getByRole('button',{name:'Connect Spotify',exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Connect PlayStation',exact:true})).toBeDisabled();
 await expect(page.locator('.connection-card')).toHaveCount(8);
 await expect(page.locator('.settings-main')).not.toContainText('Browsers cannot detect');
});
test('same-browser account linking completes once, defaults to visible, updates visibility and disconnects',async({page},info)=>{
 await socialProviders(page);
 const state='s'.repeat(43),receipt='r'.repeat(43);let linked=false,visible=true,finishes=0,binding='';
 await page.route('https://id.twitch.tv/**',route=>route.fulfill({contentType:'text/html',body:'<p>Synthetic provider. No real authentication.</p>'}));
 await page.route('**/rest/v1/profile_connections**',route=>{
  const url=new URL(route.request().url());
  if(route.request().method()==='PATCH'){expect(url.searchParams.get('user_id')).toBe('eq.'+realMe);expect(url.searchParams.get('provider')).toBe('eq.twitch');visible=route.request().postDataJSON().is_visible;return route.fulfill({json:{provider:'twitch'}});}
  return route.fulfill({json:linked&&url.searchParams.get('user_id')==='eq.'+realMe?[{user_id:realMe,provider:'twitch',external_id:'123',display_name:'Verified Streamer',profile_handle:'streamer',is_visible:visible}]:[]});
 });
 await page.route('**/functions/v1/connections',route=>{
  const body=route.request().postDataJSON();
  if(body.action==='start'){binding=body.binding;return route.fulfill({json:{state,url:'https://id.twitch.tv/oauth2/authorize?state='+state}});}
  if(body.action==='finish'){expect(body).toEqual({action:'finish',state,receipt,binding});finishes++;linked=true;return route.fulfill({json:{provider:'twitch'}});}
  if(body.action==='disconnect'){expect(body.provider).toBe('twitch');linked=false;return route.fulfill({json:{ok:true}});}
  throw Error('unexpected action');
 });
 await page.goto('/?ui-e2e&strict-ids&section=connections');
 await page.getByRole('button',{name:'Connect Twitch',exact:true}).click();await expect(page).toHaveURL(/^https:\/\/id\.twitch\.tv/);
 await page.goto('/?ui-e2e&strict-ids&return-connection#connection=finish&state='+state+'&receipt='+receipt);
 await expect(page.getByText('Account connected',{exact:true})).toBeVisible();expect(finishes).toBe(1);expect(await page.evaluate(()=>location.hash)).toBe('');
 await expect(page.getByRole('link',{name:'Verified Streamer'})).toHaveAttribute('href','https://www.twitch.tv/streamer');
 const toggle=page.getByRole('switch',{name:'Display Twitch on profile',exact:true});await expect(toggle).toBeChecked();await toggle.click();await expect(toggle).not.toBeChecked();
 await page.screenshot({animations:'disabled',path:`test-results/${info.project.name}-connections-linked.png`});
 await page.getByRole('button',{name:'Disconnect Twitch',exact:true}).click();await expect(page.getByRole('button',{name:'Connect Twitch',exact:true})).toBeEnabled();
 expect(await page.evaluate(state=>sessionStorage.getItem('onyx:connection:'+state),state)).toBeNull();
});
test('a callback opened in a different browser never commits a connection',async({page})=>{
 await socialProviders(page);let posts=0;
 await page.route('**/functions/v1/connections',route=>{posts++;return route.fulfill({status:403,json:{error:'invalid_state'}});});
 await page.goto('/?ui-e2e&strict-ids&return-connection#connection=finish&state='+'s'.repeat(43)+'&receipt='+'r'.repeat(43));
 await expect(page.getByText('Return to the browser where you started connecting.',{exact:true})).toBeVisible();
 expect(posts).toBe(0);expect(await page.evaluate(()=>location.hash)).toBe('');
 await expect(page.getByText('Account connected',{exact:true})).toHaveCount(0);
});
test('profiles show only visible social identities with the corresponding provider links',async({page})=>{
 await page.route('**/rest/v1/profile_connections**',route=>route.fulfill({json:[
  {user_id:'00000000-0000-4000-8000-0000000000f2',provider:'twitch',external_id:'123',display_name:'Public Streamer',profile_handle:'streamer',is_visible:true},
  {user_id:'00000000-0000-4000-8000-0000000000f2',provider:'spotify',external_id:'account',display_name:'Private Listener',profile_handle:'listener',is_visible:false},
 ]}));
 await page.goto('/?ui-e2e&strict-ids');
 await expect(page.locator('.dm-profile .profile-connection')).toHaveCount(1);
 await expect(page.locator('.dm-profile').getByRole('link',{name:/Public Streamer/})).toHaveAttribute('href','https://www.twitch.tv/streamer');
 await expect(page.locator('.dm-profile')).not.toContainText('Private Listener');
});
