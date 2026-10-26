-- Pin rendering per durable outbox record. Existing messages retain their exact payload.
alter table private.commerce_mail add column mail_format smallint not null default 0 check(mail_format in(0,1));
-- Older workers only claim the original plaintext format during rolling deployment.
create or replace function private.commerce_mail_lease(p_notice uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 -- Stop uncertain deliveries before Resend's 24-hour idempotency window expires.
 update private.commerce_mail set state='manual',lease=null,lease_until=null where mail_format=0 and state='pending' and(attempts>=10 or created_at<now()-interval '23 hours');
 with candidates as(select id from private.commerce_mail where mail_format=0 and state='pending' and next_attempt<=now() and(lease_until is null or lease_until<now()) and(p_notice is null or notice_id=p_notice) order by created_at,id for update skip locked limit 6),claimed as(
 update private.commerce_mail m set lease=gen_random_uuid(),lease_until=now()+interval '2 minutes',attempts=attempts+1 from candidates c where m.id=c.id returning m.*)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'recipient',recipient,'subject',subject,'text',body,'lease',lease)),'[]'::jsonb) into result from claimed;
 return result;
end $$;
create or replace function private.commerce_mail_lease_v1(p_notice uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 -- Stop uncertain deliveries before Resend's 24-hour idempotency window expires.
 update private.commerce_mail set state='manual',lease=null,lease_until=null where state='pending' and(attempts>=10 or created_at<now()-interval '23 hours');
 with candidates as(select id from private.commerce_mail where state='pending' and next_attempt<=now() and(lease_until is null or lease_until<now()) and(p_notice is null or notice_id=p_notice) order by created_at,id for update skip locked limit 6),claimed as(
 update private.commerce_mail m set lease=gen_random_uuid(),lease_until=now()+interval '2 minutes',attempts=attempts+1 from candidates c where m.id=c.id returning m.*)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'recipient',recipient,'mail_format',mail_format,'subject',subject,'text',body,'lease',lease)),'[]'::jsonb) into result from claimed;
 return result;
end $$;
create function public.commerce_mail_lease_v1(p_notice uuid default null) returns jsonb language sql security invoker set search_path='' as $$select private.commerce_mail_lease_v1(p_notice)$$;
revoke all on function private.commerce_mail_lease_v1(uuid),public.commerce_mail_lease_v1(uuid) from public,anon,authenticated;
grant execute on function private.commerce_mail_lease_v1(uuid),public.commerce_mail_lease_v1(uuid) to service_role;
-- Only newly enqueued purchase receipts use the compact HTML + immutable terms attachment.
create or replace function private.commerce_purchase_receipt(p_order uuid,p_email text) returns void language plpgsql security definer set search_path='' as $$
declare ord private.billing_orders;
begin
 select * into ord from private.billing_orders where id=p_order;
 if not found or ord.state<>'paid' or ord.terms_hash is null then return;end if;
 if length(p_email) not between 3 and 254 or p_email ~ '[\r\n]' then raise exception 'invalid receipt address' using errcode='23514';end if;
 insert into private.commerce_mail(order_id,mail_format,recipient,subject,body) values(ord.id,1,p_email,'ONYX — Purchase confirmation',
 'ONYX — Purchase confirmation'||E'\nOrder: '||ord.id::text||E'\nProduct: '||ord.sku||E'\nTotal: EUR '||to_char(ord.amount/100.0,'FM999999990.00')||case when ord.kind='plus' then E'\nMonthly subscription; cancel before renewal.' else E'\nOne-time payment; 14 days from activation; no renewal.' end||E'\nPaid: '||ord.paid_at::text||E'\nTerms SHA-256: '||ord.terms_hash||E'\nTerms accepted in Stripe Checkout.\n\n'||ord.terms_text) on conflict(order_id) do nothing;
end $$;
