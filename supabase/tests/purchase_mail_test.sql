-- Synthetic guest/order/outbox fixtures only, always rolled back. No provider call.
begin;
set local statement_timeout='15s';set local lock_timeout='2s';
lock table auth.users,public.profiles,private.commerce_mail in share row exclusive mode;
create temp table mail_style_baseline as select (select last_value from public.member_number_seq) sequence,(select count(*) from public.profiles) profiles,(select count(*) from private.billing_orders) orders;
create temp table mail_style_results(name text,ok boolean);
do $$begin assert(select count(*)=0 from private.commerce_mail),'Only run when the real outbox is empty';end $$;
insert into auth.users(id,is_anonymous,aud,role,raw_user_meta_data) values('00000000-0035-4000-8000-000000000099',true,'authenticated','authenticated','{"username":"zz_mail_style_fixture"}');
insert into private.billing_orders(id,user_id,sku,amount,days,level,kind,livemode,state,paid_at,terms_hash,terms_text)
select ('00000000-0035-4000-8000-'||lpad(row_number()over(order by sku)::text,12,'0'))::uuid,'00000000-0035-4000-8000-000000000099',sku,amount,days,level,kind,true,'paid','2026-10-25 11:39:54.678123+00',encode(extensions.digest(repeat('Synthetic accepted terms — 日本語 & <example>.',6)||E'\n','sha256'),'hex'),repeat('Synthetic accepted terms — 日本語 & <example>.',6)||E'\n' from private.billing_products;
do $$declare item record;begin for item in select id from private.billing_orders where user_id='00000000-0035-4000-8000-000000000099' loop perform private.commerce_purchase_receipt(item.id,'buyer@example.invalid');perform private.commerce_purchase_receipt(item.id,'buyer@example.invalid');end loop;end $$;
insert into mail_style_results values
 ('new receipts pin version one',(select count(*)=5 and bool_and(mail_format=1) from private.commerce_mail)),
 ('purchase retry enqueues once',(select count(*)=5 from private.commerce_mail));
insert into mail_style_results select 'legacy worker cannot claim styled receipts',private.commerce_mail_lease(null)='[]'::jsonb;
select private.commerce_notice_accept('00000000-0035-4000-8000-000000000098',repeat('a',64),repeat('b',64),repeat('c',64),'{"id":"00000000-0035-4000-8000-000000000098","kind":"withdraw","email":"consumer@example.invalid"}','Synthetic declaration receipt',now());
insert into mail_style_results select 'declaration format stays unchanged',count(*)=2 and bool_and(mail_format=0) from private.commerce_mail where notice_id='00000000-0035-4000-8000-000000000098';
insert into mail_style_results select 'legacy worker retains declaration delivery',jsonb_array_length(private.commerce_mail_lease('00000000-0035-4000-8000-000000000098'))=2;
create temp table styled_lease as select value row from jsonb_array_elements(private.commerce_mail_lease_v1(null));
insert into mail_style_results select 'current lease includes all five pinned receipts',count(*)=5 and bool_and((row->>'mail_format')::integer=1) from styled_lease;
insert into mail_style_results select 'active leases are not issued twice',private.commerce_mail_lease_v1(null)='[]'::jsonb;
insert into mail_style_results select 'lease preserves immutable stored text',bool_and(row->>'text'=m.body and row->>'subject'=m.subject) from styled_lease join private.commerce_mail m on m.id=(row->>'id')::uuid;
select private.commerce_mail_finish((row->>'id')::uuid,(row->>'lease')::uuid,false) from styled_lease;
insert into mail_style_results select 'failed sends keep version one and backoff',bool_and(mail_format=1 and state='pending' and next_attempt>now()) from private.commerce_mail where order_id is not null;
update private.commerce_mail set next_attempt=now() where order_id is not null;
create temp table styled_retry as select value row from jsonb_array_elements(private.commerce_mail_lease_v1(null));
insert into mail_style_results select 'retry has the same content and rendering version',count(*)=5 and bool_and(a.row->>'text'=b.row->>'text' and a.row->>'mail_format'=b.row->>'mail_format') from styled_lease a join styled_retry b on a.row->>'id'=b.row->>'id';
insert into mail_style_results select 'private service gateway permissions',bool_and(not has_function_privilege('anon',p.oid,'EXECUTE') and not has_function_privilege('authenticated',p.oid,'EXECUTE') and has_function_privilege('service_role',p.oid,'EXECUTE')) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private') and p.proname='commerce_mail_lease_v1';
insert into mail_style_results select 'outbox is private with RLS',(select relrowsecurity from pg_class where oid='private.commerce_mail'::regclass) and not has_table_privilege('anon','private.commerce_mail','SELECT') and not has_table_privilege('authenticated','private.commerce_mail','SELECT');
insert into mail_style_results select 'membership sequence unchanged',(select last_value from public.member_number_seq)=(select sequence from mail_style_baseline);
do $$begin assert not exists(select 1 from mail_style_results where not coalesce(ok,false)),'mail style check failed';end $$;
select jsonb_build_object('passed',(select count(*) from mail_style_results),'failed',(select jsonb_agg(name) from mail_style_results where not ok),'receipts',(select jsonb_agg(jsonb_build_object('mail_format',1,'subject',subject,'text',body)) from private.commerce_mail where order_id is not null)) result;
rollback;
