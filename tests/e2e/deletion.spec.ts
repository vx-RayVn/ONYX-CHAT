import {test,expect,type Page} from '@playwright/test';
import {authEntryFixture} from './auth-entry-fixture';
const id='00000000-0040-4000-8000-000000000040',factor='00000000-0040-4000-8000-000000000041',stamp=new Date().toISOString();
async function fixture(page:Page,{mfa=false,email=false,guest=false}={}){
 const state={deleted:0,reject:false,hold:false,release:null as (()=>void)|null,mainLogouts:0,auth:[] as any[]};
 const user=()=>({id,aud:'authenticated',role:'authenticated',email:guest?'':'deletion-fixture@example.invalid',is_anonymous:guest,email_confirmed_at:guest?undefined:stamp,created_at:stamp,app_metadata:{provider:guest?'anonymous':'email'},user_metadata:{locale:'en'},factors:mfa?[{id:factor,factor_type:'totp',friendly_name:'Synthetic authenticator',status:'verified',created_at:stamp}]:[]});
 const session=(fresh=false,second=false)=>{const now=Math.floor(Date.now()/1000),method=guest?'anonymous':email?'otp':'password',enc=(v:any)=>Buffer.from(JSON.stringify(v)).toString('base64url');const claims={sub:id,session_id:id,role:'authenticated',aud:'authenticated',iss:'http://127.0.0.1:5173/auth/v1',aal:mfa&&(!fresh||second)?'aal2':'aal1',is_anonymous:guest,iat:now,exp:now+3600,amr:[{method,timestamp:now-(fresh?1:3600)},...(mfa&&(!fresh||second)?[{method:'totp',timestamp:now-(fresh?0:3599)}]:[])]};return {access_token:enc({alg:'HS256'})+'.'+enc(claims)+'.'+enc('synthetic'),refresh_token:fresh?'synthetic-temporary-refresh':'synthetic-main-refresh',token_type:'bearer',expires_in:3600,expires_at:now+3600,user:user()};};
 const initial=session();await page.addInitScript(value=>localStorage.setItem('onyx-auth',JSON.stringify(value)),initial);
 await page.route('**/auth/v1/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname.replace('/auth/v1',''),body=req.postData()?req.postDataJSON():{};state.auth.push({path,body});
  if(path==='/user'&&req.method()==='GET')return route.fulfill({json:user()});
  if(path==='/token')return body.password==='wrong'?route.fulfill({status:400,json:{code:'invalid_credentials',msg:'Invalid login credentials'}}):route.fulfill({json:session(true)});
  if(path==='/otp')return route.fulfill({json:{}});
  if(path==='/verify')return body.token==='12345678'?route.fulfill({json:session(true)}):route.fulfill({status:422,json:{code:'otp_expired',msg:'Invalid code'}});
  if(path.endsWith('/challenge'))return route.fulfill({json:{id:factor,type:'totp',expires_at:Math.floor(Date.now()/1000)+300}});
  if(path.endsWith('/verify'))return body.code==='123456'?route.fulfill({json:session(true,true)}):route.fulfill({status:422,headers:{'X-Supabase-Api-Version':'2024-01-01'},json:{code:'mfa_verification_failed',msg:'Invalid code'}});
  if(path==='/logout'){if(req.headers().authorization==='Bearer '+initial.access_token)state.mainLogouts++;return route.fulfill({status:204});}
  return route.fulfill({status:400,json:{code:'unexpected_synthetic_request'}});
 });
 await page.route('**/rest/v1/**',async route=>{const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/rpc/account_status'))return route.fulfill({json:{admin:false,suspension:null}});
  if(path.endsWith('/rpc/ensure_official_server'))return route.fulfill({json:null});
  if(path.endsWith('/profiles'))return route.fulfill({json:[{id,username:guest?'guest.synthetic40':'synthetic40',display_name:'Synthetic deletion user',is_guest:guest,avatar_color:'#0fb988',status:'online',badges:[],created_at:stamp,member_number:900000040}]});
  return route.fulfill({json:[]});
 });
 await page.route('**/functions/v1/delete-account',async route=>{
  state.deleted++;const token=route.request().headers().authorization?.split(' ')[1],claims=JSON.parse(Buffer.from(token!.split('.')[1],'base64url').toString());
  if(!guest){expect(Math.floor(Date.now()/1000)-claims.amr[0].timestamp).toBeLessThan(600);if(mfa)expect(claims.amr.some((e:any)=>e.method==='totp'&&Math.floor(Date.now()/1000)-e.timestamp<600)).toBe(true);}
  if(state.hold)await new Promise<void>(resolve=>{state.release=resolve;});
  return state.reject?route.fulfill({status:403,json:{error:'reauthentication_required'}}):route.fulfill({json:{deleted:true,files:0}});
 });
 await page.route('https://**',route=>route.fulfill({status:204}));await authEntryFixture(page);
 await page.goto('/app');await expect(page.locator('.app')).toBeVisible();
 await page.evaluate(async()=>{const {useUI}=await import('/src/store/ui.ts');useUI.getState().openModal({type:'deleteAccount'});});
 const modal=page.getByRole('dialog',{name:'Delete account',exact:true});await expect(modal).toBeVisible();
 const confirm=modal.getByLabel('Type your username to confirm',{exact:true});await confirm.fill(guest?'guest.synthetic40':'synthetic40');
 return {state,modal,initial};
}
test('deletion requires a fresh password while the main session stays open',async({page},info)=>{
 const {state,modal,initial}=await fixture(page);const remove=modal.getByRole('button',{name:'Delete account permanently',exact:true});await expect(remove).toBeDisabled();
 await modal.getByLabel('Password',{exact:true}).fill('wrong');await modal.getByRole('button',{name:'Confirm sign-in',exact:true}).click();await expect(modal.getByText('Email or password is wrong.',{exact:true})).toBeVisible();expect(state.deleted).toBe(0);
 await modal.getByLabel('Password',{exact:true}).fill('synthetic-password');await modal.getByRole('button',{name:'Confirm sign-in',exact:true}).click();await expect(modal.getByText('Sign-in confirmed. Now confirm your username below.',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('onyx-auth')!).access_token)).toBe(initial.access_token);await expect(remove).toBeEnabled();
 expect(await modal.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);expect(await modal.locator('.delete-account-reauth').evaluate(e=>getComputedStyle(e).display)).toBe('flex');await page.screenshot({path:`test-results/deletion-password-${info.project.name}.png`});
 await remove.click();await expect(modal).toHaveCount(0);expect(state.deleted).toBe(1);
});
test('deletion with MFA requires a fresh authenticator code after the password',async({page})=>{
 const {state,modal}=await fixture(page,{mfa:true});await modal.getByLabel('Password',{exact:true}).fill('synthetic-password');await modal.getByRole('button',{name:'Confirm sign-in',exact:true}).click();await expect(modal.getByLabel('Authenticator code',{exact:true})).toBeVisible();await expect(modal.getByRole('button',{name:'Delete account permanently',exact:true})).toBeDisabled();
 await modal.getByLabel('Authenticator code',{exact:true}).fill('999999');await modal.getByRole('button',{name:'Confirm sign-in',exact:true}).click();await expect(modal.getByText('That code is incorrect or expired. Try a new code from your authenticator.',{exact:true})).toBeVisible();expect(state.deleted).toBe(0);
 await modal.getByLabel('Authenticator code',{exact:true}).fill('123456');await modal.getByRole('button',{name:'Confirm sign-in',exact:true}).click();await expect(modal.getByRole('button',{name:'Delete account permanently',exact:true})).toBeEnabled();await modal.getByRole('button',{name:'Delete account permanently',exact:true}).click();expect(state.deleted).toBe(1);
});
test('email sign-in confirms a code in the dialog without creating another account',async({page})=>{
 const {state,modal}=await fixture(page,{email:true});await modal.getByRole('button',{name:'Send confirmation code',exact:true}).click();await expect(modal.getByLabel('Email code',{exact:true})).toBeVisible();expect(state.auth.find(r=>r.path==='/otp').body.create_user).toBe(false);
 await modal.getByLabel('Email code',{exact:true}).fill('12345678');await modal.getByRole('button',{name:'Confirm sign-in',exact:true}).click();await expect(modal.getByRole('button',{name:'Delete account permanently',exact:true})).toBeEnabled();await modal.getByRole('button',{name:'Delete account permanently',exact:true}).click();expect(state.deleted).toBe(1);
});
test('guest deletion needs the username and does not ask for a password',async({page})=>{
 const {state,modal}=await fixture(page,{guest:true});await expect(modal.getByText('Guest profiles have no password. Confirm your username to delete this guest profile.',{exact:true})).toBeVisible();await expect(modal.getByLabel('Password',{exact:true})).toHaveCount(0);await modal.getByRole('button',{name:'Delete account permanently',exact:true}).click();expect(state.deleted).toBe(1);
});
test('server reauthentication expiry returns to confirmation without silently retrying deletion',async({page})=>{
 const {state,modal}=await fixture(page);state.reject=true;await modal.getByLabel('Password',{exact:true}).fill('synthetic-password');await modal.getByRole('button',{name:'Confirm sign-in',exact:true}).click();await expect(modal.getByRole('button',{name:'Delete account permanently',exact:true})).toBeEnabled();await modal.getByRole('button',{name:'Delete account permanently',exact:true}).click();await expect(modal.getByText('Confirm your sign-in again before deleting your account.',{exact:true})).toBeVisible();await expect(modal.getByLabel('Password',{exact:true})).toBeVisible();expect(state.deleted).toBe(1);
});
test('a different account opened during deletion is never signed out by the old response',async({page})=>{
 const {state,modal,initial}=await fixture(page);await modal.getByLabel('Password',{exact:true}).fill('synthetic-password');await modal.getByRole('button',{name:'Confirm sign-in',exact:true}).click();await expect(modal.getByRole('button',{name:'Delete account permanently',exact:true})).toBeEnabled();state.hold=true;await modal.getByRole('button',{name:'Delete account permanently',exact:true}).click();await expect.poll(()=>!!state.release).toBe(true);
 await page.evaluate(async()=>{const {useAuth}=await import('/src/backend/auth.ts');const current=useAuth.getState().session!;useAuth.setState({session:{...current,user:{...current.user,id:'00000000-0040-4000-8000-000000000099'}}});});state.release!();
 await expect(modal.getByText('The active account changed in another tab. Please try again.',{exact:true})).toBeVisible();expect(state.mainLogouts).toBe(0);expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('onyx-auth')!).access_token)).toBe(initial.access_token);
});
