import test from 'node:test';import assert from 'node:assert/strict';
import {purchaseMailV1} from '../supabase/functions/_shared/purchase-mail-v1.ts';
import {drainCommerceMail} from '../supabase/functions/_shared/commerce-notices.ts';
import {purchaseMailFixture} from './helpers/purchase-mail-fixture.ts';
test('all five purchase types show exact payment and truthful cadence in a compact email',async()=>{
 for(const [sku,name,amount] of [['plus','ONYX Plus','3.99'],['boost','Server Boost','2.99'],['super','Super Boost','5.99'],['mega','Mega Boost','8.99'],['top','Top Row','12.99']]){
  const fixture=purchaseMailFixture(sku),mail=await purchaseMailV1(fixture.subject,fixture.text);
  assert(mail.html.includes(name));assert(mail.html.includes('€'+amount));assert(mail.html.includes(fixture.id));assert(mail.html.includes('25 October 2026 · 11:39 UTC'));
  assert.equal(mail.html.includes('Cancel subscription'),sku==='plus');assert.equal(mail.html.includes('14 days from activation'),sku!=='plus');
  assert(Buffer.byteLength(mail.html)<12000);assert(!mail.html.includes(fixture.hash));assert(!mail.html.includes('Example Street'));assert(!/most popular|upgrade|limited|guaranteed|successfully cancelled/i.test(mail.html));
 }
});
test('attachment preserves the exact accepted Unicode contract instead of mutable current terms',async()=>{
 const fixture=purchaseMailFixture('plus','<script>Not HTML</script> & "Terms"\n'.repeat(10)+'日本語 — Ελληνικά — العربية\n'),mail=await purchaseMailV1(fixture.subject,fixture.text);
 assert.equal(mail.attachments.length,1);assert.equal(mail.attachments[0].filename,'ONYX-purchase-terms.txt');assert.equal(Buffer.from(mail.attachments[0].content,'base64').toString('utf8'),fixture.terms);
 assert(!mail.html.includes('<script>'));assert(!mail.html.includes('Not HTML'));assert(!mail.html.includes('日本語'));assert(!mail.html.includes('Terms SHA-256:'));
 assert(!mail.html.includes('/commerce/terms.txt'));
});
test('malformed, mismatched or tampered receipts cannot make a success email',async()=>{
 const fixture=purchaseMailFixture();
 for(const text of [fixture.text.replace('EUR 3.99','EUR 1.00'),fixture.text.replace('Product: plus','Product: __proto__'),fixture.text.replace('Monthly subscription; cancel before renewal.','One-time payment; 14 days from activation; no renewal.'),fixture.text.replace('2026-10-25','<script>'),fixture.text+'changed terms',fixture.text.replace(fixture.id,'invalid'),fixture.text.replace('+00\n','+99\n')])await assert.rejects(()=>purchaseMailV1(fixture.subject,text));
 await assert.rejects(()=>purchaseMailV1('ONYX — Declaration received',fixture.text));
});
test('HTML contains only branded static navigation and logo, with no tracking or executable content',async()=>{
 const fixture=purchaseMailFixture(),{html}=await purchaseMailV1(fixture.subject,fixture.text);
 const hrefs=[...html.matchAll(/href="([^"]+)"/g)].map(x=>x[1]);assert.deepEqual(hrefs,['https://onyxchat.site/app/','https://onyxchat.site/guidelines/#cancel-subscription','https://onyxchat.site/guidelines/#withdraw-contract']);
 const images=[...html.matchAll(/src="([^"]+)"/g)].map(x=>x[1]);assert.deepEqual(images,['https://onyxchat.site/brand/onyx-logo-512.png']);
 assert(!/<script|<iframe|<form|javascript:|@import|@font-face|onload=|onclick=/i.test(html));assert(html.includes('role="presentation"'));assert(html.includes('<h1'));assert(html.includes('width="100%"'));
});
test('legacy payload stays byte-for-byte while pinned purchase payload is deterministic across retries',async()=>{
 const fixture=purchaseMailFixture(),bodies:string[]=[],finish:boolean[]=[],legacy='Original immutable plaintext — without presentation';let styled=false;
 const deps={env:(key:string)=>key==='RESEND_API_KEY'?'re_synthetic_mail_test':'',rpc:async(name:string,args:any)=>{
  if(name==='commerce_mail_lease_v1')return{data:[{id:fixture.id,lease:fixture.id,recipient:'buyer@example.invalid',subject:styled?fixture.subject:'Original subject',text:styled?fixture.text:legacy,mail_format:styled?1:0}],error:null};
  if(name==='commerce_mail_finish'){finish.push(args.p_sent);return{data:null,error:null};}throw Error('Unexpected RPC');
 },fetch:async(_input:any,init:any)=>{assert.equal(init.headers['Idempotency-Key'],'onyx-commerce/'+fixture.id);bodies.push(init.body);return new Response('{}',{status:200});}};
 await drainCommerceMail(deps);assert.deepEqual(JSON.parse(bodies[0]),{from:'ONYX <support@onyxchat.site>',to:['buyer@example.invalid'],reply_to:'support@onyxchat.site',subject:'Original subject',text:legacy});
 styled=true;await drainCommerceMail(deps);await drainCommerceMail(deps);assert.equal(bodies[1],bodies[2]);assert.equal(JSON.parse(bodies[1]).text,fixture.text);assert.equal(JSON.parse(bodies[1]).attachments.length,1);assert.deepEqual(finish,[true,true,true]);
});
test('invalid or future mail formats are retained for retry without contacting the provider',async()=>{
 for(const patch of [{mail_format:99},{mail_format:1,text:'corrupted receipt'}]){const fixture=purchaseMailFixture();let sent=false,finished=false;
  await drainCommerceMail({env:key=>key==='RESEND_API_KEY'?'re_synthetic_mail_test':'',rpc:async(name,args)=>name==='commerce_mail_lease_v1'?{data:[{...fixture,...patch,recipient:'buyer@example.invalid',lease:fixture.id}],error:null}:((finished=args.p_sent===false),{data:null,error:null}),fetch:async()=>{sent=true;return new Response('{}');}});
  assert.equal(sent,false);assert.equal(finished,true);
 }
});
