import{test,expect}from'@playwright/test';
const owner='00000000-0000-4000-8000-0000000000f1';
const report={id:'10000000-0000-4000-8000-000000000001',reporter_id:owner,category:'security',title:'Private report fixture',description:'Minimal synthetic reproduction without private data.',environment:'Local fixture only',status:'open',reply:'',created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
test.beforeEach(async({page})=>{await page.route('**/rest/v1/**',r=>r.fulfill({json:[]}));await page.route('**/functions/v1/**',r=>r.fulfill({status:401,json:{error:'local_fixture'}}));});
test('private report form retains the text and nonce after failure and shows successful submission',async({page})=>{
 const attempts:any[]=[];let submitted=false;await page.route('**/rest/v1/bug_reports?**',r=>{expect(new URL(r.request().url()).searchParams.get('reporter_id')).toBe('eq.'+owner);return r.fulfill({json:submitted?[report]:[]});});await page.route('**/rest/v1/rpc/submit_bug_report',r=>{attempts.push(r.request().postDataJSON());if(attempts.length===1)return r.fulfill({status:503,json:{message:'temporary failure'}});submitted=true;return r.fulfill({json:attempts[1].p_id});});
 await page.goto('/?ui-e2e&strict-ids&section=bugs&category=security');await page.getByLabel('Title',{exact:true}).fill('Synthetic report title');await page.getByLabel('What happened?',{exact:true}).fill(report.description);await page.getByRole('button',{name:'Send report',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'Your text is still here'})).toBeVisible();await expect(page.getByLabel('Title',{exact:true})).toHaveValue('Synthetic report title');await page.getByRole('button',{name:'Send report',exact:true}).click();await expect(page.locator('.bug-report-card')).toContainText(report.title);expect(attempts).toHaveLength(2);expect(attempts[0].p_id).toBe(attempts[1].p_id);expect(attempts[1].p_category).toBe('security');expect(attempts[1]).not.toHaveProperty('reporter_id');await page.getByRole('tab',{name:'Report a bug',exact:true}).click();await expect(page.getByLabel('Title',{exact:true})).toHaveValue('');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('team inbox can update status and reply without exposing reporter identity in the public UI',async({page})=>{
 let row={...report};await page.route('**/rest/v1/bug_reports?**',r=>r.fulfill({json:[row]}));let mutation:any;await page.route('**/rest/v1/rpc/set_bug_report_status',r=>{mutation=r.request().postDataJSON();row={...row,status:mutation.p_status,reply:mutation.p_reply};return r.fulfill({json:null});});
 await page.goto('/?ui-e2e&strict-ids&admin&section=bug-inbox');await expect(page.getByRole('heading',{name:'Bug inbox',exact:true})).toBeVisible();const status=page.getByRole('combobox',{name:'Status',exact:true});await status.click();await page.getByRole('option',{name:'Actual bug · Working on it',exact:true}).click();await expect(status).toContainText('Actual bug');await page.getByLabel('Reply to reporter',{exact:true}).fill('We are investigating this fixture.');await page.getByRole('button',{name:'Refresh',exact:true}).click();await expect(status).toContainText('Actual bug');await page.locator('.bug-review').getByRole('button',{name:'Save',exact:true}).click();await expect(page.locator('.bug-status')).toContainText('Actual bug · Working on it');expect(mutation.p_id).toBe(report.id);expect(mutation.p_reply).toBe('We are investigating this fixture.');
});
test('report list failure is explicit and refresh recovers',async({page})=>{
 let fail=true;await page.route('**/rest/v1/bug_reports?**',r=>fail?r.fulfill({status:503,json:{message:'fixture offline'}}):r.fulfill({json:[{...report,status:'not_bug',reply:'Resolved in the fixture.'}]}));await page.goto('/?ui-e2e&strict-ids&section=bugs');await page.getByRole('tab',{name:'Your reports',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'Couldn’t load reports.'})).toBeVisible();fail=false;await page.getByRole('button',{name:'Refresh',exact:true}).click();await expect(page.locator('.bug-team-reply')).toContainText('Resolved in the fixture.');await expect(page.locator('.bug-status')).toHaveText('Not a bug');
});
test('reporter can track status and sees the badge only for a confirmed bug',async({page},info)=>{
 let status='open';await page.route('**/rest/v1/bug_reports?**',route=>route.fulfill({json:[{...report,status,updated_at:new Date().toISOString()}]}));
 await page.goto('/?ui-e2e&strict-ids&section=bugs');
 const category=page.getByRole('combobox',{name:'Category',exact:true});await category.click();
 await expect(page.getByRole('listbox')).toBeVisible();await page.getByRole('option',{name:'Security',exact:true}).click();
 await expect(category).toContainText('Security');
 await page.getByRole('tab',{name:'Your reports',exact:true}).click();
 await expect(page.locator('.bug-status')).toHaveText('Open');await expect(page.locator('.bug-awarded')).toHaveCount(0);
 status='confirmed';await page.getByRole('button',{name:'Refresh',exact:true}).click();
 await expect(page.locator('.bug-status')).toContainText('Actual bug');await expect(page.locator('.bug-awarded')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:`test-results/app14-bugs-${info.project.name}.png`});
 status='not_bug';await page.getByRole('button',{name:'Refresh',exact:true}).click();
 await expect(page.locator('.bug-status')).toHaveText('Not a bug');await expect(page.locator('.bug-awarded')).toHaveCount(0);
});
