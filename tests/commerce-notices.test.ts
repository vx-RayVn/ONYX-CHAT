import test from 'node:test';import assert from 'node:assert/strict';
import {createCommerceNoticeHandler,noticeInput,noticeReceipt,digest,drainCommerceMail} from '../supabase/functions/_shared/commerce-notices.ts';
const id='00000000-0034-4000-8000-000000000001',stamp='2026-10-25T01:30:00.000Z';
const notice=()=>({id,kind:'cancel',name:'Synthetic <Consumer>',email:'Person@Example.invalid',reference:'ONYX Plus, synthetic account',termination:'ordinary',end:'earliest',reason:''});
function fixture(){
 const calls:any[]=[],env:Record<string,string>={SUPABASE_SERVICE_ROLE_KEY:'synthetic_server_key',RESEND_API_KEY:'re_synthetic_fixture_only'};
 const deps={env:(key:string)=>env[key]??'',now:()=>Date.parse(stamp),rpc:async(name:string,args:any)=>{calls.push({name,args});return {data:name==='commerce_notice_accept'?{received_at:stamp,receipt:args.p_text}:name==='commerce_notice_delivery'?true:[],error:null};},fetch:async(url:any,init:any)=>{calls.push({name:String(url),args:init});return new Response('{}',{status:200});}};
 const send=(body:any,origin='https://onyxchat.site')=>createCommerceNoticeHandler(deps)(new Request('https://local.invalid',{method:'POST',headers:{origin,'content-type':'application/json','cf-connecting-ip':'192.0.2.1'},body:JSON.stringify(body)}));
 return {calls,env,deps,send};
}
test('consumer declarations validate exact fields and withdrawal never asks for a reason',()=>{
 assert.equal(noticeInput(notice()).email,'person@example.invalid');
 assert.equal(noticeInput({id,kind:'withdraw',name:'Synthetic consumer',email:'person@example.invalid',reference:'Synthetic order'}).kind,'withdraw');
 for(const patch of [{id:'bad'},{email:'victim@example.invalid\r\nBcc: x'},{name:''},{end:'2026-02-30'},{termination:'other'},{end:'2026-99-01'},{reason:'not for ordinary'},{extra:'ignored?'},{email:'x@y'}])assert.throws(()=>noticeInput({...notice(),...patch}));
 assert.throws(()=>noticeInput({id,kind:'withdraw',name:'Person',email:'person@example.invalid',reference:'order',reason:'not allowed'}));
 const receipt=noticeReceipt(noticeInput(notice()),stamp);assert(receipt.includes(stamp));assert(receipt.includes('earliest possible date'));assert(receipt.includes('confirmation button'));assert(!receipt.includes('successfully cancelled'));
});
test('a public declaration is saved before mail and no raw IP or credential reaches SQL',async()=>{
 const f=fixture(),response=await f.send(notice());assert.equal(response.status,201);const data=await response.json();assert.equal(data.received,true);assert.equal(data.deliveryPending,false);
 assert.equal(f.calls[0].name,'commerce_notice_accept');assert.equal(f.calls[0].args.p_received,stamp);
 const args=f.calls[0].args;assert.match(args.p_ip,/^[a-f0-9]{64}$/);assert.match(args.p_email_hash,/^[a-f0-9]{64}$/);assert(!JSON.stringify(args).includes('192.0.2.1'));assert(!JSON.stringify(args).includes(f.env.SUPABASE_SERVICE_ROLE_KEY));
 assert(!JSON.stringify(data).includes('re_synthetic'));assert.equal(await digest('same'),await digest('same'));
});
test('network or provider failure retains the received declaration and reports pending delivery',async()=>{
 const f=fixture(),base=f.deps.rpc;f.deps.rpc=async(name,args)=>{if(name==='commerce_mail_lease_v1')throw Error('synthetic outage');return base(name,args);};
 const result=await (await f.send(notice())).json();assert.equal(result.received,true);assert.equal(result.deliveryPending,true);assert(result.receipt.includes(stamp));
 const g=fixture(),base2=g.deps.rpc;g.deps.rpc=async(name,args)=>name==='commerce_notice_accept'?{data:null,error:{code:'P0429'}}:base2(name,args);
 assert.equal((await g.send(notice())).status,429);assert.equal(g.calls.length,0);
});
test('invalid origins, oversized data and malformed content never save or send a declaration',async()=>{
 const f=fixture();assert.equal((await f.send(notice(),'https://attacker.invalid')).status,403);
 assert.equal((await f.send({...notice(),name:'x'.repeat(9000)})).status,400);
 assert.equal((await createCommerceNoticeHandler(f.deps)(new Request('https://local.invalid',{method:'POST',body:'{}'}))).status,400);
 assert.equal(f.calls.length,0);
});
test('outbox sends only leased immutable text with stable provider idempotency and no refund calls',async()=>{
 const f=fixture();f.deps.rpc=async(name,args)=>{f.calls.push({name,args});return {data:name==='commerce_mail_lease_v1'?[{id,lease:id,recipient:'person@example.invalid',subject:'Synthetic receipt',text:'Synthetic immutable receipt'}]:null,error:null};};
 await drainCommerceMail(f.deps);const send=f.calls.find(c=>c.name==='https://api.resend.com/emails');assert(send);assert.equal(send.args.headers['Idempotency-Key'],'onyx-commerce/'+id);assert.equal(JSON.parse(send.args.body).from,'ONYX <support@onyxchat.site>');
 assert(f.calls.some(c=>c.name==='commerce_mail_finish'&&c.args.p_sent===true));assert(!f.calls.some(c=>/stripe|refund|subscriptions/.test(c.name)));
 const g=fixture();delete g.env.RESEND_API_KEY;assert.equal(await drainCommerceMail(g.deps),false);assert.equal(g.calls.length,0);
});
test('a public delivery wakeup cannot select recipients, rewrite text, or expose the queue',async()=>{
 const f=fixture();assert.equal((await f.send({action:'deliver'})).status,202);assert.equal(f.calls[0].name,'commerce_mail_lease_v1');
 const g=fixture();assert.equal((await g.send({action:'deliver',to:'other@example.invalid'})).status,400);assert.equal(g.calls.length,0);
 const status=await (await createCommerceNoticeHandler(g.deps)(new Request('https://local.invalid'))).json();assert.equal(status.mailConfigured,true);assert.equal(status.validation,'format_only');assert(!JSON.stringify(status).includes('re_synthetic'));
});
