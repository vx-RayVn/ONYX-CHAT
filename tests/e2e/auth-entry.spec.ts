import{test,expect,type Page}from'@playwright/test';
import{authEntryFixture,chooseBirthDate}from'./auth-entry-fixture';
async function fixture(page:Page){
 const requests:{path:string;body:any}[]=[];
 await page.route('**/auth/v1/**',async route=>{const path=new URL(route.request().url()).pathname,body=route.request().postDataJSON();requests.push({path,body});
  if(path.endsWith('/signup'))return route.fulfill({json:{id:'20202020-2020-4020-8020-202020202020',aud:'authenticated',email:body.email,identities:[]}});
  if(path.endsWith('/recover')||path.endsWith('/otp')||path.endsWith('/resend'))return route.fulfill({json:{}});
  return route.fulfill({status:400,headers:{'X-Supabase-Api-Version':'2024-01-01'},json:{code:'invalid_credentials',msg:'Invalid login credentials'}});
 });
 await page.route('**/rest/v1/rpc/username_available',r=>r.fulfill({json:true}));
 const security=await authEntryFixture(page);return{requests,security};
}
async function signin(page:Page){await page.getByLabel('Email',{exact:true}).fill('entry-fixture@onyx.invalid');await page.getByLabel('Password',{exact:true}).fill('Synthetic-test-password');}
async function register(page:Page){await page.goto('/signup');await page.getByLabel('Email',{exact:true}).fill('entry-fixture@onyx.invalid');await page.getByLabel('Username',{exact:true}).fill('entry_fixture20');await page.getByLabel('Display name',{exact:true}).fill('Entry fixture');await page.getByLabel('Password',{exact:true}).fill('Synthetic-test-password');}
test('password sign-in obtains a new proof for every attempt and supports password visibility',async({page})=>{
 const{requests}=await fixture(page);await page.goto('/login');await signin(page);await page.getByRole('button',{name:'Show password',exact:true}).click();await expect(page.getByLabel('Password',{exact:true})).toHaveAttribute('type','text');await page.getByRole('button',{name:'Hide password',exact:true}).click();
 for(let i=0;i<2;i++){await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Email or password is wrong.');}
 expect(requests).toHaveLength(2);const proofs=requests.map(r=>r.body.gotrue_meta_security?.captcha_token);expect(proofs.every(Boolean)).toBe(true);expect(new Set(proofs).size).toBe(2);
});
test('missing CAPTCHA configuration fails closed and the user can retry',async({page})=>{
 const{requests,security}=await fixture(page);security.available=false;await page.goto('/login');await signin(page);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('alert')).toContainText('The security check could not be completed.');expect(requests).toHaveLength(0);
 security.available=true;await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect.poll(()=>requests.length).toBe(1);
});
test('expired or failed CAPTCHA never sends credentials',async({page})=>{
 const{requests}=await fixture(page);await page.goto('/login');await signin(page);
 for(const mode of ['expire','fail']){await page.evaluate(mode=>(window as any).syntheticChallenge20=mode,mode);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('alert')).toContainText('The security check could not be completed.');}
 expect(requests).toHaveLength(0);
});
test('changing forms cancels an active challenge and allows a fresh request',async({page})=>{
 const{requests}=await fixture(page);await page.goto('/login');await signin(page);await page.evaluate(()=>(window as any).syntheticChallenge20='hold');await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.locator('.auth-form .btn').first()).toBeDisabled();await page.getByRole('tab',{name:'Register',exact:true}).click();await page.getByRole('tab',{name:'Sign in',exact:true}).click();await page.evaluate(()=>(window as any).syntheticChallenge20='pass');await signin(page);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect.poll(()=>requests.length).toBe(1);
});
test('regular registration uses an editable IP-country hint, a real date and proof',async({page})=>{
 const{requests}=await fixture(page);await register(page);await expect(page.getByRole('combobox',{name:'Country',exact:true})).toContainText('Germany');await chooseBirthDate(page);
 await page.getByRole('combobox',{name:'Country',exact:true}).click();await page.getByRole('option',{name:'France',exact:true}).click();await page.getByRole('button',{name:'Create account',exact:true}).click();await expect(page.getByRole('heading',{name:'Check your inbox',exact:true})).toBeVisible();
 expect(requests[0].body.data).toMatchObject({country:'FR',date_of_birth:'2000-01-01'});expect(requests[0].body.gotrue_meta_security.captcha_token).toBeTruthy();
});
test('under-sixteen registration and guest entry show an explicit error before native Auth',async({page},info)=>{
 const{requests}=await fixture(page);await register(page);await chooseBirthDate(page,{year:String(new Date().getUTCFullYear()-15)});await expect(page.getByRole('alert')).toHaveCount(0);const registerTop=await page.getByRole('button',{name:'Create account',exact:true}).evaluate(node=>node.getBoundingClientRect().top-node.closest('form')!.getBoundingClientRect().top);await page.getByRole('button',{name:'Create account',exact:true}).click();await expect(page.getByRole('alert')).toHaveText('ONYX is for ages 16 and up.');await expect(page.locator('.auth-birthday')).toHaveAttribute('aria-invalid','true');expect(Math.abs((await page.getByRole('button',{name:'Create account',exact:true}).evaluate(node=>node.getBoundingClientRect().top-node.closest('form')!.getBoundingClientRect().top))-registerTop)).toBeLessThan(1);expect(requests).toHaveLength(0);
 await page.getByRole('button',{name:'Continue as guest',exact:true}).click();await page.getByLabel('Display name',{exact:true}).fill('Guest fixture');await chooseBirthDate(page,{year:String(new Date().getUTCFullYear()-15)});await expect(page.getByRole('alert')).toHaveCount(0);const guestTop=await page.getByRole('button',{name:'Continue as guest',exact:true}).evaluate(node=>node.getBoundingClientRect().top-node.closest('form')!.getBoundingClientRect().top);await page.getByRole('button',{name:'Continue as guest',exact:true}).click();await expect(page.getByRole('alert')).toHaveText('ONYX is for ages 16 and up.');await expect(page.getByRole('alert')).toHaveCSS('color','rgb(255, 125, 139)');await expect(page.locator('.auth-birthday')).toHaveAttribute('aria-invalid','true');expect(Math.abs((await page.getByRole('button',{name:'Continue as guest',exact:true}).evaluate(node=>node.getBoundingClientRect().top-node.closest('form')!.getBoundingClientRect().top))-guestTop)).toBeLessThan(1);expect(requests).toHaveLength(0);await expect(page.getByRole('combobox',{name:'Country',exact:true})).toHaveCount(0);await page.screenshot({path:`test-results/auth21-underage-${info.project.name}.png`,fullPage:true});
 await page.getByRole('combobox',{name:'Year',exact:true}).click();await page.getByRole('option',{name:'2000',exact:true}).click();await expect(page.getByRole('alert')).toHaveCount(0);await expect(page.locator('.auth-birthday')).not.toHaveAttribute('aria-invalid');expect(requests).toHaveLength(0);
});

test('guest entry explains missing and impossible birthdays and clears feedback after correction',async({page})=>{
 const{requests}=await fixture(page);await page.goto('/app?guest=1');await page.getByLabel('Display name',{exact:true}).fill('Guest fixture');await page.getByRole('button',{name:'Continue as guest',exact:true}).click();await expect(page.getByRole('alert')).toHaveText('Enter your date of birth.');expect(requests).toHaveLength(0);
 await chooseBirthDate(page,{day:'31',month:'February'});await page.getByRole('button',{name:'Continue as guest',exact:true}).click();await expect(page.getByRole('alert')).toHaveText('Choose a valid date of birth.');expect(requests).toHaveLength(0);
 await page.getByRole('combobox',{name:'Day',exact:true}).click();await page.getByRole('option',{name:'1',exact:true}).click();await expect(page.getByRole('alert')).toHaveCount(0);await expect(page.locator('.auth-birthday')).not.toHaveAttribute('aria-invalid');
 await page.getByRole('button',{name:'Continue as guest',exact:true}).click();await expect.poll(()=>requests.length).toBe(1);expect(requests[0].body.data.date_of_birth).toBe('2000-02-01');
});
test('a missing country remains a required, editable ONYX control',async({page})=>{
 const{requests,security}=await fixture(page);security.country='ZZ';await page.addInitScript(()=>Object.defineProperty(navigator,'language',{value:'en'}));await register(page);await chooseBirthDate(page);await expect(page.getByRole('combobox',{name:'Country',exact:true})).toContainText('Choose your country.');await page.getByRole('button',{name:'Create account',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Choose your country.');expect(requests).toHaveLength(0);
});
test('magic link and password-reset mail requests both carry independent CAPTCHA proofs',async({page})=>{
 const{requests}=await fixture(page);await page.goto('/login');await page.getByRole('button',{name:'Email me a sign-in link',exact:true}).click();await page.getByLabel('Email',{exact:true}).fill('entry-fixture@onyx.invalid');await page.getByRole('button',{name:'Send sign-in link',exact:true}).click();await expect(page.getByRole('heading',{name:'Check your inbox',exact:true})).toBeVisible();expect(requests[0].body.gotrue_meta_security.captcha_token).toBeTruthy();expect(requests[0].body.create_user).toBe(false);
 await page.getByRole('button',{name:'Back to sign in',exact:true}).click();await page.getByRole('button',{name:'Forgot your password?',exact:true}).click();await page.getByRole('button',{name:'Send reset link',exact:true}).click();await expect(page.getByRole('heading',{name:'Check your inbox',exact:true})).toBeVisible();expect(requests[1].body.gotrue_meta_security.captcha_token).toBeTruthy();expect(requests[1].body.gotrue_meta_security.captcha_token).not.toBe(requests[0].body.gotrue_meta_security.captcha_token);
});
test('auth fields and custom selectors fit narrow screens and short landscape windows',async({page},info)=>{
 await fixture(page);for(const size of [{width:320,height:740},{width:844,height:390}]){await page.setViewportSize(size);await page.goto('/signup');await expect(page.getByRole('combobox',{name:'Country',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.getByRole('combobox',{name:'Month',exact:true}).click();await expect(page.getByRole('option',{name:'January',exact:true})).toBeVisible();await page.keyboard.press('Escape');await page.getByRole('button',{name:'Create account',exact:true}).scrollIntoViewIfNeeded();}
 await page.setViewportSize({width:390,height:844});await page.goto('/login');await page.screenshot({path:`test-results/auth20-login-${info.project.name}.png`});await page.goto('/signup');await expect(page.getByRole('heading',{name:'Create your account',exact:true})).toBeVisible();await page.screenshot({path:`test-results/auth20-register-${info.project.name}.png`,fullPage:true});
});
test('a late country hint does not overwrite the visitor’s own choice',async({page})=>{
 const{security}=await fixture(page);security.countryDelay=3000;await page.goto('/signup');await page.getByRole('combobox',{name:'Country',exact:true}).click();await page.getByRole('option',{name:'France',exact:true}).click();await page.waitForTimeout(3200);await expect(page.getByRole('combobox',{name:'Country',exact:true})).toContainText('France');
});
test('blocked CAPTCHA script loading fails safely and can be retried',async({page})=>{
 const{requests,security}=await fixture(page);security.scriptFails=true;await page.goto('/login');await signin(page);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('alert')).toContainText('The security check could not be completed.');expect(requests).toHaveLength(0);security.scriptFails=false;await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect.poll(()=>requests.length).toBe(1);
});
test('resending confirmation and continuing after a link never reuse a challenge proof',async({page})=>{
 const{requests}=await fixture(page);await register(page);await chooseBirthDate(page);await page.getByRole('button',{name:'Create account',exact:true}).click();await expect(page.getByRole('heading',{name:'Check your inbox',exact:true})).toBeVisible();await page.clock.install();await page.clock.fastForward(61000);await page.getByRole('button',{name:'Send a new code',exact:true}).click();await expect.poll(()=>requests.length).toBe(2);await page.getByRole('button',{name:'I opened the link – continue',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Not confirmed yet.');expect(requests.map(r=>r.path)).toEqual(['/auth/v1/signup','/auth/v1/resend','/auth/v1/token']);expect(new Set(requests.map(r=>r.body.gotrue_meta_security.captcha_token)).size).toBe(3);
});
test('long selectors stay stable under repeated mouse selection and keyboard input',async({page})=>{
 await fixture(page);await page.goto('/signup');const year=page.getByRole('combobox',{name:'Year',exact:true});
 for(const value of ['2000','2011','1984','2008']){await year.click();await page.getByRole('option',{name:value,exact:true}).click();await expect(year).toContainText(value);await expect(page.getByRole('listbox')).toHaveCount(0);}
 await year.click();await page.keyboard.press('Home');await page.keyboard.type('1990');await expect(page.getByRole('option',{name:'1990',exact:true})).toBeFocused();await page.keyboard.press('Enter');await expect(year).toContainText('1990');
});
test('Arabic selectors use RTL layout and fit a 320-pixel screen',async({page},info)=>{
 await fixture(page);await page.setViewportSize({width:320,height:740});await page.goto('/signup');await expect(page.locator('.auth-card')).toBeVisible();await page.evaluate(async()=>{const{useStore}=await import('/src/store/store.ts');useStore.getState().setSetting('language','ar');});await expect(page.locator('html')).toHaveAttribute('lang','ar');await page.locator('.auth-card .onyx-select-trigger').last().click();await expect(page.getByRole('listbox')).toHaveAttribute('dir','rtl');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`test-results/auth20-rtl-${info.project.name}.png`});
});
test('the login follows a touch keyboard viewport and restores its full height on dismissal',async({page})=>{
 await fixture(page);await page.setViewportSize({width:390,height:844});await page.addInitScript(()=>{const viewport=new EventTarget() as any;Object.assign(viewport,{height:innerHeight,width:innerWidth,offsetTop:0,offsetLeft:0,pageTop:0,pageLeft:0,scale:1});Object.defineProperty(window,'visualViewport',{configurable:true,value:viewport});(window as any).entryViewport20=(height:number,top:number)=>{viewport.height=height;viewport.offsetTop=top;viewport.dispatchEvent(new Event('resize'));};});
 await page.goto('/login');await page.getByLabel('Email',{exact:true}).focus();await page.evaluate(()=>(window as any).entryViewport20(400,80));await expect(page.locator('html')).toHaveAttribute('data-keyboard','open');await expect(page.locator('.auth-screen')).toHaveCSS('height','400px');await expect(page.locator('.auth-screen')).toHaveCSS('top','80px');await expect(page.locator('.auth-screen')).toHaveCSS('overflow-y','auto');
 await page.getByLabel('Email',{exact:true}).blur();await page.evaluate(()=>(window as any).entryViewport20(844,0));await expect(page.locator('html')).toHaveAttribute('data-keyboard','closed');await expect(page.locator('.auth-screen')).toHaveCSS('height','844px');await expect(page.locator('.auth-screen')).toHaveCSS('top','0px');
});
