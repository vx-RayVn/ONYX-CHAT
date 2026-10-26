-- Synthetic identities and promotions only. Never calls Stripe or mail. Always rollback.
begin;
set local statement_timeout='15s';set local lock_timeout='2s';
lock table auth.users,public.profiles,private.server_promotions in share row exclusive mode;
create temp table rank_baseline as select last_value from public.member_number_seq;
create temp table rank_results(name text,ok boolean);
insert into auth.users(id,is_anonymous,aud,role,raw_user_meta_data) values('00000000-0035-4000-8000-000000000001',true,'authenticated','authenticated','{"username":"zz_rank_owner"}'),('00000000-0035-4000-8000-000000000002',true,'authenticated','authenticated','{"username":"zz_rank_viewer"}');
update auth.users set is_anonymous=false where id in('00000000-0035-4000-8000-000000000001','00000000-0035-4000-8000-000000000002');
update public.profiles set is_guest=false where id in('00000000-0035-4000-8000-000000000001','00000000-0035-4000-8000-000000000002');
insert into public.servers(id,name,owner_id) values('00000000-0035-4000-8000-000000000011','zz_rank Alpha','00000000-0035-4000-8000-000000000001'),('00000000-0035-4000-8000-000000000012','zz_rank Zero','00000000-0035-4000-8000-000000000001');
insert into public.server_members(server_id,user_id) values('00000000-0035-4000-8000-000000000011','00000000-0035-4000-8000-000000000001');
insert into rank_results select 'new servers are listed',count(*)=2 and bool_and(enabled) from public.server_directory where server_id in('00000000-0035-4000-8000-000000000011','00000000-0035-4000-8000-000000000012');
insert into rank_results select 'zero-member server is discoverable',exists(select 1 from private.directory_entries('00000000-0035-4000-8000-000000000002') where id='00000000-0035-4000-8000-000000000012' and members=0);
insert into rank_results select 'one-member server is discoverable',exists(select 1 from private.directory_entries('00000000-0035-4000-8000-000000000002') where id='00000000-0035-4000-8000-000000000011' and members=1);
select set_config('request.jwt.claims','{"sub":"00000000-0035-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
insert into rank_results select 'status and discovery use the same current rank',(private.billing_status('00000000-0035-4000-8000-000000000001','00000000-0035-4000-8000-000000000012')->>'rank')::bigint=(select(row->>'rank')::bigint from jsonb_array_elements(public.search_server_directory('zz_rank Zero')) row);
do $$declare p record;ord uuid;expected bigint;actual bigint;begin
 for p in select * from private.billing_products where kind in('boost','top') order by level loop
  expected:=(private.billing_status('00000000-0035-4000-8000-000000000001','00000000-0035-4000-8000-000000000012')->'projections'->>p.sku)::bigint;
  insert into private.billing_orders(user_id,server_id,sku,amount,days,level,kind,livemode,state,paid_at) values('00000000-0035-4000-8000-000000000001','00000000-0035-4000-8000-000000000012',p.sku,p.amount,p.days,p.level,p.kind,true,'paid',now()) returning id into ord;
  insert into private.server_promotions(server_id,user_id,kind,sku,level,slot,ends_at,order_id) values('00000000-0035-4000-8000-000000000012','00000000-0035-4000-8000-000000000001',p.kind,p.sku,p.level,case when p.kind='top' then 4 else null end,now()+interval '14 days',ord);
  select (row->>'rank')::bigint into actual from jsonb_array_elements(public.search_server_directory('zz_rank Zero')) row;
  insert into rank_results values('projection matches activated '||p.sku,expected=actual);
  update private.server_promotions set ends_at=now()-interval '1 second' where order_id=ord;
  insert into rank_results select 'expired '||p.sku||' does not affect ordering',not exists(select 1 from private.directory_entries('00000000-0035-4000-8000-000000000001') where id='00000000-0035-4000-8000-000000000012' and promotion is not null);
  delete from private.server_promotions where order_id=ord;
 end loop;
end $$;
select private.save_server_directory('00000000-0035-4000-8000-000000000012',false,'gaming');
insert into rank_results select 'owner opt-out remains off',not exists(select 1 from private.directory_entries('00000000-0035-4000-8000-000000000001') where id='00000000-0035-4000-8000-000000000012');
insert into rank_results select 'unlisted server receives no actual rank',private.billing_status('00000000-0035-4000-8000-000000000001','00000000-0035-4000-8000-000000000012')->>'rank' is null;
insert into rank_results select 'publication preview is available without publishing',(select count(*)=4 from jsonb_object_keys(private.billing_status('00000000-0035-4000-8000-000000000001','00000000-0035-4000-8000-000000000012')->'projections'));
insert into public.server_bans(server_id,user_id) values('00000000-0035-4000-8000-000000000011','00000000-0035-4000-8000-000000000002');
insert into rank_results select 'viewer ban still hides a server',not exists(select 1 from private.directory_entries('00000000-0035-4000-8000-000000000002') where id='00000000-0035-4000-8000-000000000011');
insert into rank_results select 'private rank helpers are not user RPCs',bool_and(not has_function_privilege('anon',p.oid,'EXECUTE') and not has_function_privilege('authenticated',p.oid,'EXECUTE')) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname in('directory_entries','directory_placement','ensure_default_directory');
insert into rank_results select 'membership sequence unchanged',(select last_value from public.member_number_seq)=(select last_value from rank_baseline);
do $$begin assert not exists(select 1 from rank_results where not coalesce(ok,false)),'rank regression failed';end$$;
select jsonb_build_object('passed',count(*)filter(where ok),'total',count(*),'failed',coalesce(jsonb_agg(name)filter(where not ok),'[]')) result from rank_results;
rollback;
