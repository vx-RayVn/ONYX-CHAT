-- Public consumer declarations are accepted by an Edge gateway, not by user RPCs.
-- Private records have no account FK: a consumer need not be logged in or retain an account.
create table private.commerce_notices(
 id uuid primary key, body_hash text not null check(body_hash ~ '^[a-f0-9]{64}$'),
 ip_hash text not null check(ip_hash ~ '^[a-f0-9]{64}$'), email_hash text not null check(email_hash ~ '^[a-f0-9]{64}$'),
 received_at timestamptz not null, input jsonb not null check(jsonb_typeof(input)='object'),
 receipt text not null check(length(receipt) between 1 and 12000)
);
create index commerce_notices_ip_time on private.commerce_notices(ip_hash,received_at);
create index commerce_notices_email_time on private.commerce_notices(email_hash,received_at);
create index commerce_notices_time on private.commerce_notices(received_at);
alter table private.commerce_notices enable row level security;

alter table private.billing_orders add column terms_hash text check(terms_hash is null or terms_hash ~ '^[a-f0-9]{64}$');
alter table private.billing_orders add column terms_text text check(terms_text is null or length(terms_text) between 100 and 80000);
create table private.commerce_mail(
 id uuid primary key default gen_random_uuid(),notice_id uuid references private.commerce_notices(id) on delete cascade,
 order_id uuid unique references private.billing_orders(id) on delete cascade,
 recipient text not null check(length(recipient) between 3 and 254),subject text not null check(length(subject) between 1 and 180),
 body text not null check(length(body) between 1 and 90000),created_at timestamptz not null default now(),
 state text not null default 'pending' check(state in('pending','sent','manual')),
 attempts integer not null default 0 check(attempts between 0 and 10),next_attempt timestamptz not null default now(),
 lease uuid,lease_until timestamptz,check((notice_id is null)<>(order_id is null))
);
create index commerce_mail_pending on private.commerce_mail(next_attempt) where state='pending';
create index commerce_mail_notice on private.commerce_mail(notice_id);
alter table private.commerce_mail enable row level security;
revoke all on private.commerce_notices,private.commerce_mail from public,anon,authenticated;
grant select,insert,update on private.commerce_notices,private.commerce_mail to service_role;

create function private.commerce_notice_accept(p_id uuid,p_hash text,p_ip text,p_email_hash text,p_input jsonb,p_text text,p_received timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$
declare existing private.commerce_notices;
begin
 if p_id is null or p_hash is null or p_ip is null or p_email_hash is null or p_input is null or p_text is null or p_received is null or p_hash !~ '^[a-f0-9]{64}$' or p_ip !~ '^[a-f0-9]{64}$' or p_email_hash !~ '^[a-f0-9]{64}$' or coalesce(p_input->>'id','')<>p_id::text or coalesce(p_input->>'kind','') not in('cancel','withdraw') or jsonb_typeof(p_input)<>'object' or length(coalesce(p_input->>'email','')) not between 3 and 254 or length(p_text) not between 1 and 12000 or abs(extract(epoch from now()-p_received))>120 then raise exception 'invalid declaration' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('onyx-consumer-notices',0));
 select * into existing from private.commerce_notices where id=p_id;
 if found then
  if existing.body_hash<>p_hash then raise exception 'declaration conflict' using errcode='23514';end if;
  return jsonb_build_object('received_at',existing.received_at,'receipt',existing.receipt);
 end if;
 if (select count(*) from private.commerce_notices where ip_hash=p_ip and received_at>now()-interval '1 hour')>=10
 or(select count(*) from private.commerce_notices where email_hash=p_email_hash and received_at>now()-interval '1 hour')>=3
 or(select count(*) from private.commerce_notices where email_hash=p_email_hash and received_at>now()-interval '1 day')>=6
 or(select count(*) from private.commerce_notices where received_at>now()-interval '1 minute')>=50 then raise exception 'declaration rate limit' using errcode='P0429';end if;
 insert into private.commerce_notices values(p_id,p_hash,p_ip,p_email_hash,p_received,p_input,p_text);
 insert into private.commerce_mail(notice_id,recipient,subject,body) values
 (p_id,p_input->>'email','ONYX — Eingangsbestätigung / Declaration received',p_text),
 (p_id,'support@onyxchat.site','ONYX — Consumer declaration received',p_text);
 return jsonb_build_object('received_at',p_received,'receipt',p_text);
end $$;

create function private.commerce_mail_lease(p_notice uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 -- Stop uncertain deliveries before Resend's 24-hour idempotency window expires.
 update private.commerce_mail set state='manual',lease=null,lease_until=null where state='pending' and(attempts>=10 or created_at<now()-interval '23 hours');
 with candidates as(select id from private.commerce_mail where state='pending' and next_attempt<=now() and(lease_until is null or lease_until<now()) and(p_notice is null or notice_id=p_notice) order by created_at,id for update skip locked limit 6),claimed as(
 update private.commerce_mail m set lease=gen_random_uuid(),lease_until=now()+interval '2 minutes',attempts=attempts+1 from candidates c where m.id=c.id returning m.*)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'recipient',recipient,'subject',subject,'text',body,'lease',lease)),'[]'::jsonb) into result from claimed;
 return result;
end $$;
create function private.commerce_mail_finish(p_id uuid,p_lease uuid,p_sent boolean) returns void language sql security definer set search_path='' as $$
 update private.commerce_mail set state=case when p_sent then 'sent' else 'pending' end,next_attempt=now()+make_interval(secs=>least(3600,(30*power(2,attempts))::integer)),lease=null,lease_until=null where id=p_id and lease=p_lease and state='pending';
$$;
create function private.commerce_notice_delivery(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from private.commerce_mail where notice_id=p_id) and not exists(select 1 from private.commerce_mail where notice_id=p_id and state<>'sent')$$;

create function private.billing_reserve_with_terms(p_user uuid,p_sku text,p_server uuid,p_live boolean,p_wall boolean,p_hash text,p_terms text) returns jsonb language plpgsql security definer set search_path='' as $$
declare ord jsonb;result jsonb;
begin
 if p_hash is null or p_terms is null or p_hash !~ '^[a-f0-9]{64}$' or length(p_terms) not between 100 and 80000 or encode(extensions.digest(p_terms,'sha256'),'hex')<>p_hash then raise exception 'invalid purchase terms' using errcode='23514';end if;
 ord:=private.billing_reserve(p_user,p_sku,p_server,p_live,p_wall);
 update private.billing_orders set terms_hash=p_hash,terms_text=p_terms where id=(ord->>'id')::uuid and terms_hash is null;
 select to_jsonb(o) into result from private.billing_orders o where id=(ord->>'id')::uuid;
 return result;
end $$;
create function private.commerce_purchase_receipt(p_order uuid,p_email text) returns void language plpgsql security definer set search_path='' as $$
declare ord private.billing_orders;
begin
 select * into ord from private.billing_orders where id=p_order;
 if not found or ord.state<>'paid' or ord.terms_hash is null then return;end if;
 if length(p_email) not between 3 and 254 or p_email ~ '[\r\n]' then raise exception 'invalid receipt address' using errcode='23514';end if;
 insert into private.commerce_mail(order_id,recipient,subject,body) values(ord.id,p_email,'ONYX — Purchase confirmation',
 'ONYX — Purchase confirmation'||E'\nOrder: '||ord.id::text||E'\nProduct: '||ord.sku||E'\nTotal: EUR '||(ord.amount/100.0)::text||case when ord.kind='plus' then E'\nMonthly subscription; cancel before renewal.' else E'\nOne-time payment; 14 days from activation; no renewal.' end||E'\nPaid: '||ord.paid_at::text||E'\nTerms SHA-256: '||ord.terms_hash||E'\nTerms accepted in Stripe Checkout.\n\n'||ord.terms_text) on conflict(order_id) do nothing;
end $$;

create function public.commerce_notice_accept(p_id uuid,p_hash text,p_ip text,p_email_hash text,p_input jsonb,p_text text,p_received timestamptz) returns jsonb language sql security invoker set search_path='' as $$select private.commerce_notice_accept(p_id,p_hash,p_ip,p_email_hash,p_input,p_text,p_received)$$;
create function public.commerce_mail_lease(p_notice uuid default null) returns jsonb language sql security invoker set search_path='' as $$select private.commerce_mail_lease(p_notice)$$;
create function public.commerce_mail_finish(p_id uuid,p_lease uuid,p_sent boolean) returns void language sql security invoker set search_path='' as $$select private.commerce_mail_finish(p_id,p_lease,p_sent)$$;
create function public.commerce_notice_delivery(p_id uuid) returns boolean language sql security invoker set search_path='' as $$select private.commerce_notice_delivery(p_id)$$;
create function public.billing_reserve_with_terms(p_user uuid,p_sku text,p_server uuid,p_live boolean,p_wall boolean,p_hash text,p_terms text) returns jsonb language sql security invoker set search_path='' as $$select private.billing_reserve_with_terms(p_user,p_sku,p_server,p_live,p_wall,p_hash,p_terms)$$;
create function public.commerce_purchase_receipt(p_order uuid,p_email text) returns void language sql security invoker set search_path='' as $$select private.commerce_purchase_receipt(p_order,p_email)$$;
do $$declare f record;begin
 for f in select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private') and(p.proname like 'commerce_%' or p.proname='billing_reserve_with_terms') loop
  execute format('revoke all on function %I.%I(%s) from public,anon,authenticated',f.nspname,f.proname,f.args);
  execute format('grant execute on function %I.%I(%s) to service_role',f.nspname,f.proname,f.args);
 end loop;
end $$;
-- No credentials in cron: this wakeup can only drain immutable, leased messages.
select cron.schedule('onyx-commerce-mail','*/2 * * * *',$$select net.http_post(url:='https://your-project.supabase.co/functions/v1/commerce-notice',body:='{"action":"deliver"}'::jsonb,headers:='{"Content-Type":"application/json"}'::jsonb,timeout_milliseconds:=5000)$$);
