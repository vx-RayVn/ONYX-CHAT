-- Synthetic SQL-only identities; no signup, mail, real session or membership number.
begin;
create temp table directory_results(name text,ok boolean) on commit drop;
grant all on directory_results to authenticated,anon;
create function pg_temp.check_directory(label text,who uuid,statement text,expected text,as_role text default 'authenticated') returns void language plpgsql as $$
declare value text;
begin
 begin
  perform set_config('request.jwt.claims',json_build_object('sub',who,'role',as_role,'aal','aal1')::text,true);
  execute format('set local role %I',as_role);execute statement into value;
  reset role;perform set_config('request.jwt.claims','',true);
  insert into directory_results values(label,expected='ok' or value is not distinct from expected);
 exception when others then
  reset role;perform set_config('request.jwt.claims','',true);
  insert into directory_results values(label,expected like 'error:%' and sqlerrm ilike '%'||substr(expected,7)||'%');
 end;
end $$;
insert into auth.users(id,is_anonymous,aud,role,raw_user_meta_data) values
 ('00000000-0031-4000-8000-000000000001',true,'authenticated','authenticated','{"username":"zz_directory_owner"}'),
 ('00000000-0031-4000-8000-000000000002',true,'authenticated','authenticated','{"username":"zz_directory_viewer"}'),
 ('00000000-0031-4000-8000-000000000003',true,'authenticated','authenticated','{"username":"zz_directory_guest"}');
update auth.users set is_anonymous=false where id in ('00000000-0031-4000-8000-000000000001','00000000-0031-4000-8000-000000000002');
update public.profiles set is_guest=false where id in ('00000000-0031-4000-8000-000000000001','00000000-0031-4000-8000-000000000002');
insert into public.servers(id,name,owner_id,description) values
 ('00000000-0031-4000-8000-000000000011','zz_directory listed','00000000-0031-4000-8000-000000000001','Synthetic test'),
 ('00000000-0031-4000-8000-000000000012','zz_directory private','00000000-0031-4000-8000-000000000001','Private test');
insert into public.server_members(server_id,user_id) values('00000000-0031-4000-8000-000000000011','00000000-0031-4000-8000-000000000001');
select pg_temp.check_directory('anon denied',null,$q$select public.search_server_directory()::text$q$,'error:permission denied','anon');
select pg_temp.check_directory('null identity denied',null,$q$select public.search_server_directory()::text$q$,'error:account session required');
select pg_temp.check_directory('guest denied','00000000-0031-4000-8000-000000000003',$q$select public.search_server_directory()::text$q$,'error:registration_required');
select pg_temp.check_directory('listed automatically by default','00000000-0031-4000-8000-000000000002',$q$select jsonb_array_length(public.search_server_directory('zz_directory'))::text$q$,'2');
select pg_temp.check_directory('owner can opt out','00000000-0031-4000-8000-000000000001',$q$select public.save_server_directory('00000000-0031-4000-8000-000000000012',false,'general')$q$,'ok');
select pg_temp.check_directory('nonowner cannot publish','00000000-0031-4000-8000-000000000002',$q$select public.save_server_directory('00000000-0031-4000-8000-000000000011',true,'gaming')$q$,'error:server owner required');
select pg_temp.check_directory('owner publishes','00000000-0031-4000-8000-000000000001',$q$select public.save_server_directory('00000000-0031-4000-8000-000000000011',true,'gaming')$q$,'ok');
select pg_temp.check_directory('only opted-in server','00000000-0031-4000-8000-000000000002',$q$select jsonb_array_length(public.search_server_directory('zz_directory'))::text$q$,'1');
select pg_temp.check_directory('category matching','00000000-0031-4000-8000-000000000002',$q$select jsonb_array_length(public.search_server_directory('zz_directory','gaming'))::text$q$,'1');
select pg_temp.check_directory('category filtering','00000000-0031-4000-8000-000000000002',$q$select jsonb_array_length(public.search_server_directory('zz_directory','music'))::text$q$,'0');
select pg_temp.check_directory('case insensitive','00000000-0031-4000-8000-000000000002',$q$select jsonb_array_length(public.search_server_directory('ZZ_DIRECTORY LISTED'))::text$q$,'1');
select pg_temp.check_directory('literal wildcard','00000000-0031-4000-8000-000000000002',$q$select jsonb_array_length(public.search_server_directory('%zz_directory%'))::text$q$,'0');
select pg_temp.check_directory('no private structure','00000000-0031-4000-8000-000000000002',$q$select ((public.search_server_directory('zz_directory')->0) ?| array['owner_id','channels','member_ids','messages'])::text$q$,'false');
select pg_temp.check_directory('no foreign settings rows','00000000-0031-4000-8000-000000000002',$q$select count(*)::text from public.server_directory where server_id='00000000-0031-4000-8000-000000000011'$q$,'0');
select pg_temp.check_directory('owner settings visible','00000000-0031-4000-8000-000000000001',$q$select count(*)::text from public.server_directory where server_id='00000000-0031-4000-8000-000000000011'$q$,'1');
select pg_temp.check_directory('no direct publication','00000000-0031-4000-8000-000000000002',$q$insert into public.server_directory(server_id,created_by,enabled,category) values('00000000-0031-4000-8000-000000000012','00000000-0031-4000-8000-000000000002',true,'general') returning server_id$q$,'error:permission denied');
select pg_temp.check_directory('invalid category','00000000-0031-4000-8000-000000000001',$q$select public.save_server_directory('00000000-0031-4000-8000-000000000011',true,'invalid')$q$,'error:invalid directory settings');
select pg_temp.check_directory('bounded query','00000000-0031-4000-8000-000000000002',$q$select public.search_server_directory(repeat('a',101))$q$,'error:invalid directory search');
select pg_temp.check_directory('bounded offset','00000000-0031-4000-8000-000000000002',$q$select public.search_server_directory('',null,1001)$q$,'error:invalid directory search');
select pg_temp.check_directory('join uses guarded invite','00000000-0031-4000-8000-000000000002',$q$select public.join_server_by_invite(public.search_server_directory('zz_directory')->0->>'code')::text$q$,'00000000-0031-4000-8000-000000000011');
insert into public.server_bans(server_id,user_id,banned_by) values('00000000-0031-4000-8000-000000000011','00000000-0031-4000-8000-000000000002','00000000-0031-4000-8000-000000000001');
select pg_temp.check_directory('banned server hidden','00000000-0031-4000-8000-000000000002',$q$select jsonb_array_length(public.search_server_directory('zz_directory'))::text$q$,'0');
select pg_temp.check_directory('owner can unpublish','00000000-0031-4000-8000-000000000001',$q$select public.save_server_directory('00000000-0031-4000-8000-000000000011',false,'gaming')$q$,'ok');
select pg_temp.check_directory('unpublish takes effect','00000000-0031-4000-8000-000000000001',$q$select jsonb_array_length(public.search_server_directory('zz_directory'))::text$q$,'0');
select pg_temp.check_directory('expired session rejected','00000000-0031-4000-8000-000000000002',$q$with jwt as materialized(select set_config('request.jwt.claims','{"sub":"00000000-0031-4000-8000-000000000002","role":"authenticated","session_id":"00000000-0031-4000-8000-000000000099","aal":"aal1"}',true)) select public.search_server_directory() from jwt$q$,'error:account session required');
insert into public.platform_bans(user_id) values('00000000-0031-4000-8000-000000000002');
select pg_temp.check_directory('suspended viewer rejected','00000000-0031-4000-8000-000000000002',$q$select public.search_server_directory()$q$,'error:account session required');
select pg_temp.check_directory('guest cannot publish','00000000-0031-4000-8000-000000000003',$q$select public.save_server_directory('00000000-0031-4000-8000-000000000011',true,'gaming')$q$,'error:registration_required');
select pg_temp.check_directory('owner republishes','00000000-0031-4000-8000-000000000001',$q$select public.save_server_directory('00000000-0031-4000-8000-000000000011',true,'gaming')$q$,'ok');
insert into public.platform_bans(user_id) values('00000000-0031-4000-8000-000000000001');
-- Owner suspension hides the listing from other registered accounts too.
delete from public.platform_bans where user_id='00000000-0031-4000-8000-000000000002';
select pg_temp.check_directory('suspended owners not listed','00000000-0031-4000-8000-000000000002',$q$select jsonb_array_length(public.search_server_directory('zz_directory'))::text$q$,'0');
select pg_temp.check_directory('suspended owner cannot edit','00000000-0031-4000-8000-000000000001',$q$select public.save_server_directory('00000000-0031-4000-8000-000000000011',false,'gaming')$q$,'error:account session required');
select jsonb_build_object('passed',count(*) filter(where ok),'total',count(*),'failed',coalesce(jsonb_agg(name) filter(where not ok),'[]')) as result from directory_results;
rollback;
