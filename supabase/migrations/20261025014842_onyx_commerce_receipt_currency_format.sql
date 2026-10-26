create or replace function private.commerce_purchase_receipt(p_order uuid,p_email text) returns void language plpgsql security definer set search_path='' as $$
declare ord private.billing_orders;
begin
 select * into ord from private.billing_orders where id=p_order;
 if not found or ord.state<>'paid' or ord.terms_hash is null then return;end if;
 if length(p_email) not between 3 and 254 or p_email ~ '[\r\n]' then raise exception 'invalid receipt address' using errcode='23514';end if;
 insert into private.commerce_mail(order_id,recipient,subject,body) values(ord.id,p_email,'ONYX — Purchase confirmation',
 'ONYX — Purchase confirmation'||E'\nOrder: '||ord.id::text||E'\nProduct: '||ord.sku||E'\nTotal: EUR '||to_char(ord.amount/100.0,'FM999999990.00')||case when ord.kind='plus' then E'\nMonthly subscription; cancel before renewal.' else E'\nOne-time payment; 14 days from activation; no renewal.' end||E'\nPaid: '||ord.paid_at::text||E'\nTerms SHA-256: '||ord.terms_hash||E'\nTerms accepted in Stripe Checkout.\n\n'||ord.terms_text) on conflict(order_id) do nothing;
end $$;
