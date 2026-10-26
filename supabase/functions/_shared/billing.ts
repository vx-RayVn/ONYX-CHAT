/** Stripe Checkout v1. All amounts/ownership originate in the database, never in the browser. */
import {mailConfigured,drainCommerceMail} from './commerce-notices.ts';
type Result={data:any;error:any};
type Deps={env:(key:string)=>string;rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<Result>;user:(jwt:string)=>Promise<string|null>;fetch?:typeof fetch;now?:()=>number;sleep?:(ms:number)=>Promise<void>;terms?:{hash:string;text:string}};
class CheckoutConflict extends Error{readonly code:'checkout_in_progress'|'promotion_active';constructor(code:'checkout_in_progress'|'promotion_active'){super(code);this.code=code;}}
const uuid=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
const id=(value:any):string|null=>typeof value==='string'?value:typeof value?.id==='string'?value.id:null;
const priceEnv:Record<string,string>={plus:'STRIPE_PRICE_PLUS',boost:'STRIPE_PRICE_BOOST',super:'STRIPE_PRICE_SUPER',mega:'STRIPE_PRICE_MEGA',top:'STRIPE_PRICE_TOP'};
// Reservations expire quickly; delayed bank/voucher methods need a different inventory lifecycle.
const delayedMethods=['acss_debit','au_becs_debit','bacs_debit','blik','boleto','customer_balance','konbini','multibanco','oxxo','pay_by_bank','sepa_debit','sofort','us_bank_account'];
async function body(req:Request,limit:number){const reader=req.body?.getReader();if(!reader)return '';let size=0;const chunks:Uint8Array[]=[];try{for(;;){const v=await reader.read();if(v.done)break;size+=v.value.length;if(size>limit)throw Error('body_too_large');chunks.push(v.value);}}finally{reader.releaseLock();}const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}

export function billingService(deps:Deps){
 const request=deps.fetch??fetch,clock=()=>Math.floor((deps.now?.()??Date.now())/1000);
 const secret=()=>deps.env('STRIPE_SECRET_KEY');
 const keyMode=()=>secret().match(/^(?:sk|rk)_(test|live)_[A-Za-z0-9_]+$/)?.[1]??null;
 const live=()=>keyMode()==='live';
 // Preserve automatic-tax gating unless the operator explicitly selects own tax handling.
 const taxMode=()=>{const value=deps.env('BILLING_TAX_MODE')||'stripe_tax';return value==='stripe_tax'||value==='merchant_managed'?value:'unconfigured';};
 // Fixed status codes only. Never return environment values or provider errors.
 const configuration=()=>{
  const missing:string[]=[];
  if(keyMode()===null)missing.push('server_key');
  if(!/^whsec_[A-Za-z0-9_]{16,}$/.test(deps.env('STRIPE_WEBHOOK_SECRET')))missing.push('webhook_secret');
  if(!Object.values(priceEnv).every(key=>/^price_[A-Za-z0-9]+$/.test(deps.env(key))))missing.push('prices');
  if(taxMode()==='unconfigured')missing.push('tax_mode');
  if(live()){
   if(deps.env('BILLING_LIVE_ENABLED')!=='true')missing.push('live_activation');
   if(deps.env('BILLING_MERCHANT_READY')!=='true')missing.push('merchant_confirmation');
   if(taxMode()==='stripe_tax'&&deps.env('STRIPE_TAX_READY')!=='true')missing.push('tax_confirmation');
   if(!deps.terms||!/^[a-f0-9]{64}$/.test(deps.terms.hash)||deps.terms.text.length<100||deps.terms.text.length>80000)missing.push('purchase_terms');
   if(!mailConfigured(deps.env))missing.push('consumer_mail');
  }
  return {mode:keyMode()??'unavailable',taxMode:taxMode(),missing,validation:'format_only'};
 };
 const ready=()=>configuration().missing.length===0;
 // Stopping new sales must never strand paid orders, subscription management or webhooks.
 const providerReady=()=>!configuration().missing.some(code=>['server_key','webhook_secret','prices'].includes(code));
 const rpc=async(name:string,args:Record<string,unknown>={})=>{const r=await deps.rpc(name,args);if(r.error){if(r.error.message==='checkout pending')throw new CheckoutConflict('checkout_in_progress');if(r.error.message==='promotion already active'||r.error.message==='Plus already active')throw new CheckoutConflict('promotion_active');throw Error('billing_action_failed');}return r.data;};
 const stripe=async(route:string,method='GET',params?:Record<string,string>,key?:string)=>{
  if(!/^\/(checkout\/sessions(?:\/[A-Za-z0-9_]+(?:\/expire)?)?|prices\/[A-Za-z0-9_]+|subscriptions\/[A-Za-z0-9_]+|invoices\/[A-Za-z0-9_]+|charges\/[A-Za-z0-9_]+|billing_portal\/sessions)$/.test(route))throw Error('invalid_provider_path');
  const sleep=deps.sleep??((ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms))),retryable=method==='GET'||method==='POST'&&!!key;
  for(let attempt=0;attempt<3;attempt++){
   let response:Response;
   try{response=await request('https://api.stripe.com/v1'+route+(method==='GET'&&params?'?'+new URLSearchParams(params):''),{method,redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+secret(),'Stripe-Version':'2026-09-30.endive',...(method==='POST'?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(key?{'Idempotency-Key':key}:{})},...(params&&method==='POST'?{body:new URLSearchParams(params)}:{})});}
   catch{if(!retryable||attempt===2)throw Error('payment_provider_unavailable');await sleep(200*2**attempt);continue;}
   if(!response.ok){const guidance=response.headers.get('Stripe-Should-Retry'),again=retryable&&attempt<2&&guidance!=='false'&&(guidance==='true'||[409,429,500,502,503,504].includes(response.status));await response.body?.cancel();if(again){await sleep(200*2**attempt);continue;}throw Error('payment_provider_unavailable');}
   try{const text=await body(new Request('https://local.invalid',{method:'POST',body:response.body,duplex:'half'} as RequestInit),512000);return JSON.parse(text);}catch{if(!retryable||attempt===2)throw Error('payment_provider_unavailable');await sleep(200*2**attempt);}
  }
  throw Error('payment_provider_unavailable');
 };
 const catalog=async()=>{const data=await rpc('billing_catalog'),state=configuration(),isReady=state.missing.length===0;return {...data,ready:isReady,mode:isReady?state.mode:'unavailable',configuration:state};};
 const order=async(user:string,orderId:string)=>{const r=await rpc('billing_lookup',{p_user:user,p_order:orderId,p_live:live()});return r?.order;};
 const subscription=async(subId:string,event:number)=>{
  const sub=await stripe('/subscriptions/'+subId),orderId=sub.metadata?.onyx_order,user=sub.metadata?.onyx_user;
  if(!uuid.test(orderId??'')||!uuid.test(user??''))return;
  let ord=await order(user,orderId);if(!ord||!ord.livemode||ord.kind!=='plus'||sub.livemode!==true)return;
  // Invoice/subscription notifications can precede Checkout's webhook. Recover the
  // verified receipt first, or return a retryable error instead of losing the event.
  if(!ord.subscription_id&&ord.session_id){await complete(ord.session_id,event,false);ord=await order(user,orderId);}
  if(!ord?.subscription_id)throw Error('activation_pending');
  if(id(sub.customer)!==ord.customer_id||sub.id!==ord.subscription_id)throw Error('subscription_identity_mismatch');
  const items=sub.items?.data??[];
  if(items.length!==1||items[0].quantity!==1||id(items[0].price)!==deps.env('STRIPE_PRICE_PLUS'))throw Error('subscription_price_mismatch');
  let invoice:any=null,until:number|null=null,intent:string|null=null;
  if(id(sub.latest_invoice)){
   const inv=await stripe('/invoices/'+id(sub.latest_invoice),'GET',{'expand[]':'payments'});
   if(inv.status==='paid'&&inv.paid!==false&&inv.currency==='eur'&&inv.total===ord.amount&&inv.livemode===true&&id(inv.customer)===ord.customer_id){
    invoice=inv;until=items[0].current_period_end??sub.current_period_end;
    intent=id(inv.payment_intent)??id(inv.payments?.data?.find((p:any)=>p.payment?.type==='payment_intent')?.payment?.payment_intent);
   }
  }
  const state=['active','trialing','past_due','canceled','unpaid','paused','incomplete','incomplete_expired'].includes(sub.status)?sub.status:'incomplete';
  await rpc('billing_subscription',{p_order:ord.id,p_subscription:sub.id,p_customer:ord.customer_id,p_state:state,p_until:invoice&&Number.isSafeInteger(until)?new Date(until!*1000).toISOString():null,p_cancel:!!sub.cancel_at_period_end,p_event:event,p_invoice:invoice?.id??null,p_intent:intent});
 };
 const complete=async(sessionId:string,event:number,syncSubscription=true)=>{
  const session=await stripe('/checkout/sessions/'+sessionId),orderId=session.metadata?.onyx_order,user=session.metadata?.onyx_user;
  if(!uuid.test(orderId??'')||!uuid.test(user??''))throw Error('checkout_identity_mismatch');
  const ord=await order(user,orderId);
  if(!ord||session.id!==sessionId||session.client_reference_id!==ord.id||session.livemode!==ord.livemode||session.livemode!==live()||session.currency!=='eur'||session.amount_total!==ord.amount||session.mode!==(ord.kind==='plus'?'subscription':'payment'))throw Error('checkout_payment_mismatch');
  if(session.status==='expired'&&session.payment_status==='unpaid'){await rpc('billing_expire',{p_order:ord.id,p_session:session.id});return {session,order:ord};}
  if(session.status!=='complete'||session.payment_status!=='paid')return {session,order:ord};
  const email=session.customer_details?.email??session.customer_email;
  if(ord.terms_hash&&(session.metadata?.onyx_terms_hash!==ord.terms_hash||session.consent?.terms_of_service!=='accepted'||typeof email!=='string'||email.length>254||! /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)))throw Error('checkout_consent_mismatch');
  await rpc('billing_complete',{p_order:ord.id,p_session:session.id,p_amount:session.amount_total,p_currency:session.currency,p_live:session.livemode,p_customer:id(session.customer),p_subscription:id(session.subscription),p_intent:id(session.payment_intent)});
  if(session.livemode&&ord.terms_hash){await rpc('commerce_purchase_receipt',{p_order:ord.id,p_email:email});try{await drainCommerceMail(deps);}catch{/* A durable outbox is retried by the delivery job; no payment refund is triggered. */}}
  if(syncSubscription&&ord.kind==='plus'&&id(session.subscription))await subscription(id(session.subscription)!,event);
  return {session,order:ord};
 };
 const reconcile=async(user:string)=>{
  if(!providerReady())return [];
  const own=await rpc('billing_lookup',{p_user:user,p_order:null,p_live:live()});
  const pending=[];for(const item of (own.pending??[]).slice(0,4))pending.push(await complete(item.session,clock()));
  if(own.subscription?.subscription_id)await subscription(own.subscription.subscription_id,clock());
  return pending;
 };
 return {ready,providerReady,live,taxMode,catalog,rpc,stripe,subscription,complete,reconcile,clock,order};
}

export function createBillingHandler(deps:Deps){
 const service=billingService(deps);
 return async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  try{
   if(req.method==='GET')return json(await service.catalog());
   if(req.method!=='POST')return json({error:'method_not_allowed'},405);
   const jwt=req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1]??'',user=jwt?await deps.user(jwt):null;
   if(!user)return json({error:'account_session_required'},401);
   await service.rpc('billing_gate',{p_user:user});
   const data=JSON.parse(await body(req,4096));
   if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(k=>!['action','sku','serverId','showSupporter'].includes(k)))return json({error:'invalid_request'},400);
   if(data.serverId!==undefined&&data.serverId!==null&&!uuid.test(data.serverId))return json({error:'invalid_server'},400);
   if(data.action==='status'){
    await service.reconcile(user);
    return json(await service.rpc('billing_status',{p_user:user,p_server:data.serverId??null}));
   }
   if(data.action==='cancel'||data.action==='portal'){
    if(!service.providerReady())return json({error:'payments_not_configured'},503);
    const own=await service.rpc('billing_lookup',{p_user:user,p_order:null,p_live:service.live()}),sub=own?.subscription;
    if(!sub)return json({error:'subscription_not_found'},404);
    if(data.action==='cancel'){
     await service.stripe('/subscriptions/'+sub.subscription_id,'POST',{cancel_at_period_end:'true'});
     await service.subscription(sub.subscription_id,service.clock());return json({ok:true});
    }
    const portal=await service.stripe('/billing_portal/sessions','POST',{customer:sub.customer_id,return_url:'https://onyxchat.site/app/?billing=return'});
    if(!safeStripeUrl(portal.url,'portal'))throw Error('invalid_provider_url');return json({url:portal.url});
   }
   if(!service.ready())return json({error:'payments_not_configured'},503);
   if(data.action!=='checkout'||typeof data.sku!=='string'||!Object.hasOwn(priceEnv,data.sku)||data.showSupporter!==undefined&&typeof data.showSupporter!=='boolean')return json({error:'invalid_request'},400);
   const pending=await service.reconcile(user);
   const catalog=await service.catalog(),product=catalog.products.find((p:any)=>p.sku===data.sku);
   const price=await service.stripe('/prices/'+deps.env(priceEnv[data.sku]));
   if(!product||price.id!==deps.env(priceEnv[data.sku])||price.active!==true||price.currency!=='eur'||price.unit_amount!==product.amount||price.livemode!==service.live()||(data.sku==='plus'?(price.recurring?.interval!=='month'||price.recurring?.interval_count!==1):!!price.recurring)||service.live()&&price.tax_behavior!=='inclusive')throw Error('price_configuration_mismatch');
   for(const {order:previous,session} of pending){
    if(previous.user_id!==user)throw Error('checkout_identity_mismatch');
    if(previous.kind==='plus'?(data.sku!=='plus'):previous.server_id!==data.serverId)continue;
    if(session.status==='expired')continue;
    if(session.status!=='open'||session.payment_status!=='unpaid')throw new CheckoutConflict(session.payment_status==='paid'?'promotion_active':'checkout_in_progress');
    if(previous.sku===data.sku){if(!safeStripeUrl(session.url,'checkout'))throw Error('invalid_provider_url');return json({url:session.url,mode:service.live()?'live':'test'});}
    // A different explicit choice supersedes only this user's verified, unpaid checkout.
    // Never cancel a completed/processing payment or create a compensating refund.
    try{await service.stripe('/checkout/sessions/'+session.id+'/expire','POST',{},'onyx-replace-'+session.id);}
    catch(error){const fresh=await service.complete(session.id,service.clock());if(fresh.session.status==='complete')throw new CheckoutConflict('promotion_active');throw error;}
    const expired=await service.complete(session.id,service.clock());if(expired.session.status!=='expired'||expired.session.payment_status!=='unpaid')throw new CheckoutConflict('checkout_in_progress');
   }
   if(!deps.terms)throw Error('purchase_terms_missing');
   const ord=await service.rpc('billing_reserve_with_terms',{p_user:user,p_sku:data.sku,p_server:data.serverId??null,p_live:service.live(),p_wall:data.showSupporter??false,p_hash:deps.terms.hash,p_terms:deps.terms.text});
   const params:Record<string,string>={mode:data.sku==='plus'?'subscription':'payment','line_items[0][price]':price.id,'line_items[0][quantity]':'1',client_reference_id:ord.id,'metadata[onyx_order]':ord.id,'metadata[onyx_user]':user,success_url:'https://onyxchat.site/app/?billing=return',cancel_url:'https://onyxchat.site/app/?billing=cancelled',expires_at:String(Math.floor(new Date(ord.expires_at).getTime()/1000)),'consent_collection[terms_of_service]':'required','integration_identifier':'onyx_app_ypobouco','managed_payments[enabled]':'false','adaptive_pricing[enabled]':'false','automatic_tax[enabled]':service.taxMode()==='stripe_tax'?'true':'false'};
   delayedMethods.forEach((method,index)=>{params['excluded_payment_method_types['+index+']']=method;});
   params['metadata[onyx_terms_hash]']=ord.terms_hash;
   if(data.sku==='plus'){params['subscription_data[metadata][onyx_order]']=ord.id;params['subscription_data[metadata][onyx_user]']=user;}
   const session=await service.stripe('/checkout/sessions','POST',params,'onyx-checkout-'+ord.id);
   if(!safeStripeUrl(session.url,'checkout'))throw Error('invalid_provider_url');
   await service.rpc('billing_bind',{p_order:ord.id,p_session:session.id});return json({url:session.url,mode:service.live()?'live':'test'});
  }catch(error){return error instanceof CheckoutConflict?json({error:error.code},409):json({error:'billing_unavailable'},503);}
 };
}
export function safeStripeUrl(value:unknown,kind:'checkout'|'portal'){
 try{const u=new URL(String(value));return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&u.hostname===(kind==='checkout'?'checkout.stripe.com':'billing.stripe.com');}catch{return false;}
}
/** Run after verified self-deletion consent, BEFORE deleting files or the Auth identity. */
export async function closeAccountBilling(deps:Deps,user:string){
 const service=billingService(deps);await service.rpc('billing_close',{p_user:user});
 let own=await service.rpc('billing_lookup',{p_user:user,p_order:null,p_live:service.live()});
 if(own.creating)throw Error('checkout_reconciliation_required');
 for(const pending of own.pending??[]){
  const session=await service.stripe('/checkout/sessions/'+pending.session);
  if(session.status==='open')await service.stripe('/checkout/sessions/'+pending.session+'/expire','POST',{});
  else if(session.status==='complete')await service.complete(session.id,service.clock());
 }
 own=await service.rpc('billing_lookup',{p_user:user,p_order:null,p_live:service.live()});
 if(own.subscription?.subscription_id){const sub=await service.stripe('/subscriptions/'+own.subscription.subscription_id);if(sub.status!=='canceled')await service.stripe('/subscriptions/'+own.subscription.subscription_id,'DELETE');}
}
export async function verifyStripeSignature(payload:string,header:string,secret:string,now=Date.now()){
 if(!secret||header.length>2048)return false;
 const timestamp=header.split(',').find(p=>p.startsWith('t='))?.slice(2),signatures=header.split(',').filter(p=>p.startsWith('v1=')).map(p=>p.slice(3));
 if(!timestamp||!/^\d{1,12}$/.test(timestamp)||Math.abs(now/1000-Number(timestamp))>300)return false;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 for(const signature of signatures){if(!/^[0-9a-f]{64}$/.test(signature))continue;const bytes=Uint8Array.from(signature.match(/../g)!,p=>parseInt(p,16));if(await crypto.subtle.verify('HMAC',key,bytes,new TextEncoder().encode(timestamp+'.'+payload)))return true;}
 return false;
}
export function createStripeWebhookHandler(deps:Deps){
 const service=billingService(deps);
 return async(req:Request)=>{
  if(req.method!=='POST')return json({error:'method_not_allowed'},405);
  try{
   const payload=await body(req,262144);
   if(!await verifyStripeSignature(payload,req.headers.get('stripe-signature')??'',deps.env('STRIPE_WEBHOOK_SECRET'),deps.now?.()))return json({error:'invalid_signature'},400);
   const event=JSON.parse(payload);if(event.livemode!==service.live()||!service.providerReady())return json({error:'billing_mode_mismatch'},400);
   const object=event.data?.object,type=event.type;
   if(!object?.id||!Number.isSafeInteger(event.created))return json({error:'invalid_event'},400);
   if(['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.expired'].includes(type))await service.complete(object.id,event.created);
   else if(type.startsWith('customer.subscription.'))await service.subscription(object.id,event.created);
   else if(['invoice.paid','invoice.payment_failed','invoice.payment_action_required'].includes(type)){
    const inv=await service.stripe('/invoices/'+object.id),sub=id(inv.parent?.subscription_details?.subscription)??id(inv.subscription);if(sub)await service.subscription(sub,event.created);
   }else if(['charge.refunded','charge.dispute.created'].includes(type)){
    const charge=await service.stripe('/charges/'+(type==='charge.refunded'?object.id:id(object.charge)));
    if(charge.livemode===service.live()&&(charge.amount_refunded>=charge.amount||type==='charge.dispute.created')&&id(charge.payment_intent))await service.rpc('billing_refund',{p_intent:id(charge.payment_intent)});
   }
   return json({received:true});
  }catch{return json({error:'webhook_retry_required'},503);}
 };
}
