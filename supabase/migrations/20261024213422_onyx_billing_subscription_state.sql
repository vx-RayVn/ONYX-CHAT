-- Apply supporter consent once per purchase; cancellation still syncs after a manual refund.
alter table private.billing_orders add column wall_applied boolean not null default false;
create or replace function private.billing_subscription(p_order uuid,p_subscription text,p_customer text,p_state text,p_until timestamptz,p_cancel boolean,p_event bigint,p_invoice text,p_intent text) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid; ord private.billing_orders;sub private.billing_subscriptions;
begin
 perform pg_advisory_xact_lock(hashtextextended('onyx.billing.inventory',0));
 select * into sub from private.billing_subscriptions where subscription_id=p_subscription for update;
 if not found then
  select * into ord from private.billing_orders where id=p_order and kind='plus' and state='paid' and livemode;
  if not found then return;end if;
  insert into private.billing_subscriptions(user_id,subscription_id,customer_id,state) values(ord.user_id,p_subscription,p_customer,'pending_payment') on conflict(user_id) do nothing;
  select * into sub from private.billing_subscriptions where subscription_id=p_subscription for update;
  if not found then return;end if; -- An older canceled subscription cannot replace a newer one.
 end if;
 uid:=sub.user_id;
 if p_customer<>sub.customer_id or p_event<sub.last_event then return;end if;
 if p_invoice is not null and p_until is not null and p_state='active' then
  insert into private.billing_invoices(invoice_id,subscription_id,user_id,payment_intent,paid_until,refunded) values(p_invoice,p_subscription,uid,p_intent,p_until,exists(select 1 from private.billing_revocations where payment_intent=p_intent)) on conflict(invoice_id) do nothing;
  if not exists(select 1 from private.billing_invoices where invoice_id=p_invoice and refunded) then
   update private.billing_subscriptions set paid_until=greatest(coalesce(paid_until,p_until),p_until) where user_id=uid;
  end if;
 end if;
 update private.billing_subscriptions set state=p_state,cancel_at_end=p_cancel,last_event=p_event where user_id=uid;
 select * into sub from private.billing_subscriptions where user_id=uid;
 if sub.paid_until>now() and p_state not in('canceled','unpaid','incomplete_expired') then
  update public.profiles set plus_since=coalesce(plus_since,now()),plus_until=sub.paid_until where id=uid;
  perform private.grant_badge(uid,'supporter');
  if ord.id is null then select * into ord from private.billing_orders where user_id=uid and subscription_id=p_subscription order by created_at limit 1;end if;
  if not ord.wall_applied then
   update public.profiles set supporter_wall=ord.show_supporter where id=uid;
   update private.billing_orders set wall_applied=true where id=ord.id;
  end if;
 elsif not exists(select 1 from private.billing_legacy_plus where user_id=uid) then
  update public.profiles set plus_since=null,plus_until=null,supporter_wall=false,badges=array_remove(badges,'supporter') where id=uid;
  delete from public.user_badges where user_id=uid and badge='supporter';
 end if;
end $$;
