import {expect,type Page} from '@playwright/test';
/** Synthetic Cloudflare API, never used by application builds or live Auth. */
export async function authEntryFixture(page:Page){
 const state={available:true,country:'DE',countryDelay:0,scriptFails:false};
 await page.route('**/functions/v1/auth-entry-config',route=>route.fulfill({status:state.available?200:503,json:state.available?{siteKey:'0xSyntheticPublicFixtureOnly20'}:{error:'security_check_unavailable'}}));
 await page.route('https://www.cloudflare.com/cdn-cgi/trace',async route=>{if(state.countryDelay)await new Promise(r=>setTimeout(r,state.countryDelay));await route.fulfill({body:`loc=${state.country}\n`,headers:{'Access-Control-Allow-Origin':'*'}});});
 await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',route=>state.scriptFails?route.abort():route.fulfill({contentType:'text/javascript',body:`(()=>{let n=0;const widgets=new Map();window.turnstile={render(node,options){const id='fixture-'+(++n);widgets.set(id,{node,options});return id;},execute(id){queueMicrotask(()=>{const w=widgets.get(id);if(!w)return;const mode=window.syntheticChallenge20;if(mode==='hold')return;if(mode==='fail')w.options['error-callback']();else if(mode==='expire')w.options['expired-callback']();else w.options.callback('synthetic-proof-'+n);});},remove(id){widgets.delete(id);}};})();`}));
 return state;
}
export async function chooseBirthDate(page:Page,{day='1',month='January',year='2000'}={}){
 for(const[label,value]of [['Day',day],['Month',month],['Year',year]]){const trigger=page.getByRole('combobox',{name:label,exact:true});await trigger.click();await page.getByRole('option',{name:value,exact:true}).click();await expect(trigger).toContainText(value);}
}
