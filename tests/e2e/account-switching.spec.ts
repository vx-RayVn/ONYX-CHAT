import{authEntryFixture}from'./auth-entry-fixture';
import {test,expect,type Page} from '@playwright/test';
const ids=['19191919-1919-4191-8191-191919191901','19191919-1919-4191-8191-191919191902'];
const stamp=new Date().toISOString(),factorId='19191919-1919-4191-8191-191919191910';
function jwt(index:number,aal='aal1',expired=false){const enc=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url');return enc({alg:'HS256',typ:'JWT'})+'.'+enc({sub:ids[index],role:'authenticated',aud:'authenticated',aal,session_id:ids[index],iat:Math.floor(Date.now()/1000)-60,exp:Math.floor(Date.now()/1000)+(expired?-60:3600)})+'.'+enc('synthetic-local-signature');}
async function fixture(page:Page,{mfa=false,expired=false,remembered=true}:{mfa?:boolean;expired?:boolean;remembered?:boolean}={}){
 const state={mfa,aal:['aal1','aal1'],revoked:false,wrongPassword:false,refreshes:0,data:[] as {index:number;path:string}[],logouts:[] as string[]};
 const user=(i:number)=>({id:ids[i],aud:'authenticated',role:'authenticated',email:`account${i+1}@onyx.invalid`,email_confirmed_at:stamp,created_at:stamp,app_metadata:{provider:'email',providers:['email']},user_metadata:{locale:'en'},factors:i===1&&state.mfa?[{id:factorId,factor_type:'totp',status:'verified',friendly_name:'Fixture phone',created_at:stamp}]:[]});
 const session=(i:number)=>({access_token:jwt(i,state.aal[i]),refresh_token:`synthetic-refresh-${i}`,expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:user(i)});
 await page.addInitScript(({initial,saved})=>{
  if(sessionStorage.getItem('switch19-seeded'))return;sessionStorage.setItem('switch19-seeded','1');localStorage.setItem('onyx-auth',JSON.stringify(initial));localStorage.setItem('onyx-accounts-v1',JSON.stringify(saved));
 },{initial:session(0),saved:remembered?[{id:ids[1],email:user(1).email,name:'Account Two',color:'#0fb988',access_token:jwt(1,'aal1',expired),refresh_token:'synthetic-refresh-1'}]:[]});
 const actor=(auth:string|null)=>{try{return ids.indexOf(JSON.parse(Buffer.from((auth||'').split('.')[1],'base64url').toString()).sub);}catch{return -1;}};
 await page.context().route('https://**',r=>r.fulfill({status:204}));
 await page.context().route('**/auth/v1/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname.replace('/auth/v1',''),body=req.postData()?req.postDataJSON():{},i=actor(req.headers().authorization);
  const bad=()=>route.fulfill({status:400,headers:{'X-Supabase-Api-Version':'2024-01-01'},json:{code:'invalid_credentials',msg:'Invalid login credentials'}});
  if(path==='/user'&&req.method()==='GET'){if(i<0||i===1&&state.revoked)return bad();return route.fulfill({json:user(i)});}
  if(path==='/user')return route.fulfill({json:user(i)});
  if(path==='/token'){
   const target=url.searchParams.get('grant_type')==='refresh_token'?Number(String(body.refresh_token).slice(-1)):body.email==='account2@onyx.invalid'?1:0;
   if(target===1&&state.revoked||state.wrongPassword)return bad();
   if(url.searchParams.get('grant_type')==='refresh_token')state.refreshes++;
   return route.fulfill({json:session(target)});
  }
  if(path.endsWith('/challenge'))return route.fulfill({json:{id:factorId,type:'totp',expires_at:Math.floor(Date.now()/1000)+300}});
  if(path.endsWith('/verify')){state.aal[1]='aal2';return route.fulfill({json:session(1)});}
  if(path==='/logout'){state.logouts.push(url.search);return route.fulfill({status:204});}
  return route.fulfill({status:400,json:{code:'unexpected_fixture_request'}});
 });
 await page.context().route('**/rest/v1/**',async route=>{
  const req=route.request(),url=new URL(req.url()),i=actor(req.headers().authorization);state.data.push({index:i,path:url.pathname});
  if(i<0)return route.fulfill({status:401,json:{message:'session_expired'}});
  if(i===1&&state.mfa&&state.aal[1]!=='aal2')return route.fulfill({status:403,json:{message:'mfa_required'}});
  if(url.pathname.endsWith('/rpc/account_status'))return route.fulfill({json:{admin:false,suspension:null}});
  if(url.pathname.endsWith('/rpc/ensure_official_server'))return route.fulfill({json:null});
  if(url.pathname.endsWith('/profiles'))return route.fulfill({json:[{id:ids[i],username:i?'accounttwo':'accountone',display_name:i?'Account Two':'Account One',avatar_color:'#0fb988',status:'online',badges:[],created_at:stamp,member_number:900000019+i,supporter_wall:false}]});
  return route.fulfill({json:[]});
 });
 await page.context().route('**/functions/v1/**',r=>r.fulfill({status:401,json:{error:'synthetic_account_switch_fixture'}}));
 await authEntryFixture(page);return state;
}
async function profile(page:Page){
 await expect(page.locator('.app')).toBeVisible();const trigger=page.getByRole('button',{name:'Your profile and status',exact:true});
 if(!await trigger.isVisible())await page.locator('.view-header').getByRole('button',{name:'Back',exact:true}).click();
 await trigger.click();await page.getByRole('button',{name:'Switch accounts',exact:true}).click();await expect(page.getByRole('dialog',{name:'Switch accounts',exact:true})).toBeVisible();
}
async function expectAccount(page:Page,id:string){await expect(page.locator('.app')).toBeVisible();await expect.poll(()=>page.evaluate(async()=>{const {useStore}=await import('/src/store/store.ts');return useStore.getState().meId;}).catch(()=>null)).toBe(id);}

test('saved accounts switch both ways without mixing chats, drafts, notes or pending UI',async({page},info)=>{
 const state=await fixture(page);await page.goto('/app');await expectAccount(page,ids[0]);
 await page.evaluate(async()=>{const {useStore}=await import('/src/store/store.ts');const {useUI}=await import('/src/store/ui.ts');useStore.setState({drafts:{private:'Private account one draft'},notes:{private:'Private account one note'}});useUI.setState({search:{scope:'private',query:'Private account one search'},pending:{private:[]}});});
 await profile(page);await page.waitForTimeout(350);await page.screenshot({path:`test-results/accounts19-${info.project.name}.png`});await page.getByRole('button',{name:'Switch to Account Two',exact:true}).click();await expectAccount(page,ids[1]);
 const privateState=await page.evaluate(async()=>{const {useStore}=await import('/src/store/store.ts');const {useUI}=await import('/src/store/ui.ts');return JSON.stringify([useStore.getState().drafts,useStore.getState().notes,useUI.getState().search,useUI.getState().pending]);});expect(privateState).not.toContain('Private account one');
 await profile(page);await page.getByRole('button',{name:'Switch to Account One',exact:true}).click();await expectAccount(page,ids[0]);expect(state.logouts).toEqual([]);
});
test('adding an account uses actual Auth, survives reload and never stores the password',async({page})=>{
 await fixture(page,{remembered:false});await page.goto('/app');await profile(page);await page.getByRole('button',{name:'Add an account',exact:true}).click();
 await page.getByLabel('Email',{exact:true}).fill('account2@onyx.invalid');await page.getByLabel('Password',{exact:true}).fill('Synthetic-password-for-account19');await page.getByRole('button',{name:'Sign in and switch',exact:true}).click();await expectAccount(page,ids[1]);
 const storage=await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}));expect(storage).not.toContain('Synthetic-password-for-account19');expect(JSON.parse(await page.evaluate(()=>localStorage.getItem('onyx-accounts-v1')||'[]'))).toHaveLength(2);
 await page.reload();await expectAccount(page,ids[1]);
});
test('a wrong password leaves the current account and its data open',async({page})=>{
 const state=await fixture(page,{remembered:false});await page.goto('/app');await profile(page);state.wrongPassword=true;
 await page.getByRole('button',{name:'Add an account',exact:true}).click();await page.getByLabel('Email',{exact:true}).fill('account2@onyx.invalid');await page.getByLabel('Password',{exact:true}).fill('Synthetic-wrong-password');await page.getByRole('button',{name:'Sign in and switch',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Email or password is wrong.');await expectAccount(page,ids[0]);expect(state.data.every(r=>r.index===0)).toBe(true);
});
test('an expired access token refreshes before switching and replaces the saved tokens',async({page})=>{
 const state=await fixture(page,{expired:true});await page.goto('/app');await profile(page);await page.getByRole('button',{name:'Switch to Account Two',exact:true}).click();await expectAccount(page,ids[1]);expect(state.refreshes).toBeGreaterThan(0);
});
test('a revoked saved session is removed and cannot sign out the active account',async({page})=>{
 const state=await fixture(page,{expired:true});await page.goto('/app');await profile(page);state.revoked=true;await page.getByRole('button',{name:'Switch to Account Two',exact:true}).click();await expect(page.getByRole('alert')).toContainText('This saved session has expired.');await expectAccount(page,ids[0]);await expect(page.getByRole('button',{name:'Switch to Account Two',exact:true})).toHaveCount(0);
});
test('switching to an MFA account fetches no private data before the second factor',async({page})=>{
 const state=await fixture(page,{mfa:true});await page.goto('/app');await profile(page);await page.getByRole('button',{name:'Switch to Account Two',exact:true}).click();await expect(page.getByRole('heading',{name:'Two-factor authentication',exact:true})).toBeVisible();expect(state.data.some(r=>r.index===1)).toBe(false);
 await page.getByLabel('Authenticator code',{exact:true}).fill('123456');await page.getByRole('button',{name:'Verify and continue',exact:true}).click();await expectAccount(page,ids[1]);
});
test('forgetting an inactive account removes its tokens without touching the active session',async({page})=>{
 await fixture(page);await page.goto('/app');await profile(page);await page.getByRole('button',{name:'Forget Account Two on this device',exact:true}).click();await expect(page.getByRole('button',{name:'Switch to Account Two',exact:true})).toHaveCount(0);await expectAccount(page,ids[0]);expect(await page.evaluate(()=>localStorage.getItem('onyx-accounts-v1'))).not.toContain(ids[1]);
});
test('all open tabs follow an account switch and discard the previous identity',async({page})=>{
 await fixture(page);await page.goto('/app');await expectAccount(page,ids[0]);const other=await page.context().newPage();await other.goto('/app');await expectAccount(other,ids[0]);await profile(page);await page.getByRole('button',{name:'Switch to Account Two',exact:true}).click();await expectAccount(page,ids[1]);await expectAccount(other,ids[1]);await other.close();
});
test('cancelling MFA offers the other saved account without requiring its password again',async({page})=>{
 await fixture(page,{mfa:true});await page.goto('/app');await profile(page);await page.getByRole('button',{name:'Switch to Account Two',exact:true}).click();await expect(page.getByRole('heading',{name:'Two-factor authentication',exact:true})).toBeVisible();await page.getByRole('button',{name:'Back to sign-in',exact:true}).click();await page.getByRole('button',{name:'Switch to Account One',exact:true}).click();await expectAccount(page,ids[0]);
});
test('blocked storage reports the problem without switching or losing the active account',async({page})=>{
 await fixture(page);await page.goto('/app');await profile(page);await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='onyx-accounts-v1')throw new DOMException('Synthetic denied storage','SecurityError');return original.call(this,key,value);};});await page.getByRole('button',{name:'Switch to Account Two',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Your browser could not remember this account.');await expectAccount(page,ids[0]);
});
test('the device limit is visible and forgotten accounts free a slot',async({page})=>{
 await fixture(page);await page.goto('/app');await expectAccount(page,ids[0]);await page.evaluate(()=>{
  const entries=JSON.parse(localStorage.getItem('onyx-accounts-v1')||'[]'),base=entries[0];for(let n=3;n<=5;n++)entries.push({...base,id:`19191919-1919-4191-8191-19191919190${n}`,email:`account${n}@onyx.invalid`,name:`Account ${n}`});localStorage.setItem('onyx-accounts-v1',JSON.stringify(entries));window.dispatchEvent(new StorageEvent('storage',{key:'onyx-accounts-v1'}));
 });await profile(page);await expect(page.getByRole('button',{name:'Add an account',exact:true})).toBeDisabled();await page.getByRole('button',{name:'Forget Account Two on this device',exact:true}).click();await expect(page.getByRole('button',{name:'Add an account',exact:true})).toBeEnabled();
});
test('switching waits for pending writes and a timeout leaves the active session intact',async({page})=>{
 const state=await fixture(page);await page.goto('/app');await expectAccount(page,ids[0]);await page.evaluate(async()=>{
  const queue=await import('/src/backend/queue.ts');void queue.enqueue(()=>new Promise(resolve=>{(window as any).releaseWrite19=()=>resolve({error:null});}));
 });await profile(page);await page.getByRole('button',{name:'Switch to Account Two',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Your changes are still saving.');await expectAccount(page,ids[0]);expect(state.data.some(r=>r.index===1)).toBe(false);await page.evaluate(()=>(window as any).releaseWrite19());
});
test('the account dialog wraps at 320 pixels and supports RTL labels',async({page},info)=>{
 await fixture(page);await page.setViewportSize({width:320,height:740});await page.goto('/app');await expectAccount(page,ids[0]);await page.evaluate(async()=>{const {useStore}=await import('/src/store/store.ts');useStore.getState().setSetting('language','ar');});await expect(page.locator('html')).toHaveAttribute('lang','ar');await expect(page.locator('.app')).toBeVisible();
 const trigger=page.locator('.user-panel-id');if(!await trigger.isVisible())await page.locator('.mobile-back').first().click();await trigger.click();await page.getByRole('button',{name:'تبديل الحسابات',exact:true}).click();const modal=page.getByRole('dialog',{name:'تبديل الحسابات',exact:true});await expect(modal).toBeVisible();expect(await modal.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.waitForTimeout(350);await page.screenshot({path:`test-results/accounts19-rtl-${info.project.name}.png`});
});
test('logo and empty-state circles stay pixel-stable and the fill never reverses',async({page})=>{
 await page.route('https://**',r=>r.fulfill({status:204}));
 for(const width of [320,834,1440]){
  await page.setViewportSize({width,height:844});await page.goto('/app?ui-e2e&loading');const emblem=page.locator('.app-loading-emblem'),box=await emblem.boundingBox();
  const samples=await page.locator('.app-loading-track>span').evaluate(async el=>{const a=el.getAnimations()[0];await a.ready;const out=[];a.pause();for(const time of [0,1000,4000,9000,18000,25000]){a.currentTime=time;out.push(new DOMMatrix(getComputedStyle(el).transform).a);}return out;});
  expect(samples).toEqual([...samples].sort((a,b)=>a-b));expect(samples.at(-1)).toBe(1);expect(await emblem.boundingBox()).toEqual(box);expect(await emblem.evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
  await page.goto('/app?ui-e2e&page=friends&empty-friends');const circles=page.locator('.empty-illu-facet');await expect(circles).toHaveCount(3);for(const circle of await circles.all())expect(await circle.evaluate(el=>({animation:getComputedStyle(el).animationName,radius:getComputedStyle(el).borderRadius,clip:getComputedStyle(el).clipPath}))).toEqual({animation:'none',radius:'50%',clip:'none'});
 }
});
test('checking an existing push subscription never registers a new worker',async({page})=>{
 await fixture(page);await page.goto('/app');await expectAccount(page,ids[0]);
 const result=await page.evaluate(async()=>{
  let registrations=0,lookups=0;Object.defineProperty(window,'Notification',{configurable:true,value:{permission:'granted'}});Object.defineProperty(window,'PushManager',{configurable:true,value:function(){}});
  Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{register:()=>{registrations++;throw Error('Synthetic unexpected registration');},getRegistration:async()=>{lookups++;return undefined;}}});
  const {currentPushSubscription}=await import('/src/backend/push.ts');const subscription=await currentPushSubscription();return{subscription,registrations,lookups};
 });expect(result).toEqual({subscription:null,registrations:0,lookups:1});
});
