import{authEntryFixture,chooseBirthDate}from'./auth-entry-fixture';
import {test,expect,type Page} from '@playwright/test';
const id='00000000-0000-4000-8000-000000000016',peer='00000000-0000-4000-8000-000000000017',otherGuest='00000000-0000-4000-8000-000000000018';
const server='16161616-1616-4161-8161-161616161601',textChannel='16161616-1616-4161-8161-161616161602',voiceChannel='16161616-1616-4161-8161-161616161604';
const now=new Date().toISOString();
async function fixture(page:Page,{stored=false,verified=false,pendingEmail=''}={}){
 const state={nativeGuest:!verified,guest:true,name:'Guest Finch',email:verified?'guest-fixture@onyx.invalid':'',pendingEmail,verified,passwordSet:false,username:'guest.synthetic_16',messages:[] as any[],auth:[] as any[],writes:[] as any[],failCode:false,unavailable:false};
 const user=()=>({id,aud:'authenticated',role:'authenticated',email:state.email,new_email:state.pendingEmail,email_confirmed_at:state.verified?now:undefined,is_anonymous:state.nativeGuest,created_at:now,app_metadata:{provider:'anonymous',providers:['anonymous']},user_metadata:{locale:'en'},factors:[]});
 const session=()=>{const b=(v:any)=>Buffer.from(JSON.stringify(v)).toString('base64url');return {access_token:b({alg:'HS256'})+'.'+b({sub:id,role:'authenticated',aud:'authenticated',is_anonymous:state.nativeGuest,aal:'aal1',session_id:'16161616-1616-4161-8161-161616161699',exp:Math.floor(Date.now()/1000)+3600})+'.'+Buffer.from('synthetic-local-signature').toString('base64url'),refresh_token:'synthetic-guest-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:user()};};
 if(stored)await page.addInitScript(value=>localStorage.setItem('onyx-auth',JSON.stringify(value)),session());
 await page.route('**/auth/v1/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname.replace('/auth/v1',''),body=req.postData()?req.postDataJSON():{};state.auth.push({method:req.method(),path,body});
  if(path==='/signup'){if(state.unavailable)return route.fulfill({status:422,headers:{'X-Supabase-Api-Version':'2024-01-01'},json:{code:'anonymous_provider_disabled',msg:'Disabled local fixture'}});state.name=body.data?.display_name??'Guest';return route.fulfill({json:session()});}
  if(path==='/user'&&req.method()==='GET')return route.fulfill({json:user()});
  if(path==='/user'&&req.method()==='PUT'){
   if(body.email)state.pendingEmail=body.email;
   if(body.password){if(!state.verified)throw Error('Password was sent before email verification');state.passwordSet=true;}
   return route.fulfill({json:user()});
  }
  if(path==='/verify'){
   if(state.failCode||body.type!=='email_change'||(body.token!=='12345678'&&body.token_hash!=='synthetic-guest-email-link'))return route.fulfill({status:422,headers:{'X-Supabase-Api-Version':'2024-01-01'},json:{code:'otp_expired',msg:'Expired synthetic code'}});
   state.nativeGuest=false;state.verified=true;state.email=state.pendingEmail;state.pendingEmail='';return route.fulfill({json:session()});
  }
  if(path==='/token')return route.fulfill({json:session()});
  if(path==='/logout')return route.fulfill({status:204});
  return route.fulfill({status:400,json:{code:'unexpected_local_auth_request'}});
 });
 const profile=(uid:string,name:string,guest:boolean)=>({id:uid,username:uid===id?state.username:guest?'guest.other_16':'peer',display_name:name,avatar_color:'#0fb988',status:'online',badges:[],member_number:guest?null:900000016,created_at:now,is_guest:guest});
 await page.route('**/rest/v1/**',async route=>{
  const req=route.request(),url=new URL(req.url()),table=url.pathname.split('/').at(-1),body=req.postData()?req.postDataJSON():{};
  if(req.method()!=='GET')state.writes.push({method:req.method(),table,body});
  if(table==='account_status')return route.fulfill({json:{admin:false,suspension:null}});
  if(table==='ensure_official_server')return route.fulfill({json:server});
  if(table==='username_available')return route.fulfill({json:body.p_username!=='taken'});
  if(table==='complete_guest_registration'){expect(state.verified&&state.passwordSet).toBe(true);state.guest=false;state.username=body.p_username;return route.fulfill({json:null});}
  if(table==='profiles')return route.fulfill({json:[profile(id,state.name,state.guest),profile(peer,'Registered friend',false),profile(otherGuest,'Another guest',true)]});
  if(table==='servers')return route.fulfill({json:[{id:server,name:'ONYX Community',owner_id:peer,icon_color:'#0fb988',created_at:now,is_official:true}]});
  if(table==='roles')return route.fulfill({json:[{id:'16161616-1616-4161-8161-161616161605',server_id:server,name:'@everyone',is_default:true,position:0,permissions:['viewChannel','readHistory','sendMessages','connect','speak','video','screenShare']}]});
  if(table==='server_members')return route.fulfill({json:[id,peer,otherGuest].map(user_id=>({server_id:server,user_id,joined_at:now}))});
  if(table==='channels')return route.fulfill({json:[{id:textChannel,server_id:server,name:'general',type:'text',position:0},{id:voiceChannel,server_id:server,name:'Lobby',type:'voice',position:1}]});
  if(table==='recent_messages')return route.fulfill({json:state.messages});
  if(table==='messages'){
   if(req.method()==='POST'){const row=Array.isArray(body)?body[0]:body;state.messages.push({...row,created_at:now,type:'default',attachments:row.attachments??[]});}
   return route.fulfill({json:state.messages});
  }
  if(table==='join_server_by_invite')return route.fulfill({json:server});
  return route.fulfill({json:[]});
 });
 await page.route('**/functions/v1/**',route=>route.fulfill({status:503,json:{error:'synthetic_no_media_server'}}));
 await authEntryFixture(page);return state;
}
async function navigation(page:Page){const back=page.locator('.view-header').getByRole('button',{name:/^Back( to navigation)?$/});if(await back.isVisible())await back.click();}
async function settings(page:Page){const gear=page.getByRole('button',{name:'User settings',exact:true});if(!await gear.isVisible())await navigation(page);await gear.click();await expect(page.locator('.settings')).toBeVisible();}
test('native guest data loading uses the white ONYX screen and hands off as soon as data arrives',async({page},info)=>{
 await fixture(page);
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/rest/v1/profiles*',async route=>{await gate;await route.fallback();});
 await page.goto('/app?guest=1');await page.getByLabel('Display name',{exact:true}).fill('Guest Finch');await chooseBirthDate(page);await page.getByRole('button',{name:'Continue as guest',exact:true}).click();
 await expect(page.locator('.app-loading')).toBeVisible();await expect(page.locator('.app-loading img')).toHaveAttribute('src',/onyx-mark-256\.webp$/);await expect(page.locator('.auth-card')).toHaveCount(0);
 await page.screenshot({path:`test-results/touch18-native-loading-${info.project.name}.png`});release();await expect(page.locator('.app')).toBeVisible();await expect(page.locator('.app-loading')).toHaveCount(0);
 await navigation(page);await page.locator('.rail-home').click();await page.locator('.nav-list').getByRole('button',{name:'OnyxServices',exact:true}).click();await expect(page.locator('.shop-view')).toBeVisible();await expect(page.locator('.guest-upgrade')).toHaveCount(0);
});
test('a name starts a native guest session and opens the real community chat',async({page},info)=>{
 const state=await fixture(page);await page.goto('/app?guest=1');await page.getByLabel('Display name',{exact:true}).fill('Guest Finch');await chooseBirthDate(page);await page.getByRole('button',{name:'Continue as guest',exact:true}).click();
 await expect(page.locator('.app')).toBeVisible();await expect(page.locator('.guest-ribbon')).toBeVisible();await expect(page.locator('.view-header')).toContainText('general');
 expect(state.auth.filter(r=>r.path==='/signup')).toHaveLength(1);expect(state.auth.find(r=>r.path==='/signup').body.email).toBeUndefined();
 const input=page.locator('.composer-input');await input.fill('Hello from my guest session');await input.press('Enter');await expect.poll(()=>state.messages.some(m=>m.content==='Hello from my guest session'&&m.author_id===id)).toBe(true);
 await expect(page.getByRole('log',{name:'Messages'}).locator('.guest-tag').first()).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`test-results/guest16-chat-${info.project.name}.png`});
});
test('guests get account prompts for profiles and files while audio settings remain available',async({page},info)=>{
 const state=await fixture(page,{stored:true});await page.goto('/app');await expect(page.locator('.guest-ribbon')).toBeVisible();
 await page.getByRole('button',{name:'Upload a file',exact:true}).click();await expect(page.getByRole('dialog',{name:'Make ONYX yours.',exact:true})).toBeVisible();await page.getByRole('button',{name:'Keep chatting as a guest',exact:true}).click();
 await settings(page);await expect(page.getByRole('heading',{name:'Voice & Video',exact:true})).toBeVisible();const profile=page.locator('.settings-nav').getByRole('button',{name:'Profile Studio',exact:false});if(!await profile.isVisible())await page.locator('.settings-mobile-head').getByRole('button',{name:'Back',exact:true}).click();await profile.click();
 await expect(page.getByRole('dialog',{name:'Make your profile yours.',exact:true})).toBeVisible();expect(state.auth.some(r=>r.path==='/signup')).toBe(false);expect(state.writes.some(r=>r.table==='profiles')).toBe(false);
 await page.screenshot({path:`test-results/guest16-upgrade-${info.project.name}.png`});
});
test('creating an account confirms email first and keeps the same messages and membership',async({page})=>{
 const state=await fixture(page,{stored:true});state.messages.push({id:'16161616-1616-4161-8161-161616161610',channel_id:textChannel,author_id:id,type:'default',content:'My guest history',created_at:now,attachments:[]});await page.goto('/app');await page.locator('.guest-ribbon').getByRole('button',{name:'Create free account',exact:true}).click();
 await page.getByLabel('Email',{exact:true}).fill('guest-fixture@onyx.invalid');await page.getByRole('button',{name:'Send confirmation',exact:true}).click();await expect(page.getByRole('heading',{name:'Check your inbox',exact:true})).toBeVisible();expect(state.passwordSet).toBe(false);expect(state.writes.some(r=>r.table==='complete_guest_registration')).toBe(false);
 await expect(page.getByRole('dialog')).toContainText('or confirm using the button');expect(state.auth.find(request=>request.path==='/user'&&request.body.email)?.body.data.locale).toBe('en');
 await page.getByLabel('Code from the email',{exact:true}).fill('99999999');await page.getByRole('button',{name:'Confirm email',exact:true}).click();await expect(page.getByRole('alert')).toBeVisible();expect(state.guest).toBe(true);
 await page.getByLabel('Code from the email',{exact:true}).fill('12345678');await page.getByRole('button',{name:'Confirm email',exact:true}).click();await expect(page.getByRole('heading',{name:'Make it your account',exact:true})).toBeVisible();
 await page.getByLabel('Username',{exact:true}).fill('luca_member');await page.getByLabel('Password',{exact:true}).fill('Synthetic-guest-password-16');await page.getByRole('button',{name:'Create free account',exact:true}).last().click();
 await expect(page.locator('.guest-ribbon')).toHaveCount(0);expect(state.guest).toBe(false);expect(state.username).toBe('luca_member');expect(state.messages[0].author_id).toBe(id);await expect(page.getByRole('log',{name:'Messages'})).toContainText('My guest history');expect(state.auth.filter(r=>r.path==='/signup')).toHaveLength(0);
});
test('a verified guest can resume registration after reloading',async({page})=>{
 const state=await fixture(page,{stored:true,verified:true});await page.goto('/app');await page.locator('.guest-ribbon').getByRole('button',{name:'Create free account',exact:true}).click();await expect(page.getByRole('heading',{name:'Make it your account',exact:true})).toBeVisible();await page.getByLabel('Username',{exact:true}).fill('taken');await page.getByLabel('Password',{exact:true}).fill('Synthetic-guest-password-16');await page.getByRole('button',{name:'Create free account',exact:true}).last().click();await expect(page.getByRole('alert')).toContainText('unavailable');expect(state.guest).toBe(true);expect(state.passwordSet).toBe(false);
});
test('a pending guest confirmation resumes after closing and reloading without resending',async({page})=>{
 const state=await fixture(page,{stored:true,pendingEmail:'guest-fixture@onyx.invalid'});await page.goto('/app');await page.locator('.guest-ribbon button').click();await expect(page.getByRole('heading',{name:'Check your inbox',exact:true})).toBeVisible();await expect(page.getByRole('dialog')).toContainText('guest-fixture@onyx.invalid');await page.getByRole('button',{name:'Keep chatting as a guest',exact:true}).click();await page.reload();await page.locator('.guest-ribbon button').click();await expect(page.getByLabel('Code from the email',{exact:true})).toBeVisible();expect(state.auth.filter(request=>request.method==='PUT'&&request.body.email)).toHaveLength(0);expect(state.passwordSet).toBe(false);
});
test('a guest can confirm by email link and resume the same profile in a new browser session',async({page})=>{
 const state=await fixture(page,{pendingEmail:'guest-fixture@onyx.invalid'});await page.goto('/app?token_hash=synthetic-guest-email-link&type=email_change');await expect(page.locator('.guest-ribbon')).toBeVisible();await page.locator('.guest-ribbon button').click();await expect(page.getByRole('heading',{name:'Make it your account',exact:true})).toBeVisible();expect(state.verified).toBe(true);expect(state.guest).toBe(true);expect(state.passwordSet).toBe(false);expect(state.auth.find(request=>request.path==='/verify').body).toMatchObject({token_hash:'synthetic-guest-email-link',type:'email_change'});await expect(page.getByRole('dialog')).toContainText('guest-fixture@onyx.invalid');expect(new URL(page.url()).searchParams.has('token_hash')).toBe(false);
});
test('confirmation opened on another device does not require entering a code again',async({page})=>{
 const state=await fixture(page,{stored:true,pendingEmail:'guest-fixture@onyx.invalid'});await page.goto('/app');await page.locator('.guest-ribbon button').click();await page.getByRole('button',{name:'I opened the link – continue',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Not confirmed yet');expect(state.guest).toBe(true);state.nativeGuest=false;state.verified=true;state.email=state.pendingEmail;state.pendingEmail='';await page.getByRole('button',{name:'I opened the link – continue',exact:true}).click();await expect(page.getByRole('heading',{name:'Make it your account',exact:true})).toBeVisible();expect(state.auth.filter(request=>request.path==='/verify')).toHaveLength(0);expect(state.passwordSet).toBe(false);
});
test('a disabled provider returns an honest error without loading private app data',async({page})=>{
 const state=await fixture(page);state.unavailable=true;await page.goto('/app?guest=1');await page.getByLabel('Display name',{exact:true}).fill('Guest');await chooseBirthDate(page);await page.getByRole('button',{name:'Continue as guest',exact:true}).click();await expect(page.getByRole('alert')).toContainText('not available yet');await expect(page.locator('.app')).toHaveCount(0);expect(state.writes.some(write=>write.table==='ensure_official_server')).toBe(false);
});
test('ending a guest session requires an explicit confirmation and revokes only this session',async({page})=>{
 const state=await fixture(page,{stored:true});await page.goto('/app');await expect(page.locator('.guest-ribbon')).toBeVisible();await navigation(page);await page.getByRole('button',{name:'Your profile and status',exact:true}).click();await page.getByRole('button',{name:'End guest session',exact:true}).click();await expect(page.getByRole('dialog',{name:'End guest session',exact:true})).toContainText('cannot return');expect(state.auth.some(r=>r.path==='/logout')).toBe(false);await page.getByRole('dialog').getByRole('button',{name:'End guest session',exact:true}).click();await expect(page.locator('.app')).toHaveCount(0);expect(state.auth.some(r=>r.path==='/logout')).toBe(true);
});
