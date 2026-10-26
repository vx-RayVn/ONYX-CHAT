-- Synthetic rows and metadata only. No login or persistent changes.
begin;
create temp table audit_sequence as select last_value,is_called from public.member_number_seq;
create temp table release_security_results(name text,ok boolean,detail text);
create function pg_temp.check_result(p_name text,p_ok boolean,p_detail text default '')returns void language sql as $$insert into release_security_results values(p_name,coalesce(p_ok,false),p_detail)$$;
alter table public.profiles alter column member_number set default 860000001;
insert into auth.users(id,email,aud,role,raw_user_meta_data)values('26262626-2626-4262-8262-262626262601','zz-release-a@onyx.invalid','authenticated','authenticated','{"username":"zz_release_a"}');
alter table public.profiles alter column member_number set default 860000002;
insert into auth.users(id,email,aud,role,raw_user_meta_data)values('26262626-2626-4262-8262-262626262602','zz-release-b@onyx.invalid','authenticated','authenticated','{"username":"zz_release_b"}');
select set_config('request.jwt.claims','{"sub":"26262626-2626-4262-8262-262626262601","role":"authenticated"}',true);
select pg_temp.check_result('Every public application table has RLS',not exists(select from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in('r','p')and not c.relrowsecurity));
select pg_temp.check_result('Every public SECURITY DEFINER has a fixed search path',not exists(select from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and not coalesce(p.proconfig,'{}')@>array['search_path=""']));
select pg_temp.check_result('Membership number is not writable by clients',not has_column_privilege('authenticated','public.profiles','member_number','UPDATE'));
select pg_temp.check_result('Guest status is not writable by clients',not has_column_privilege('authenticated','public.profiles','is_guest','UPDATE'));
select pg_temp.check_result('Plus activation timestamp is not writable by clients',not has_column_privilege('authenticated','public.profiles','plus_since','UPDATE'));
select pg_temp.check_result('Media MIME allowlist and limit are server enforced',exists(select from storage.buckets where id='media' and not('image/svg+xml'=any(allowed_mime_types))and file_size_limit=10485760));
select pg_temp.check_result('Chat attachments are private with a server size limit',exists(select from storage.buckets where id='attachments' and not public and file_size_limit=52428800));
do $$declare denied boolean:=false;begin
 begin set local role authenticated;insert into storage.objects(bucket_id,name,owner_id)values('brand','release-audit-no-image.png',auth.uid()::text);reset role;exception when insufficient_privilege then reset role;denied:=true;end;
 perform pg_temp.check_result('Brand upload is not available to clients',denied);
end $$;
select pg_temp.check_result('Retired Plus purchase is denied to authenticated',not has_function_privilege('authenticated','public.plus_demo_purchase()','execute'));
select pg_temp.check_result('Retired Plus reset is denied to authenticated',not has_function_privilege('authenticated','public.plus_demo_reset()','execute'));
select pg_temp.check_result('Retired Plus APIs are denied to anonymous',not has_function_privilege('anon','public.plus_demo_purchase()','execute')and not has_function_privilege('anon','public.plus_demo_reset()','execute'));
do $$declare denied boolean:=false;begin
 begin set local role authenticated;perform public.plus_demo_purchase();reset role;exception when insufficient_privilege then reset role;denied:=true;end;
 perform pg_temp.check_result('Direct RPC cannot mint Plus',denied);
end $$;
do $$declare denied boolean:=false;begin
 begin set local role authenticated;perform public.plus_demo_reset();reset role;exception when insufficient_privilege then reset role;denied:=true;end;
 perform pg_temp.check_result('Direct RPC cannot reset Plus',denied);
end $$;
select private.hit_rate_limit('release_quota_fixture',3,interval '1 minute');
select pg_temp.check_result('Quota owns its exclusive transaction lock',exists(select from pg_locks where pid=pg_backend_pid()and locktype='advisory'and mode='ExclusiveLock'and granted and classid=((hashtextextended('onyx:rate:26262626-2626-4262-8262-262626262601:release_quota_fixture',0)>>32)&4294967295)::oid and objid=(hashtextextended('onyx:rate:26262626-2626-4262-8262-262626262601:release_quota_fixture',0)&4294967295)::oid and objsubid=1));
select private.hit_rate_limit('release_quota_fixture',3,interval '1 minute');
select private.hit_rate_limit('release_quota_fixture',3,interval '1 minute');
do $$declare denied boolean:=false;begin
 begin perform private.hit_rate_limit('release_quota_fixture',3,interval '1 minute');exception when raise_exception then denied:=sqlerrm like 'rate limited:%';end;
 perform pg_temp.check_result('Quota rejects the request after its limit',denied);
end $$;
select pg_temp.check_result('Failed requests do not add quota rows',(select count(*)=3 from private.rate_events where user_id=auth.uid()and kind='release_quota_fixture'));
select private.hit_rate_limit('release_second_kind',1,interval '1 minute');
select pg_temp.check_result('Different quota kinds are independent',exists(select from private.rate_events where user_id=auth.uid()and kind='release_second_kind'));
insert into private.rate_events(user_id,kind,at)values(auth.uid(),'release_expiry_fixture',now()-interval '2 days'),('26262626-2626-4262-8262-262626262602','release_expiry_fixture',now()-interval '2 days');
select private.hit_rate_limit('release_expiry_fixture',2,interval '1 minute');
select pg_temp.check_result('Request path prunes its own expired rows',not exists(select from private.rate_events where user_id=auth.uid()and kind='release_expiry_fixture'and at<now()-interval '1 day'));
select pg_temp.check_result('Request path does not scan/delete other account logs',exists(select from private.rate_events where user_id='26262626-2626-4262-8262-262626262602'and kind='release_expiry_fixture'and at<now()-interval '1 day'));
select pg_temp.check_result('Quota expiry cleanup is unavailable to clients',coalesce(not has_function_privilege('authenticated',to_regprocedure('private.cleanup_rate_events()'),'execute'),false));
select pg_temp.check_result('Quota expiry index exists',exists(select from pg_indexes where schemaname='private'and indexname='rate_events_expiry_idx'));
select pg_temp.check_result('Composite tag FK is indexed',exists(select from pg_indexes where schemaname='public'and indexname='profile_tags_server_user_idx'));
select pg_temp.check_result('Real membership sequence is untouched',(select s.last_value=b.last_value and s.is_called=b.is_called from public.member_number_seq s cross join audit_sequence b));
select count(*)total,count(*)filter(where ok)passed,jsonb_agg(jsonb_build_object('name',name,'detail',detail))filter(where not ok)failed from release_security_results;
rollback;
