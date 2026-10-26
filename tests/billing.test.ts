import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {billingService,createBillingHandler,createStripeWebhookHandler,closeAccountBilling,safeStripeUrl,verifyStripeSignature} from '../supabase/functions/_shared/billing.ts';

// Entirely synthetic provider/account fixtures. No network, keys, or real accounts.
const user='00000000-0033-4000-8000-000000000001',oid='00000000-0033-4000-8000-000000000002';
const now=1_792_858_000_000,seconds=now/1000;
function fixture(live=false){
 const env:Record<string,string>={STRIPE_SECRET_KEY:live?'sk_live_synthetic':'sk_test_synthetic',STRIPE_WEBHOOK_SECRET:'whsec_synthetic_fixture_only',STRIPE_PRICE_PLUS:'price_plus',STRIPE_PRICE_BOOST:'price_boost',STRIPE_PRICE_SUPER:'price_super',STRIPE_PRICE_MEGA:'price_mega',STRIPE_PRICE_TOP:'price_top',BILLING_LIVE_ENABLED:'true',BILLING_MERCHANT_READY:'true',STRIPE_TAX_READY:'true',RESEND_API_KEY:'re_synthetic_fixture_only'};
 const calls:{kind:string;name:string;args:any}[]=[],responses=new Map<string,any>();
 const ord:any={id:oid,user_id:user,kind:'plus',sku:'plus',amount:399,livemode:live,session_id:'cs_live_fixture',customer_id:'cus_fixture',subscription_id:'sub_fixture',expires_at:new Date(now+35*60000).toISOString()};
 let own:any={order:ord,pending:[],subscription:null,creating:false};
 const deps={terms:{hash:'a'.repeat(64),text:'Synthetic public purchase terms. '.repeat(10)},env:(k:string)=>env[k]??'',now:()=>now,user:async(jwt:string)=>jwt==='synthetic-session'?user:null,
  rpc:async(name:string,args:any)=>{calls.push({kind:'rpc',name,args});if(name==='billing_catalog')return {data:{products:[{sku:'plus',amount:399,kind:'plus',days:0},{sku:'top',amount:1299,kind:'top',days:14}],topAvailable:4},error:null};return {data:name==='billing_lookup'?own:name==='billing_reserve_with_terms'?Object.assign(ord,{terms_hash:args.p_hash,terms_text:args.p_terms}):name==='billing_status'?{pendingActivation:0}:null,error:null};},
  fetch:async(input:any,init:any)=>{const url=new URL(String(input));calls.push({kind:'fetch',name:url.pathname,args:init});assert.equal(url.origin,'https://api.stripe.com');assert.equal(init.headers['Stripe-Version'],'2026-09-30.endive');assert.equal(init.redirect,'error');if(!responses.has(url.pathname))throw Error('Unexpected synthetic provider request: '+url.pathname);const response=responses.get(url.pathname);return new Response(JSON.stringify(typeof response==='function'?response(init):response),{status:200});}
 };
 const handler=createBillingHandler(deps),send=(data:any,token='synthetic-session')=>handler(new Request('https://local.invalid',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(data)}));
 return {deps,env,calls,responses,ord,send,own:(value:any)=>{own=value;}};
}
function signed(event:any,secret:string,t=seconds){const payload=JSON.stringify(event),signature=createHmac('sha256',secret).update(t+'.'+payload).digest('hex');return new Request('https://local.invalid',{method:'POST',headers:{'stripe-signature':`t=${t},v1=${signature}`},body:payload});}
test('billing is inactive without complete configuration and separate live readiness gates',async()=>{
 const f=fixture(true);delete f.env.BILLING_MERCHANT_READY;assert.equal(billingService(f.deps).ready(),false);
 assert.equal((await f.send({action:'checkout',sku:'plus'})).status,503);assert.equal(f.calls.filter(c=>c.kind==='fetch').length,0);
 f.env.BILLING_MERCHANT_READY='true';assert.equal(billingService(f.deps).ready(),true);delete f.env.STRIPE_PRICE_MEGA;assert.equal(billingService(f.deps).ready(),false);
});
test('checkout rejects unauthenticated, malformed, prototype SKU and client price injection',async()=>{
 const f=fixture();assert.equal((await f.send({action:'checkout',sku:'plus'},'wrong')).status,401);
 for(const data of [{action:'checkout',sku:'__proto__'},{action:'checkout',sku:'plus',amount:1},{action:'checkout',sku:'top',serverId:'foreign'},{action:'checkout',sku:'plus',showSupporter:'yes'}])assert.equal((await f.send(data)).status,400);
 assert.equal(f.calls.filter(c=>c.kind==='fetch').length,0);
});
test('public billing setup distinguishes missing entries from live confirmations without exposing values',async()=>{
 const f=fixture(true);for(const k of ['BILLING_LIVE_ENABLED','BILLING_MERCHANT_READY','STRIPE_TAX_READY'])delete f.env[k];
 const response=await createBillingHandler(f.deps)(new Request('https://local.invalid'));
 assert.equal(response.status,200);const result=await response.json();assert.equal(result.ready,false);assert.equal(result.mode,'unavailable');
 assert.deepEqual(result.configuration,{mode:'live',taxMode:'stripe_tax',missing:['live_activation','merchant_confirmation','tax_confirmation'],validation:'format_only'});
 for(const value of Object.values(f.env))assert(!JSON.stringify(result).includes(value));
 assert.equal(f.calls.filter(c=>c.kind==='fetch').length,0);
 delete f.env.STRIPE_SECRET_KEY;delete f.env.STRIPE_WEBHOOK_SECRET;delete f.env.STRIPE_PRICE_TOP;
 const missing=await billingService(f.deps).catalog();assert.deepEqual(missing.configuration,{mode:'unavailable',taxMode:'stripe_tax',missing:['server_key','webhook_secret','prices'],validation:'format_only'});
 const g=fixture(false),configured=await billingService(g.deps).catalog();assert.equal(configured.ready,true);assert.deepEqual(configured.configuration,{mode:'test',taxMode:'stripe_tax',missing:[],validation:'format_only'});
});

test('restricted Stripe keys retain their test/live mode and all live readiness gates',async()=>{
 for(const live of [false,true]){
  const f=fixture(live);f.env.STRIPE_SECRET_KEY=live?'rk_live_synthetic':'rk_test_synthetic';
  const service=billingService(f.deps);assert.equal(service.live(),live);assert.equal(service.ready(),true);
  assert.equal((await service.catalog()).mode,live?'live':'test');
  for(const gate of ['BILLING_LIVE_ENABLED','BILLING_MERCHANT_READY','STRIPE_TAX_READY']){
   f.env[gate]='false';assert.equal(service.ready(),!live);f.env[gate]='true';
  }
 }
 const f=fixture();for(const key of ['pk_live_synthetic','rk_live_','rk_unknown_synthetic','rk_test_synthetic trailing','']){
  f.env.STRIPE_SECRET_KEY=key;assert.equal(billingService(f.deps).ready(),false);
 }
});

test('restricted-key webhooks verify provider proof in the correct mode without exposing credentials',async()=>{
 for(const live of [false,true]){
  const f=fixture(live);f.env.STRIPE_SECRET_KEY=live?'rk_live_synthetic':'rk_test_synthetic';
  Object.assign(f.ord,{kind:'top',sku:'top',amount:1299,subscription_id:null});
  f.responses.set('/v1/checkout/sessions/cs_live_fixture',{id:'cs_live_fixture',metadata:{onyx_order:oid,onyx_user:user},client_reference_id:oid,livemode:live,currency:'eur',amount_total:1299,mode:'payment',status:'complete',payment_status:'paid',customer:'cus_fixture',payment_intent:'pi_fixture'});
  const response=await createStripeWebhookHandler(f.deps)(signed({created:seconds,livemode:live,type:'checkout.session.completed',data:{object:{id:'cs_live_fixture'}}},f.env.STRIPE_WEBHOOK_SECRET));
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{received:true});
  assert.equal(f.calls.find(c=>c.name==='billing_complete')?.args.p_live,live);
  assert.equal(f.calls.find(c=>c.kind==='fetch')?.args.headers.Authorization,'Bearer '+f.env.STRIPE_SECRET_KEY);
 }
});

test('a restricted key with insufficient permissions cannot reserve or activate an order',async()=>{
 const f=fixture(true);f.env.STRIPE_SECRET_KEY='rk_live_synthetic';
 f.deps.fetch=async()=>new Response('synthetic permission error',{status:403});
 const response=await createBillingHandler(f.deps)(new Request('https://local.invalid',{method:'POST',headers:{authorization:'Bearer synthetic-session','content-type':'application/json'},body:JSON.stringify({action:'checkout',sku:'plus'})}));
 assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'billing_unavailable'});
 assert(!f.calls.some(c=>['billing_reserve_with_terms','billing_complete'].includes(c.name)));
});

test('Plus creates a monthly server-priced Checkout with one stable idempotency key',async()=>{
 const f=fixture();f.responses.set('/v1/prices/price_plus',{id:'price_plus',active:true,currency:'eur',unit_amount:399,livemode:false,recurring:{interval:'month',interval_count:1}});
 f.responses.set('/v1/checkout/sessions',{id:'cs_test_checkout',url:'https://checkout.stripe.com/c/pay/synthetic'});
 for(let i=0;i<2;i++)assert.equal((await f.send({action:'checkout',sku:'plus',showSupporter:false})).status,200);
 const sessions=f.calls.filter(c=>c.name==='/v1/checkout/sessions');assert.equal(sessions.length,2);
 for(const c of sessions){assert.equal(c.args.headers['Idempotency-Key'],'onyx-checkout-'+oid);assert.equal(c.args.body.get('mode'),'subscription');assert.equal(c.args.body.get('line_items[0][quantity]'),'1');assert.equal(c.args.body.get('subscription_data[metadata][onyx_user]'),user);}
 assert(f.calls.some(c=>c.name==='billing_reserve_with_terms'&&c.args.p_wall===false));assert(!f.calls.some(c=>c.name.includes('refund')));
});

test('explicit merchant tax handling preserves live gates and never marks customers or products exempt',async()=>{
 const f=fixture(true);f.env.BILLING_TAX_MODE='merchant_managed';delete f.env.STRIPE_TAX_READY;
 assert.equal(billingService(f.deps).ready(),true);
 for(const gate of ['BILLING_LIVE_ENABLED','BILLING_MERCHANT_READY']){delete f.env[gate];assert.equal(billingService(f.deps).ready(),false);f.env[gate]='true';}
 f.responses.set('/v1/prices/price_plus',{id:'price_plus',active:true,currency:'eur',unit_amount:399,livemode:true,tax_behavior:'inclusive',recurring:{interval:'month',interval_count:1}});
 f.responses.set('/v1/checkout/sessions',{id:'cs_live_checkout',url:'https://checkout.stripe.com/c/pay/synthetic'});
 for(let i=0;i<2;i++)assert.equal((await f.send({action:'checkout',sku:'plus'})).status,200);
 const sessions=f.calls.filter(c=>c.name==='/v1/checkout/sessions');assert.equal(sessions.length,2);
 for(const session of sessions){
  const params=session.args.body;
  assert.equal(params.get('automatic_tax[enabled]'),'false');assert.equal(params.get('managed_payments[enabled]'),'false');assert.equal(params.get('adaptive_pricing[enabled]'),'false');
  assert.equal(params.get('consent_collection[terms_of_service]'),'required');assert.equal(params.get('integration_identifier'),'onyx_app_ypobouco');
  assert.equal(session.args.headers['Idempotency-Key'],'onyx-checkout-'+oid);
  assert(![...params.keys()].some(k=>/payment_method_types\[|tax_exempt|tax_rates/.test(k)&&!k.startsWith('excluded_')));
  assert.equal(params.get('excluded_payment_method_types[3]'),'blik');assert([...params.values()].includes('sepa_debit'));
 }
 assert(!f.calls.some(c=>/customers|products|refunds|tax\/registrations/.test(c.name)));
});

test('automatic Stripe Tax remains explicit and invalid tax configuration fails closed',async()=>{
 const f=fixture(true);f.env.BILLING_TAX_MODE='stripe_tax';delete f.env.STRIPE_TAX_READY;
 assert.deepEqual((await billingService(f.deps).catalog()).configuration.missing,['tax_confirmation']);
 f.env.STRIPE_TAX_READY='true';
 f.responses.set('/v1/prices/price_plus',{id:'price_plus',active:true,currency:'eur',unit_amount:399,livemode:true,tax_behavior:'inclusive',recurring:{interval:'month',interval_count:1}});
 f.responses.set('/v1/checkout/sessions',{id:'cs_live_checkout',url:'https://checkout.stripe.com/c/pay/synthetic'});
 assert.equal((await f.send({action:'checkout',sku:'plus'})).status,200);
 assert.equal(f.calls.find(c=>c.name==='/v1/checkout/sessions')?.args.body.get('automatic_tax[enabled]'),'true');
 for(const mode of ['off','true','private-invalid-value']){
  const g=fixture(true);g.env.BILLING_TAX_MODE=mode;const catalog=await billingService(g.deps).catalog();
  assert.equal(catalog.ready,false);assert.equal(catalog.configuration.taxMode,'unconfigured');assert.deepEqual(catalog.configuration.missing,['tax_mode']);assert(!JSON.stringify(catalog).includes(mode));
  assert.equal((await g.send({action:'checkout',sku:'plus'})).status,503);assert.equal(g.calls.filter(c=>c.kind==='fetch').length,0);
 }
});
test('misconfigured Stripe price fails before a reservation or Checkout is created',async()=>{
 const f=fixture();f.responses.set('/v1/prices/price_plus',{id:'price_plus',active:true,currency:'eur',unit_amount:399,livemode:false,recurring:{interval:'year',interval_count:1}});
 assert.equal((await f.send({action:'checkout',sku:'plus'})).status,503);assert(!f.calls.some(c=>c.name==='billing_reserve_with_terms'));
});
test('payment URLs accept only exact provider HTTPS origins',()=>{
 for(const bad of ['http://checkout.stripe.com/x','https://checkout.stripe.com.attacker.invalid/x','https://checkout.stripe.com@evil.invalid/x','https://checkout.stripe.com:444/x','javascript:alert(1)','https://billing.stripe.com/x'])assert.equal(safeStripeUrl(bad,'checkout'),false);
 assert(safeStripeUrl('https://checkout.stripe.com/c/pay/test','checkout'));assert(safeStripeUrl('https://billing.stripe.com/p/session/test','portal'));
});
test('webhook signature requires exact raw bytes, current timestamp and valid rotated signature',async()=>{
 const secret='synthetic_webhook_secret',payload='{"event":1}',sig=createHmac('sha256',secret).update(seconds+'.'+payload).digest('hex');
 assert(await verifyStripeSignature(payload,`t=${seconds},v1=${'0'.repeat(64)},v1=${sig}`,secret,now));assert(!await verifyStripeSignature(payload+' ',`t=${seconds},v1=${sig}`,secret,now));assert(!await verifyStripeSignature(payload,`t=${seconds},v1=${sig}`,secret,now+301000));
 const f=fixture();const result=await createStripeWebhookHandler(f.deps)(new Request('https://local.invalid',{method:'POST',body:'{}'}));assert.equal(result.status,400);assert.equal(f.calls.length,0);
});
test('Checkout webhook re-fetches provider proof and rejects mismatched amount',async()=>{
 const f=fixture(true);f.responses.set('/v1/checkout/sessions/cs_live_fixture',{id:'cs_live_fixture',metadata:{onyx_order:oid,onyx_user:user},client_reference_id:oid,livemode:true,currency:'eur',amount_total:1,mode:'subscription',status:'complete',payment_status:'paid'});
 const response=await createStripeWebhookHandler(f.deps)(signed({created:seconds,livemode:true,type:'checkout.session.completed',data:{object:{id:'cs_live_fixture',amount_total:399}}},f.env.STRIPE_WEBHOOK_SECRET));assert.equal(response.status,503);assert(!f.calls.some(c=>c.name==='billing_complete'));
});
test('paid invoice uses item period and expanded invoice payments; early invoice recovers Checkout binding',async()=>{
 const f=fixture(true);f.ord.subscription_id=null;f.ord.customer_id=null;
 f.responses.set('/v1/subscriptions/sub_fixture',{id:'sub_fixture',metadata:{onyx_order:oid,onyx_user:user},livemode:true,customer:'cus_fixture',status:'active',items:{data:[{quantity:1,price:'price_plus',current_period_end:seconds+2592000}]},latest_invoice:'in_fixture'});
 f.responses.set('/v1/checkout/sessions/cs_live_fixture',{id:'cs_live_fixture',metadata:{onyx_order:oid,onyx_user:user},client_reference_id:oid,livemode:true,currency:'eur',amount_total:399,mode:'subscription',status:'complete',payment_status:'paid',customer:'cus_fixture',subscription:'sub_fixture'});
 f.responses.set('/v1/invoices/in_fixture',{id:'in_fixture',status:'paid',paid:true,currency:'eur',total:399,livemode:true,customer:'cus_fixture',payments:{data:[{payment:{type:'payment_intent',payment_intent:'pi_fixture'}}]}});
 const base=f.deps.rpc;f.deps.rpc=async(name,args)=>{const result=await base(name,args);if(name==='billing_complete'){f.ord.subscription_id='sub_fixture';f.ord.customer_id='cus_fixture';}return result;};
 await billingService(f.deps).subscription('sub_fixture',seconds);const update=f.calls.find(c=>c.name==='billing_subscription')!;assert(update);assert.equal(update.args.p_intent,'pi_fixture');assert.equal(update.args.p_until,new Date((seconds+2592000)*1000).toISOString());assert.equal(f.calls.filter(c=>c.name==='billing_complete').length,1);
});
test('temporary activation errors remain retryable and never request a refund',async()=>{
 const f=fixture(true);f.ord.subscription_id=null;f.responses.set('/v1/subscriptions/sub_fixture',{id:'sub_fixture',metadata:{onyx_order:oid,onyx_user:user},livemode:true});f.responses.set('/v1/checkout/sessions/cs_live_fixture',{id:'cs_live_fixture',metadata:{onyx_order:oid,onyx_user:user},client_reference_id:oid,livemode:true,currency:'eur',amount_total:399,mode:'subscription',status:'complete',payment_status:'paid',customer:'cus_fixture',subscription:'sub_fixture'});
 const response=await createStripeWebhookHandler(f.deps)(signed({created:seconds,livemode:true,type:'customer.subscription.updated',data:{object:{id:'sub_fixture'}}},f.env.STRIPE_WEBHOOK_SECRET));assert.equal(response.status,503);assert(!f.calls.some(c=>c.name.includes('refund')));
});
test('account deletion blocks new purchases first and cancels its own recurring subscription',async()=>{
 const f=fixture(true);f.own({pending:[],creating:false,subscription:{subscription_id:'sub_fixture',customer_id:'cus_fixture'}});f.responses.set('/v1/subscriptions/sub_fixture',{id:'sub_fixture',status:'active'});
 await closeAccountBilling(f.deps,user);assert.equal(f.calls[0].name,'billing_close');assert(f.calls.some(c=>c.name==='/v1/subscriptions/sub_fixture'&&c.args.method==='DELETE'));
 const g=fixture();g.own({pending:[],creating:true,subscription:null});await assert.rejects(closeAccountBilling(g.deps,user),/reconciliation_required/);assert.equal(g.calls.filter(c=>c.kind==='fetch').length,0);
});

test('consumer mail and purchase policy are separate live-sale prerequisites',async()=>{
 const f=fixture(true);delete f.env.RESEND_API_KEY;delete (f.deps as any).terms;
 const catalog=await billingService(f.deps).catalog();assert.equal(catalog.ready,false);assert.deepEqual(catalog.configuration.missing,['purchase_terms','consumer_mail']);
 assert.equal((await f.send({action:'checkout',sku:'plus'})).status,503);assert(!f.calls.some(c=>c.kind==='fetch'));
 assert.equal(billingService(f.deps).providerReady(),true);
});
test('paid consent-verified orders retain fulfillment and durable receipts while new sales are disabled',async()=>{
 const f=fixture(true);delete f.env.BILLING_LIVE_ENABLED;delete f.env.RESEND_API_KEY;delete (f.deps as any).terms;
 Object.assign(f.ord,{kind:'top',sku:'top',amount:1299,subscription_id:null,terms_hash:'a'.repeat(64)});
 f.responses.set('/v1/checkout/sessions/cs_live_fixture',{id:'cs_live_fixture',metadata:{onyx_order:oid,onyx_user:user,onyx_terms_hash:'a'.repeat(64)},consent:{terms_of_service:'accepted'},customer_details:{email:'buyer@example.invalid'},client_reference_id:oid,livemode:true,currency:'eur',amount_total:1299,mode:'payment',status:'complete',payment_status:'paid',customer:'cus_fixture',payment_intent:'pi_fixture'});
 const response=await createStripeWebhookHandler(f.deps)(signed({created:seconds,livemode:true,type:'checkout.session.completed',data:{object:{id:'cs_live_fixture'}}},f.env.STRIPE_WEBHOOK_SECRET));
 assert.equal(response.status,200);assert(f.calls.some(c=>c.name==='billing_complete'));assert(f.calls.some(c=>c.name==='commerce_purchase_receipt'&&c.args.p_order===oid&&c.args.p_email==='buyer@example.invalid'));assert(!f.calls.some(c=>/refund/.test(c.name)));
});
test('a new order cannot activate against different or unaccepted purchase terms',async()=>{
 for(const accepted of [true,false]){
  const f=fixture(true);Object.assign(f.ord,{kind:'top',sku:'top',amount:1299,subscription_id:null,terms_hash:'a'.repeat(64)});
  f.responses.set('/v1/checkout/sessions/cs_live_fixture',{id:'cs_live_fixture',metadata:{onyx_order:oid,onyx_user:user,onyx_terms_hash:accepted?'b'.repeat(64):'a'.repeat(64)},consent:{terms_of_service:accepted?'accepted':'none'},customer_details:{email:'buyer@example.invalid'},client_reference_id:oid,livemode:true,currency:'eur',amount_total:1299,mode:'payment',status:'complete',payment_status:'paid'});
  await assert.rejects(billingService(f.deps).complete('cs_live_fixture',seconds),/consent_mismatch/);
  assert(!f.calls.some(c=>['billing_complete','commerce_purchase_receipt'].includes(c.name)));
 }
});
test('an owner can still cancel an existing subscription while new sales are stopped',async()=>{
 const f=fixture(true);delete f.env.BILLING_LIVE_ENABLED;delete f.env.RESEND_API_KEY;
 f.own({order:f.ord,pending:[],subscription:{subscription_id:'sub_fixture',customer_id:'cus_fixture'}});
 f.responses.set('/v1/subscriptions/sub_fixture',{id:'sub_fixture',metadata:{onyx_order:oid,onyx_user:user},livemode:true,customer:'cus_fixture',status:'active',cancel_at_period_end:true,items:{data:[{quantity:1,price:'price_plus',current_period_end:seconds+2592000}]}});
 assert.equal((await f.send({action:'cancel'})).status,200);
 assert(f.calls.some(c=>c.name==='/v1/subscriptions/sub_fixture'&&c.args.method==='POST'&&c.args.body.get('cancel_at_period_end')==='true'));
 const before=f.calls.length;assert.equal((await f.send({action:'checkout',sku:'plus'})).status,503);assert(!f.calls.slice(before).some(c=>c.kind==='fetch'));
});
test('reusing a pending order preserves its original immutable policy hash',async()=>{
 const f=fixture(true);Object.assign(f.ord,{terms_hash:'b'.repeat(64),terms_text:'Original immutable terms. '.repeat(10)});
 f.responses.set('/v1/prices/price_plus',{id:'price_plus',active:true,currency:'eur',unit_amount:399,livemode:true,tax_behavior:'inclusive',recurring:{interval:'month',interval_count:1}});
 f.responses.set('/v1/checkout/sessions',{id:'cs_live_checkout',url:'https://checkout.stripe.com/c/pay/synthetic'});
 const base=f.deps.rpc;f.deps.rpc=async(name,args)=>name==='billing_reserve_with_terms'?{data:f.ord,error:null}:base(name,args);
 assert.equal((await f.send({action:'checkout',sku:'plus'})).status,200);
 assert.equal(f.calls.find(c=>c.name==='/v1/checkout/sessions')?.args.body.get('metadata[onyx_terms_hash]'),'b'.repeat(64));
});
