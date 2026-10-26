import{authEntryFixture}from'./auth-entry-fixture';
import {test,expect,type Page} from '@playwright/test';
const userId='00000000-0000-4000-8000-000000000015',sessionId='15151515-1515-4151-8151-151515151501';
const factorId='15151515-1515-4151-8151-151515151510';
const stamp=new Date().toISOString();
const factor=(id=factorId,name='My phone',status='verified')=>({id,friendly_name:name,factor_type:'totp',status,created_at:stamp,updated_at:stamp});
function token(aal:string){const encode=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');return encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:userId,role:'authenticated',aud:'authenticated',iss:'http://127.0.0.1:5173/auth/v1',aal,session_id:sessionId,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})+'.'+Buffer.from('synthetic-local-fixture-signature').toString('base64url');}
async function fixture(page:Page,{enabled=false,aal='aal1',stored=true,staleFactors=false}:{enabled?:boolean;aal?:string;stored?:boolean;staleFactors?:boolean}={}){
 const state={factors:enabled?[factor()]:[],aal,email:'security-fixture@onyx.invalid',data:[] as string[],auth:[] as {method:string;path:string;body:any}[],failVerify:false,revoked:false};
 const user=()=>({id:userId,aud:'authenticated',role:'authenticated',email:state.email,email_confirmed_at:stamp,confirmed_at:stamp,created_at:stamp,app_metadata:{provider:'email',providers:['email']},user_metadata:{locale:'en'},factors:state.factors});
 const session=()=>({access_token:token(state.aal),refresh_token:'synthetic-refresh-fixture',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:user()});
 if(stored){const initial=session();if(staleFactors)initial.user.factors=[];await page.addInitScript(value=>localStorage.setItem('onyx-auth',JSON.stringify(value)),initial);}
 await page.route('**/auth/v1/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname.replace('/auth/v1',''),body=req.postData()?req.postDataJSON():{};state.auth.push({method:req.method(),path:url.pathname+url.search,body});
  if(path==='/user'&&req.method()==='GET')return route.fulfill({json:user()});
  if(path==='/user'&&req.method()==='PUT')return route.fulfill({json:user()});
  if(path==='/token'){if(url.searchParams.get('grant_type')==='refresh_token'&&!state.factors.some(f=>f.status==='verified'))state.aal='aal1';return route.fulfill({json:session()});}
  if(path==='/logout')return route.fulfill({status:204});
  if(path==='/factors'&&req.method()==='POST'){
   const id='15151515-1515-4151-8151-151515151511';state.factors.push(factor(id,body.friendly_name,'unverified'));
   return route.fulfill({json:{id,type:'totp',friendly_name:body.friendly_name,totp:{qr_code:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="white"/><path d="M10 10h30v30H10zm50 0h30v30H60zM10 60h30v30H10zm50 0h15v30H60z" fill="black"/></svg>',secret:'SYNTHETICSETUPKEYONLY',uri:'otpauth://totp/ONYX:local-fixture?secret=SYNTHETICSETUPKEYONLY'}}});
  }
  if(path.endsWith('/challenge'))return route.fulfill({json:{id:'15151515-1515-4151-8151-151515151520',type:'totp',expires_at:Math.floor(Date.now()/1000)+300}});
  if(path.endsWith('/verify')){
   if(state.failVerify||body.code!=='123456')return route.fulfill({status:422,headers:{'X-Supabase-Api-Version':'2024-01-01'},json:{code:'mfa_verification_failed',msg:'Synthetic invalid code'}});
   const id=path.split('/')[2],found=state.factors.find(f=>f.id===id);if(found)found.status='verified';state.aal='aal2';return route.fulfill({json:session()});
  }
  if(path.startsWith('/factors/')&&req.method()==='DELETE'){const id=path.split('/')[2];state.factors=state.factors.filter(f=>f.id!==id);return route.fulfill({json:{id}});}
  return route.fulfill({status:400,json:{code:'unexpected_fixture_request'}});
 });
 await page.route('**/rest/v1/**',async route=>{
  const req=route.request(),url=new URL(req.url());state.data.push(url.pathname);
  if(state.revoked)return route.fulfill({status:401,json:{message:'session_expired',code:'PT401'}});
  if(state.factors.some(f=>f.status==='verified')&&state.aal!=='aal2')return route.fulfill({status:403,json:{message:'mfa_required',code:'PT403'}});
  if(url.pathname.endsWith('/rpc/account_status'))return route.fulfill({json:{admin:false,suspension:null}});
  if(url.pathname.endsWith('/rpc/ensure_official_server'))return route.fulfill({json:null});
  if(url.pathname.endsWith('/profiles'))return route.fulfill({json:[{id:userId,username:'fixture15',display_name:'Security fixture',avatar_color:'#0fb988',status:'online',badges:[],created_at:stamp,member_number:900000015,supporter_wall:false}]});
  return route.fulfill({json:[]});
 });
 await page.route('**/functions/v1/**',r=>r.fulfill({status:401,json:{error:'local_fixture'}}));
 await authEntryFixture(page);return state;
}
async function openAccount(page:Page){await expect(page.locator('.app')).toBeVisible();const gear=page.getByRole('button',{name:'User settings',exact:true});if(!await gear.isVisible())await page.locator('.view-header').getByRole('button',{name:'Back',exact:true}).click();await gear.click();await expect(page.locator('.settings')).toBeVisible();const nav=page.locator('.settings-nav').getByRole('button',{name:'My Account',exact:true});if(await nav.isVisible()&&await page.locator('.settings').evaluate(el=>el.classList.contains('show-nav')))await nav.click();await expect(page.getByRole('heading',{name:'My Account',exact:true})).toBeVisible();}
test('private data waits for a valid second factor, including after reload',async({page})=>{
 const state=await fixture(page,{enabled:true,staleFactors:true});await page.goto('/app');
 await expect(page.getByRole('heading',{name:'Two-factor authentication',exact:true})).toBeVisible();expect(state.data).toEqual([]);await expect(page.locator('.app')).toHaveCount(0);
 await page.getByLabel('Authenticator code',{exact:true}).fill('999999');await page.getByRole('button',{name:'Verify and continue',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('incorrect or expired');expect(state.data).toEqual([]);
 await page.reload();await expect(page.getByRole('heading',{name:'Two-factor authentication',exact:true})).toBeVisible();expect(state.data).toEqual([]);
 await page.getByLabel('Authenticator code',{exact:true}).fill('123456');await page.getByRole('button',{name:'Verify and continue',exact:true}).click();await expect(page.locator('.app')).toBeVisible();expect(state.data).toContain('/rest/v1/profiles');
});
test('enrollment is explicit, verifies the code before enabling, and discards the setup secret',async({page},info)=>{
 const state=await fixture(page);await page.goto('/app');await openAccount(page);
 await expect(page.getByText('2FA is not enabled',{exact:true})).toBeVisible();expect(state.auth.filter(r=>r.method==='POST'&&r.path.endsWith('/factors'))).toHaveLength(0);
 await page.getByRole('button',{name:'Enable 2FA',exact:true}).click();await page.getByLabel('Authenticator name',{exact:true}).fill('My phone');await page.getByRole('button',{name:'Continue',exact:true}).click();
 await expect(page.getByAltText('Authenticator setup QR code')).toBeVisible();await expect(page.getByText('2FA is not enabled',{exact:true})).toBeVisible();
 await page.getByText('Can’t scan the QR code?',{exact:true}).click();await expect(page.locator('.security-key')).toContainText('SYNTHETICSETUPKEYONLY');
 await page.getByLabel('Authenticator code',{exact:true}).fill('999999');await page.getByRole('button',{name:'Verify and enable',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'incorrect or expired'})).toBeVisible();
 expect(state.factors[0].status).toBe('unverified');await page.getByLabel('Authenticator code',{exact:true}).fill('123456');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:`test-results/security15-setup-${info.project.name}.png`});
 await page.getByRole('button',{name:'Verify and enable',exact:true}).click();await expect(page.getByText('2FA is enabled',{exact:true})).toBeVisible();await expect(page.locator('.security-qr')).toHaveCount(0);
 const persisted=await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}));expect(persisted).not.toContain('SYNTHETICSETUPKEYONLY');expect(persisted).not.toContain('otpauth:');
 await expect(page.getByRole('button',{name:'Add backup authenticator',exact:true})).toBeVisible();
});
test('cancelled setup does not leave an active factor or create duplicates',async({page})=>{
 const state=await fixture(page);await page.goto('/app');await openAccount(page);await page.getByRole('button',{name:'Enable 2FA',exact:true}).click();await page.getByRole('button',{name:'Continue',exact:true}).click();
 await expect(page.locator('.security-qr')).toBeVisible();await page.getByRole('button',{name:'Cancel',exact:true}).click();await expect.poll(()=>state.factors.length).toBe(0);await expect(page.getByText('2FA is not enabled',{exact:true})).toBeVisible();
 expect(state.auth.filter(r=>r.method==='POST'&&r.path.endsWith('/factors'))).toHaveLength(1);
});
test('removing the last factor needs a fresh code and returns to password-only access',async({page},info)=>{
 const state=await fixture(page,{enabled:true,aal:'aal2'});await page.goto('/app');await openAccount(page);await expect(page.getByText('2FA is enabled',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Remove authenticator',exact:true}).click();await expect(page.getByRole('dialog',{name:'Remove authenticator'})).toContainText('turns off 2FA');
 await page.getByLabel('Authenticator code',{exact:true}).fill('999999');await page.locator('.security-dialog-actions').getByRole('button',{name:'Remove authenticator',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'incorrect or expired'})).toBeVisible();expect(state.factors).toHaveLength(1);
 await page.getByLabel('Authenticator code',{exact:true}).fill('123456');await page.locator('.security-dialog-actions').getByRole('button',{name:'Remove authenticator',exact:true}).click();await expect(page.getByText('2FA is not enabled',{exact:true})).toBeVisible();expect(state.factors).toHaveLength(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`test-results/security15-account-${info.project.name}.png`});
});
test('password recovery also requires MFA before accepting a new password',async({page})=>{
 const state=await fixture(page,{enabled:true});await page.goto('/app?type=recovery');await expect(page.getByRole('heading',{name:'Two-factor authentication',exact:true})).toBeVisible();await expect(page.getByLabel('New password',{exact:true})).toHaveCount(0);expect(state.data).toEqual([]);
 await page.getByLabel('Authenticator code',{exact:true}).fill('123456');await page.getByRole('button',{name:'Verify and continue',exact:true}).click();await expect(page.getByRole('heading',{name:'Choose a new password',exact:true})).toBeVisible();expect(state.data).toEqual([]);
 await page.getByLabel('New password',{exact:true}).fill('Synthetic-local-password-15');await page.getByRole('button',{name:'Save password',exact:true}).click();await expect(page.locator('.app')).toBeVisible();
});
test('email change waits for confirmation and other-session logout keeps the current session',async({page})=>{
 const state=await fixture(page);await page.goto('/app');await openAccount(page);
 await page.getByRole('button',{name:'Change email',exact:true}).click();await page.getByLabel('New email address',{exact:true}).fill('changed-fixture@onyx.invalid');await page.getByRole('button',{name:'Send confirmation',exact:true}).click();
 await expect(page.locator('.account-fields')).toContainText('security-fixture@onyx.invalid');expect(state.auth.some(r=>r.method==='PUT'&&r.body.email==='changed-fixture@onyx.invalid')).toBe(true);
 await page.locator('.security-action').getByRole('button',{name:'Sign out other sessions',exact:true}).click();await page.locator('.security-dialog-actions').getByRole('button',{name:'Sign out other sessions',exact:true}).click();
 await expect(page.locator('.security-form')).toHaveCount(0);await expect(page.locator('.app')).toBeVisible();expect(state.auth.some(r=>r.path.includes('/logout?scope=others'))).toBe(true);expect(state.data).toContain('/rest/v1/push_subscriptions');
});
test('queue cancellation does not execute a previous account’s pending writes',async({page})=>{
 await page.goto('/?ui-e2e');const result=await page.evaluate(async()=>{
  const {enqueue,resetQueue}=await import('/src/backend/queue.ts');let finish!:(result:{data:null;error:null})=>void,writes=0,callbacks=0;
  const first=enqueue(()=>new Promise(resolve=>{finish=resolve;}),{onData:()=>callbacks++});await Promise.resolve();
  const second=enqueue(async()=>{writes++;return {data:null,error:null};});resetQueue();finish({data:null,error:null});await Promise.all([first,second]);return {writes,callbacks};
 });expect(result).toEqual({writes:0,callbacks:0});
});
test('password sign-in cannot skip the second factor',async({page})=>{
 const state=await fixture(page,{enabled:true,stored:false});await page.goto('/app');await page.getByLabel('Email',{exact:true}).fill('security-fixture@onyx.invalid');await page.getByLabel('Password',{exact:true}).fill('Synthetic-local-password-15');await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('heading',{name:'Two-factor authentication',exact:true})).toBeVisible();expect(state.data).toEqual([]);
});
test('a backup authenticator stays selected after returning from another app',async({page})=>{
 const state=await fixture(page,{enabled:true});const backup='15151515-1515-4151-8151-151515151512';state.factors.push(factor(backup,'Backup phone'));await page.goto('/app');await expect(page.getByRole('combobox',{name:'Authenticator',exact:true})).toBeVisible();await page.getByRole('combobox',{name:'Authenticator',exact:true}).click();await page.getByRole('option',{name:'Backup phone',exact:true}).click();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect.poll(()=>state.auth.filter(r=>r.path==='/auth/v1/user').length).toBeGreaterThan(1);await expect(page.getByRole('combobox',{name:'Authenticator',exact:true})).toContainText('Backup phone');
 await page.getByLabel('Authenticator code',{exact:true}).fill('123456');await page.getByRole('button',{name:'Verify and continue',exact:true}).click();await expect(page.locator('.app')).toBeVisible();expect(state.auth.some(r=>r.path.includes(backup+'/verify'))).toBe(true);
});
test('a revoked session closes private UI when the server rejects a queued action',async({page})=>{
 const state=await fixture(page);await page.goto('/app');await openAccount(page);
 await page.locator('.account-field').filter({hasText:'Display name'}).getByRole('button',{name:'Edit',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Display name',exact:true});await dialog.getByRole('textbox').fill('Synthetic rejected change');state.revoked=true;await dialog.getByRole('button',{name:'Save',exact:true}).click();
 await expect(page.locator('.app')).toHaveCount(0);await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();await expect(page.getByRole('status').filter({hasText:'Your session has expired'})).toBeVisible();
});
