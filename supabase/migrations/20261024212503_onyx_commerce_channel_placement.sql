-- Channel placement is one permission-checked transaction, including both groups.
create function private.reorder_server_channel(p_channel uuid,p_category uuid,p_before uuid) returns void language plpgsql security definer set search_path='' as $$
declare sid uuid; old_category uuid; ids uuid[]; at integer;
begin
 perform private.directory_session();
 select server_id into sid from public.channels where id=p_channel;
 if sid is null or not private.has_server_permission(sid,'manageChannels') or not private.has_channel_permission(p_channel,'manageChannels') then raise exception 'channel management required' using errcode='42501';end if;
 perform 1 from public.servers where id=sid for update;
 select category_id into old_category from public.channels where id=p_channel and server_id=sid for update;
 if not found then raise exception 'channel unavailable';end if;
 if p_category is not null and (not exists(select 1 from public.categories where id=p_category and server_id=sid) or not private.has_category_permission(p_category,'manageChannels')) then raise exception 'invalid category' using errcode='42501';end if;
 if p_before=p_channel then return;end if;
 select coalesce(array_agg(id order by position,id),'{}') into ids from public.channels where server_id=sid and category_id is not distinct from p_category and id<>p_channel;
 at:=case when p_before is null then cardinality(ids)+1 else array_position(ids,p_before) end;
 if at is null then raise exception 'invalid channel target' using errcode='23514';end if;
 perform private.hit_rate_limit('channel_reorder',60,interval '1 minute');
 ids:=coalesce(ids[1:at-1],'{}')||array[p_channel]||coalesce(ids[at:cardinality(ids)],'{}');
 update public.channels c set category_id=p_category,position=x.pos-1 from unnest(ids) with ordinality as x(id,pos) where c.id=x.id;
 if old_category is distinct from p_category then
  with x as(select id,row_number()over(order by position,id)-1 as pos from public.channels where server_id=sid and category_id is not distinct from old_category)
  update public.channels c set position=x.pos from x where c.id=x.id;
 end if;
end $$;
revoke all on function private.reorder_server_channel(uuid,uuid,uuid) from public,anon;
grant execute on function private.reorder_server_channel(uuid,uuid,uuid) to authenticated;
create function public.reorder_server_channel(p_channel uuid,p_category uuid default null,p_before uuid default null) returns void language sql security invoker set search_path='' as $$select private.reorder_server_channel(p_channel,p_category,p_before)$$;
revoke all on function public.reorder_server_channel(uuid,uuid,uuid) from public,anon;
grant execute on function public.reorder_server_channel(uuid,uuid,uuid) to authenticated;

-- No card data, postal addresses, emails, keys, or full Stripe events are stored here.
create table private.billing_products(sku text primary key,amount integer not null check(amount>0),days integer not null,level integer not null,kind text not null check(kind in('plus','boost','top')),enabled boolean not null default true);
insert into private.billing_products values('plus',399,0,0,'plus',true),('boost',299,14,1,'boost',true),('super',599,14,2,'boost',true),('mega',899,14,3,'boost',true),('top',1299,14,0,'top',true);
create table private.billing_orders(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id) on delete cascade,
 server_id uuid references public.servers(id) on delete set null,sku text not null references private.billing_products(sku),
 amount integer not null,days integer not null,level integer not null,kind text not null,livemode boolean not null,
 state text not null default 'pending' check(state in('pending','bound','processing','paid','expired','refunded')),
 slot integer check(slot between 1 and 4),session_id text unique,customer_id text,subscription_id text,payment_intent text unique,
 show_supporter boolean not null default false,created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '35 minutes',paid_at timestamptz
);
create index billing_orders_user_idx on private.billing_orders(user_id);
create index billing_orders_server_idx on private.billing_orders(server_id);
create index billing_orders_pending_idx on private.billing_orders(slot) where state in('pending','bound','processing');
create table private.billing_subscriptions(
 user_id uuid primary key references public.profiles(id) on delete cascade,subscription_id text not null unique,customer_id text not null,
 state text not null,paid_until timestamptz,cancel_at_end boolean not null default false,last_event bigint not null default 0
);
create table private.billing_invoices(invoice_id text primary key,subscription_id text not null,user_id uuid not null references public.profiles(id) on delete cascade,payment_intent text unique,paid_until timestamptz not null,refunded boolean not null default false);
create index billing_invoices_user_idx on private.billing_invoices(user_id);
create index billing_subscriptions_expiry_idx on private.billing_subscriptions(paid_until);
create table private.server_promotions(
 server_id uuid not null references public.servers(id) on delete cascade,user_id uuid not null references public.profiles(id) on delete cascade,
 kind text not null check(kind in('boost','top')),sku text not null references private.billing_products(sku),level integer not null default 0,
 slot integer check(slot between 1 and 4),ends_at timestamptz not null,order_id uuid not null references private.billing_orders(id) on delete cascade,
 primary key(server_id,kind)
);
create index server_promotions_owner_idx on private.server_promotions(user_id);
create index server_promotions_expiry_idx on private.server_promotions(ends_at);
create unique index server_promotions_slot_idx on private.server_promotions(slot) where kind='top';
create table private.billing_events(id text primary key,seen_at timestamptz not null default now());
-- A verified refund/dispute may arrive before Checkout. Keep its minimal revocation
-- marker so a later receipt cannot accidentally activate the refunded purchase.
create table private.billing_revocations(payment_intent text primary key,revoked_at timestamptz not null default now());
create table private.billing_attempts(user_id uuid primary key references public.profiles(id) on delete cascade,window_start timestamptz not null,attempts integer not null);
create table private.billing_closed(user_id uuid primary key references public.profiles(id) on delete cascade);
alter table public.profiles add column plus_until timestamptz;
grant select(plus_until) on public.profiles to authenticated;
-- Explicitly retain the old grants for profiles that already held Plus before subscriptions.
create table private.billing_legacy_plus(user_id uuid primary key references public.profiles(id) on delete cascade);
insert into private.billing_legacy_plus select id from public.profiles where plus_since is not null;
do $$declare tbl text;begin
 foreach tbl in array array['billing_products','billing_orders','billing_subscriptions','billing_invoices','server_promotions','billing_events','billing_revocations','billing_legacy_plus','billing_attempts','billing_closed'] loop
  execute format('alter table private.%I enable row level security',tbl);
  execute format('revoke all on private.%I from public,anon,authenticated',tbl);
 end loop;
end $$;

create function private.billing_gate(p_user uuid) returns void language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if not exists(select 1 from public.profiles where id=p_user and not is_guest) or exists(select 1 from public.platform_bans where user_id=p_user and lifted_at is null) then raise exception 'registered buyer required' using errcode='42501';end if;
 insert into private.billing_attempts values(p_user,date_trunc('minute',now()),1) on conflict(user_id) do update set window_start=excluded.window_start,attempts=case when billing_attempts.window_start=excluded.window_start then billing_attempts.attempts+1 else 1 end returning attempts into n;
 if n>30 then raise exception 'billing rate limited';end if;
end $$;
create function private.billing_catalog() returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object('products',(select jsonb_agg(jsonb_build_object('sku',sku,'amount',amount,'days',days,'level',level,'kind',kind) order by amount) from private.billing_products where enabled),
 'topAvailable',4-(select count(*) from generate_series(1,4) as g(slot) where exists(select 1 from private.server_promotions p where p.slot=g.slot and p.kind='top' and p.ends_at>now()) or exists(select 1 from private.billing_orders o where o.slot=g.slot and o.state in('pending','bound','processing') and o.livemode)))
$$;

create function private.billing_reserve(p_user uuid,p_sku text,p_server uuid,p_live boolean,p_wall boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare product private.billing_products; ord private.billing_orders; current private.server_promotions; chosen integer;
begin
 perform pg_advisory_xact_lock(hashtextextended('onyx.billing.inventory',0));
 if exists(select 1 from private.billing_closed where user_id=p_user) then raise exception 'account deletion pending';end if;
 if not exists(select 1 from public.profiles where id=p_user and not is_guest) or exists(select 1 from public.platform_bans where user_id=p_user and lifted_at is null) then raise exception 'registered buyer required' using errcode='42501';end if;
 select * into product from private.billing_products where sku=p_sku and enabled;if not found then raise exception 'invalid product';end if;
 if product.kind='plus' then
  if p_server is not null then raise exception 'invalid server';end if;
  if exists(select 1 from private.billing_legacy_plus where user_id=p_user) or exists(select 1 from private.billing_subscriptions where user_id=p_user and state not in('canceled','incomplete_expired')) then raise exception 'Plus already active';end if;
 else
  perform 1 from public.servers where id=p_server and owner_id=p_user for update;if not found then raise exception 'server owner required' using errcode='42501';end if;
  if not exists(select 1 from public.server_directory d join public.invites i on i.code=d.invite_code and i.server_id=d.server_id where d.server_id=p_server and d.enabled and i.expires_at is null and i.max_uses is null) then raise exception 'list server first';end if;
  select * into current from private.server_promotions where server_id=p_server and ends_at>now() order by ends_at desc limit 1;
  if found then raise exception 'promotion already active';end if;
 end if;
 select * into ord from private.billing_orders where user_id=p_user and sku=p_sku and server_id is not distinct from p_server and livemode=p_live and state in('pending','bound','processing') order by created_at desc limit 1;
 if found then update private.billing_orders set show_supporter=coalesce(p_wall,false) where id=ord.id;ord.show_supporter:=coalesce(p_wall,false);return to_jsonb(ord);end if;
 if exists(select 1 from private.billing_orders o where o.user_id=p_user and o.livemode=p_live and o.state in('pending','bound','processing') and ((product.kind='plus' and o.kind='plus')or(o.server_id=p_server))) then raise exception 'checkout pending';end if;
 if product.kind='top' and p_live then
  chosen:=current.slot;
  if chosen is null then
   select g.slot into chosen from generate_series(1,4) as g(slot) where not exists(select 1 from private.server_promotions p where p.slot=g.slot and p.kind='top' and p.ends_at>now()) and not exists(select 1 from private.billing_orders o where o.slot=g.slot and o.livemode and o.state in('pending','bound','processing')) order by g.slot limit 1;
  end if;
  if chosen is null then raise exception 'top row full';end if;
 end if;
 insert into private.billing_orders(user_id,server_id,sku,amount,days,level,kind,livemode,slot,show_supporter) values(p_user,p_server,p_sku,product.amount,product.days,product.level,product.kind,p_live,chosen,coalesce(p_wall,false)) returning * into ord;
 return to_jsonb(ord);
end $$;

create function private.billing_bind(p_order uuid,p_session text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_session !~ '^cs_(test_|live_)?[A-Za-z0-9]+$' then raise exception 'invalid checkout';end if;
 update private.billing_orders set session_id=p_session,state=case when state='pending' then 'bound' else state end where id=p_order and(session_id is null or session_id=p_session);
 if not found then raise exception 'checkout mismatch';end if;
end $$;

create function private.billing_status(p_user uuid,p_server uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if p_server is not null and not exists(select 1 from public.servers where id=p_server and owner_id=p_user) then raise exception 'server owner required' using errcode='42501';end if;
 return jsonb_build_object('legacy',exists(select 1 from private.billing_legacy_plus where user_id=p_user),'subscription',(select jsonb_build_object('state',state,'until',paid_until,'cancelAtEnd',cancel_at_end) from private.billing_subscriptions where user_id=p_user),
 'category',(select category from public.server_directory where server_id=p_server),'pendingActivation',(select count(*) from private.billing_orders where user_id=p_user and state='processing'),'listed',coalesce((select enabled from public.server_directory where server_id=p_server),false),'promotions',(select coalesce(jsonb_agg(jsonb_build_object('sku',sku,'kind',kind,'endsAt',ends_at)),'[]') from private.server_promotions where server_id=p_server and ends_at>now()));
end $$;

create function private.billing_lookup(p_user uuid,p_order uuid,p_live boolean) returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object('subscription',(select to_jsonb(s) from private.billing_subscriptions s where user_id=p_user and p_live),'order',(select to_jsonb(o) from private.billing_orders o where o.id=p_order and o.user_id=p_user),'creating',exists(select 1 from private.billing_orders where user_id=p_user and livemode=p_live and state='pending' and session_id is null),'pending',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'session',session_id)),'[]') from private.billing_orders where user_id=p_user and livemode=p_live and state in('pending','bound','processing') and session_id is not null))
$$;
create function private.billing_close(p_user uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('onyx.billing.inventory',0));
 insert into private.billing_closed values(p_user) on conflict do nothing;
end $$;

-- Called only by the service handler after fresh Stripe API verification, never by a client.
create function private.billing_complete(p_order uuid,p_session text,p_amount integer,p_currency text,p_live boolean,p_customer text,p_subscription text,p_intent text) returns void language plpgsql security definer set search_path='' as $$
declare ord private.billing_orders; old_end timestamptz;
begin
 perform pg_advisory_xact_lock(hashtextextended('onyx.billing.inventory',0));
 select * into ord from private.billing_orders where id=p_order for update;
 if not found or (ord.session_id is not null and ord.session_id<>p_session) or ord.amount<>p_amount or p_currency<>'eur' or ord.livemode<>p_live then raise exception 'payment mismatch';end if;
 if ord.state='paid' then return;end if;
 if ord.state not in('pending','bound','processing') then raise exception 'checkout no longer open';end if;
 if ord.paid_at is not null and (ord.customer_id is distinct from p_customer or ord.subscription_id is distinct from p_subscription or ord.payment_intent is distinct from p_intent) then raise exception 'payment identity mismatch';end if;
 update private.billing_orders set state='processing',session_id=p_session,paid_at=coalesce(paid_at,now()),customer_id=p_customer,subscription_id=p_subscription,payment_intent=p_intent where id=p_order;
 if exists(select 1 from private.billing_revocations where payment_intent=p_intent) then update private.billing_orders set state='refunded' where id=p_order;return;end if;
 if not p_live then update private.billing_orders set state='paid' where id=p_order;return;end if; -- Test payments never activate production benefits or reserve paid slots.
 begin
 if ord.kind='plus' then
  if p_subscription is null or p_customer is null then raise exception 'subscription required';end if;
  insert into private.billing_subscriptions(user_id,subscription_id,customer_id,state) values(ord.user_id,p_subscription,p_customer,'pending_payment') on conflict(user_id) do update set subscription_id=excluded.subscription_id,customer_id=excluded.customer_id,state='pending_payment',last_event=0;
 else
  if not exists(select 1 from public.servers where id=ord.server_id and owner_id=ord.user_id) then return;end if;
  if not exists(select 1 from public.server_directory where server_id=ord.server_id and enabled) then return;end if;
  select ends_at into old_end from private.server_promotions where server_id=ord.server_id and kind=ord.kind;
  -- Expired rows free their old unique slot only after ownership/purchase validation.
  delete from private.server_promotions where kind='top' and slot=ord.slot and ends_at<=now();
  insert into private.server_promotions(server_id,user_id,kind,sku,level,slot,ends_at,order_id) values(ord.server_id,ord.user_id,ord.kind,ord.sku,ord.level,ord.slot,greatest(coalesce(old_end,now()),now())+make_interval(days=>ord.days),ord.id)
  on conflict(server_id,kind) do update set sku=excluded.sku,level=excluded.level,slot=excluded.slot,ends_at=excluded.ends_at,order_id=excluded.order_id,user_id=excluded.user_id;
 end if;
 exception when others then return;end;
 update private.billing_orders set state='paid' where id=p_order;
end $$;

create function private.billing_subscription(p_order uuid,p_subscription text,p_customer text,p_state text,p_until timestamptz,p_cancel boolean,p_event bigint,p_invoice text,p_intent text) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid; ord private.billing_orders;sub private.billing_subscriptions; first_activation boolean;
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
  if exists(select 1 from private.billing_invoices where invoice_id=p_invoice and refunded) then return;end if;
  update private.billing_subscriptions set paid_until=greatest(coalesce(paid_until,p_until),p_until) where user_id=uid;
 end if;
 update private.billing_subscriptions set state=p_state,cancel_at_end=p_cancel,last_event=p_event where user_id=uid;
 select * into sub from private.billing_subscriptions where user_id=uid;
 if sub.paid_until>now() and p_state not in('canceled','unpaid','incomplete_expired') then
  select plus_since is null into first_activation from public.profiles where id=uid;
  update public.profiles set plus_since=coalesce(plus_since,now()),plus_until=sub.paid_until where id=uid;
  perform private.grant_badge(uid,'supporter');
  if ord.id is null then select * into ord from private.billing_orders where user_id=uid and subscription_id=p_subscription order by created_at limit 1;end if;
  if first_activation then update public.profiles set supporter_wall=ord.show_supporter where id=uid;end if;
 elsif not exists(select 1 from private.billing_legacy_plus where user_id=uid) then
  update public.profiles set plus_since=null,plus_until=null,supporter_wall=false,badges=array_remove(badges,'supporter') where id=uid;
  delete from public.user_badges where user_id=uid and badge='supporter';
 end if;
end $$;

create function private.billing_expire(p_order uuid,p_session text) returns void language sql security definer set search_path='' as $$update private.billing_orders set state='expired' where id=p_order and session_id=p_session and state in('pending','bound') and paid_at is null$$;
create function private.billing_refund(p_intent text) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid; inv private.billing_invoices;
begin
 perform pg_advisory_xact_lock(hashtextextended('onyx.billing.inventory',0));
 insert into private.billing_revocations(payment_intent) values(p_intent) on conflict do nothing;
 update private.billing_orders set state='refunded' where payment_intent=p_intent and state in('paid','processing');
 delete from private.server_promotions where order_id in(select id from private.billing_orders where payment_intent=p_intent and state='refunded');
 select * into inv from private.billing_invoices where payment_intent=p_intent for update;
 if found then
  update private.billing_invoices set refunded=true where invoice_id=inv.invoice_id;
  update private.billing_subscriptions set paid_until=(select max(paid_until) from private.billing_invoices where user_id=inv.user_id and not refunded) where user_id=inv.user_id;
  if not exists(select 1 from private.billing_legacy_plus where user_id=inv.user_id) then
   update public.profiles set plus_until=(select paid_until from private.billing_subscriptions where user_id=inv.user_id) where id=inv.user_id;
   if not exists(select 1 from private.billing_subscriptions where user_id=inv.user_id and paid_until>now()) then update public.profiles set plus_since=null,plus_until=null,supporter_wall=false,badges=array_remove(badges,'supporter') where id=inv.user_id;delete from public.user_badges where user_id=inv.user_id and badge='supporter';end if;
  end if;
 end if;
end $$;
create function private.billing_expire_benefits() returns void language plpgsql security definer set search_path='' as $$
declare ord private.billing_orders;
begin
 for ord in select * from private.billing_orders where state='processing' and paid_at is not null order by paid_at limit 100 loop
  begin perform private.billing_complete(ord.id,ord.session_id,ord.amount,'eur',ord.livemode,ord.customer_id,ord.subscription_id,ord.payment_intent);exception when others then null;end;
 end loop;
 update public.profiles p set plus_since=null,plus_until=null,supporter_wall=false,badges=array_remove(badges,'supporter') from private.billing_subscriptions s where p.id=s.user_id and p.plus_since is not null and (s.paid_until<=now() or s.paid_until is null) and not exists(select 1 from private.billing_legacy_plus where user_id=p.id);
 delete from public.user_badges b using private.billing_subscriptions s where b.user_id=s.user_id and b.badge='supporter' and(s.paid_until<=now() or s.paid_until is null) and not exists(select 1 from private.billing_legacy_plus where user_id=b.user_id);
 delete from private.server_promotions where ends_at<=now();
 delete from private.billing_events where seen_at<now()-interval '35 days';
 delete from private.billing_attempts where window_start<now()-interval '1 day';
end $$;

-- Only service_role may invoke these gateways. Private data stays inaccessible to users/guests.
grant usage on schema private to service_role;
do $$declare proc record; args text;begin
 for proc in select p.oid,p.proname,pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like 'billing_%' loop
  execute format('revoke all on function private.%I(%s) from public,anon,authenticated',proc.proname,proc.args);
  execute format('grant execute on function private.%I(%s) to service_role',proc.proname,proc.args);
 end loop;
end $$;
create function public.billing_gate(p_user uuid) returns void language sql security invoker set search_path='' as $$select private.billing_gate(p_user)$$;
create function public.billing_close(p_user uuid) returns void language sql security invoker set search_path='' as $$select private.billing_close(p_user)$$;
create function public.billing_catalog() returns jsonb language sql security invoker set search_path='' as $$select private.billing_catalog()$$;
create function public.billing_reserve(p_user uuid,p_sku text,p_server uuid,p_live boolean,p_wall boolean default false) returns jsonb language sql security invoker set search_path='' as $$select private.billing_reserve(p_user,p_sku,p_server,p_live,p_wall)$$;
create function public.billing_bind(p_order uuid,p_session text) returns void language sql security invoker set search_path='' as $$select private.billing_bind(p_order,p_session)$$;
create function public.billing_status(p_user uuid,p_server uuid default null) returns jsonb language sql security invoker set search_path='' as $$select private.billing_status(p_user,p_server)$$;
create function public.billing_lookup(p_user uuid,p_order uuid default null,p_live boolean default true) returns jsonb language sql security invoker set search_path='' as $$select private.billing_lookup(p_user,p_order,p_live)$$;
create function public.billing_complete(p_order uuid,p_session text,p_amount integer,p_currency text,p_live boolean,p_customer text,p_subscription text,p_intent text) returns void language sql security invoker set search_path='' as $$select private.billing_complete(p_order,p_session,p_amount,p_currency,p_live,p_customer,p_subscription,p_intent)$$;
create function public.billing_subscription(p_order uuid,p_subscription text,p_customer text,p_state text,p_until timestamptz,p_cancel boolean,p_event bigint,p_invoice text,p_intent text) returns void language sql security invoker set search_path='' as $$select private.billing_subscription(p_order,p_subscription,p_customer,p_state,p_until,p_cancel,p_event,p_invoice,p_intent)$$;
create function public.billing_expire(p_order uuid,p_session text) returns void language sql security invoker set search_path='' as $$select private.billing_expire(p_order,p_session)$$;
create function public.billing_refund(p_intent text) returns void language sql security invoker set search_path='' as $$select private.billing_refund(p_intent)$$;
do $$declare proc record;begin
 for proc in select p.proname,pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'billing_%' loop
  execute format('revoke all on function public.%I(%s) from public,anon,authenticated',proc.proname,proc.args);
  execute format('grant execute on function public.%I(%s) to service_role',proc.proname,proc.args);
 end loop;
end $$;
select cron.schedule('onyx-billing-expiry','*/5 * * * *',$$select private.billing_expire_benefits()$$);

create or replace function private.search_server_directory(p_query text,p_category text,p_offset integer) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform private.directory_session();
 if p_query is null or length(p_query)>100 or p_offset is null or p_offset<0 or p_offset>1000 or(p_category is not null and p_category<>all(array['general','gaming','music','creative','technology','learning'])) then raise exception 'invalid directory search' using errcode='23514';end if;
 with page as materialized(
  select s.id,s.name,s.icon,s.icon_color,s.banner,s.description,s.verified,s.is_official,d.category,i.code,promo.kind as promotion,coalesce(promo.level,0) as boost_level
  from public.server_directory d join public.servers s on s.id=d.server_id join public.invites i on i.code=d.invite_code and i.server_id=s.id
  left join lateral(select p.kind,p.level from private.server_promotions p where p.server_id=s.id and p.user_id=s.owner_id and p.ends_at>now() order by(p.kind='top') desc,p.level desc limit 1) promo on true
  where d.enabled and(p_category is null or d.category=p_category) and i.expires_at is null and i.max_uses is null
   and(p_query='' or strpos(lower(s.name||' '||coalesce(s.description,'')),lower(btrim(p_query)))>0)
   and not exists(select 1 from public.server_bans b where b.server_id=s.id and b.user_id=auth.uid())
   and not exists(select 1 from public.platform_bans b where b.user_id=s.owner_id and b.lifted_at is null)
  order by(promo.kind='top') desc nulls last,coalesce(promo.level,0) desc,s.is_official desc,s.verified desc,lower(s.name),s.id limit 25 offset p_offset
 )select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('members',(select count(*) from public.server_members m where m.server_id=p.id))),'[]'::jsonb) into result from page p;
 return result;
end $$;
