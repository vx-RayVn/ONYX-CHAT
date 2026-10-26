-- Synthetic Auth records only; no password, TOTP secret, login or persistent account.
begin;
create temp table security_sequence_baseline as select last_value from public.member_number_seq;
create temp table t_res(n serial,name text,ok boolean,detail text) on commit drop;
grant all on t_res to authenticated,anon,service_role;
grant usage on sequence t_res_n_seq to authenticated,anon,service_role;
create function pg_temp.t(p_name text,p_user uuid,p_session uuid,p_aal text,p_sql text,p_expect text,p_role text default 'authenticated',p_hook boolean default true) returns void language plpgsql as $$declare v text;begin
 begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'role',p_role,'session_id',p_session,'aal',p_aal,'user_metadata',jsonb_build_object('aal','aal2'))::text,true);
  execute format('set local role %I',p_role);
  if p_hook then perform public.check_account_request();end if;
  execute p_sql into v;
  reset role;perform set_config('request.jwt.claims','',true);
  insert into t_res(name,ok,detail)values(p_name,p_expect='ok' or(p_expect like '=%' and v is not distinct from substr(p_expect,2)),coalesce(v,'null'));
 exception when others then
  reset role;perform set_config('request.jwt.claims','',true);
  insert into t_res(name,ok,detail)values(p_name,p_expect<>'ok' and p_expect not like '=%' and sqlerrm ilike '%'||p_expect||'%',sqlerrm);
 end;
end $$;
alter table public.profiles alter column member_number set default 900000001;
insert into auth.users(id,email,aud,role,raw_user_meta_data)values('00000000-0000-4000-8000-0000000000b1','zz-bug1@onyx.invalid','authenticated','authenticated','{"username":"zz_bug1"}');
alter table public.profiles alter column member_number set default 900000002;
insert into auth.users(id,email,aud,role,raw_user_meta_data)values('00000000-0000-4000-8000-0000000000b2','zz-bug2@onyx.invalid','authenticated','authenticated','{"username":"zz_bug2"}');
alter table public.profiles alter column member_number set default 900000003;
insert into auth.users(id,email,aud,role,raw_user_meta_data)values('00000000-0000-4000-8000-0000000000b3','zz-bug3@onyx.invalid','authenticated','authenticated','{"username":"zz_bug3"}');
alter table public.profiles alter column member_number set default nextval('public.member_number_seq'::regclass);

insert into auth.sessions(id,user_id,created_at,updated_at,aal)values('15151515-1515-4151-8151-151515151501','00000000-0000-4000-8000-0000000000b1',now(),now(),'aal1'),('15151515-1515-4151-8151-151515151502','00000000-0000-4000-8000-0000000000b2',now(),now(),'aal1');
insert into auth.sessions(id,user_id,created_at,updated_at,aal,not_after)values('15151515-1515-4151-8151-151515151503','00000000-0000-4000-8000-0000000000b1',now(),now(),'aal2',now()-interval '1 minute');

select pg_temp.t('ordinary signed-in session is allowed','00000000-0000-4000-8000-0000000000b1','15151515-1515-4151-8151-151515151501','aal1',$q$select (private.own_session_state()='ready')::text$q$,'=true','authenticated',true);
select pg_temp.t('anonymous public invitation lookup remains available',null,null,'aal1',$q$select (public.invite_preview('unknown-fixture') is null)::text$q$,'=true','anon',true);
select pg_temp.t('anonymous cannot inspect own-session helper',null,null,'aal1',$q$select private.own_session_state()$q$,'permission denied','anon',true);
select pg_temp.t('authenticated cannot supply an arbitrary actor','00000000-0000-4000-8000-0000000000b1','15151515-1515-4151-8151-151515151501','aal1',$q$select public.account_session_check('00000000-0000-4000-8000-0000000000b2','15151515-1515-4151-8151-151515151502','aal2')$q$,'permission denied','authenticated',true);
select pg_temp.t('private arbitrary-actor helper is not callable','00000000-0000-4000-8000-0000000000b1','15151515-1515-4151-8151-151515151501','aal1',$q$select private.account_session_state('00000000-0000-4000-8000-0000000000b2','15151515-1515-4151-8151-151515151502','aal2')$q$,'permission denied','authenticated',true);
select pg_temp.t('another account session cannot be used','00000000-0000-4000-8000-0000000000b1','15151515-1515-4151-8151-151515151502','aal1',$q$select true::text$q$,'session_expired','authenticated',true);
select pg_temp.t('expired AAL2 session is rejected','00000000-0000-4000-8000-0000000000b1','15151515-1515-4151-8151-151515151503','aal2',$q$select true::text$q$,'session_expired','authenticated',true);
insert into auth.mfa_factors(id,user_id,friendly_name,factor_type,status,created_at,updated_at)values('15151515-1515-4151-8151-151515151510','00000000-0000-4000-8000-0000000000b1','Rollback authenticator','totp','unverified',now(),now());
select pg_temp.t('unverified enrollment does not enable MFA','00000000-0000-4000-8000-0000000000b1','15151515-1515-4151-8151-151515151501','aal1',$q$select (private.own_session_state()='ready')::text$q$,'=true','authenticated',true);
update auth.mfa_factors set status='verified' where id='15151515-1515-4151-8151-151515151510';
select pg_temp.t('verified factor requires AAL2','00000000-0000-4000-8000-0000000000b1','15151515-1515-4151-8151-151515151501','aal1',$q$select true::text$q$,'mfa_required','authenticated',true);
select pg_temp.t('missing AAL cannot bypass a verified factor','00000000-0000-4000-8000-0000000000b1','15151515-1515-4151-8151-151515151501',null,$q$select true::text$q$,'mfa_required','authenticated',true);
select pg_temp.t('unknown AAL cannot bypass a verified factor','00000000-0000-4000-8000-0000000000b1','15151515-1515-4151-8151-151515151501','aal3',$q$select true::text$q$,'mfa_required','authenticated',true);
select pg_temp.t('an AAL2 session passes the API hook','00000000-0000-4000-8000-0000000000b1','15151515-1515-4151-8151-151515151501','aal2',$q$select (private.own_session_state()='ready')::text$q$,'=true','authenticated',true);
select pg_temp.t('another account without MFA still works','00000000-0000-4000-8000-0000000000b2','15151515-1515-4151-8151-151515151502','aal1',$q$select (private.own_session_state()='ready')::text$q$,'=true','authenticated',true);
select pg_temp.t('RLS blocks public table reads even without API hook','00000000-0000-4000-8000-0000000000b1','15151515-1515-4151-8151-151515151501','aal1',$q$select (count(*)=0)::text from public.profiles$q$,'=true','authenticated',false);
select pg_temp.t('RLS blocks private settings reads even without API hook','00000000-0000-4000-8000-0000000000b1','15151515-1515-4151-8151-151515151501','aal1',$q$select (count(*)=0)::text from public.activity_settings$q$,'=true','authenticated',false);
select pg_temp.t('API hook blocks SECURITY DEFINER membership RPC','00000000-0000-4000-8000-0000000000b1','15151515-1515-4151-8151-151515151501','aal1',$q$select public.ensure_official_server()::text$q$,'mfa_required','authenticated',true);
select pg_temp.t('AAL2 membership RPC works','00000000-0000-4000-8000-0000000000b1','15151515-1515-4151-8151-151515151501','aal2',$q$select (public.ensure_official_server() is not null)::text$q$,'=true','authenticated',true);
select pg_temp.t('AAL2 reads preserve own profile','00000000-0000-4000-8000-0000000000b1','15151515-1515-4151-8151-151515151501','aal2',$q$select (count(*)=1)::text from public.profiles where id='00000000-0000-4000-8000-0000000000b1'$q$,'=true','authenticated',true);
select pg_temp.t('service-role guard rejects first factor only',null,null,'aal1',$q$select public.account_session_check('00000000-0000-4000-8000-0000000000b1','15151515-1515-4151-8151-151515151501','aal1')::text$q$,'=false','service_role',true);
select pg_temp.t('service-role guard allows verified session',null,null,'aal1',$q$select public.account_session_check('00000000-0000-4000-8000-0000000000b1','15151515-1515-4151-8151-151515151501','aal2')::text$q$,'=true','service_role',true);
select pg_temp.t('service-role guard requires a session ID',null,null,'aal1',$q$select public.account_session_check('00000000-0000-4000-8000-0000000000b1',null,'aal2')::text$q$,'=false','service_role',true);
select pg_temp.t('service-role guard rejects mismatched session owner',null,null,'aal1',$q$select public.account_session_check('00000000-0000-4000-8000-0000000000b1','15151515-1515-4151-8151-151515151502','aal2')::text$q$,'=false','service_role',true);
select pg_temp.t('service-role guard rejects expired strong sessions',null,null,'aal1',$q$select public.account_session_check('00000000-0000-4000-8000-0000000000b1','15151515-1515-4151-8151-151515151503','aal2')::text$q$,'=false','service_role',true);
delete from auth.mfa_factors where id='15151515-1515-4151-8151-151515151510';
select pg_temp.t('removing final verified factor restores password-only access','00000000-0000-4000-8000-0000000000b1','15151515-1515-4151-8151-151515151501','aal1',$q$select (private.own_session_state()='ready')::text$q$,'=true','authenticated',true);
delete from auth.sessions where id='15151515-1515-4151-8151-151515151501';
select pg_temp.t('revoked session loses API access immediately','00000000-0000-4000-8000-0000000000b1','15151515-1515-4151-8151-151515151501','aal2',$q$select true::text$q$,'session_expired','authenticated',true);
select pg_temp.t('revoked session loses RLS access immediately','00000000-0000-4000-8000-0000000000b1','15151515-1515-4151-8151-151515151501','aal2',$q$select (count(*)=0)::text from public.profiles$q$,'=true','authenticated',false);
select pg_temp.t('service-role guard rejects revoked tokens too',null,null,'aal1',$q$select public.account_session_check('00000000-0000-4000-8000-0000000000b1','15151515-1515-4151-8151-151515151501','aal2')::text$q$,'=false','service_role',true);
insert into t_res(name,ok)select 'all public app tables have the restrictive gate',not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity and not exists(select 1 from pg_policy p where p.polrelid=c.oid and p.polname='onyx: verified account session' and not p.polpermissive));
insert into t_res(name,ok)select 'Storage and Realtime gates are restrictive',count(*)=2 from pg_policies where schemaname in('storage','realtime') and policyname='onyx: verified account session' and permissive='RESTRICTIVE';
insert into t_res(name,ok)select 'API pre-request hook is configured',exists(select 1 from pg_roles where rolname='authenticator' and rolconfig @> array['pgrst.db_pre_request=public.check_account_request']);
insert into t_res(name,ok)select 'member sequence is unchanged',s.last_value=b.last_value from public.member_number_seq s cross join security_sequence_baseline b;
select count(*) total,count(*)filter(where ok)passed,jsonb_agg(jsonb_build_object('name',name,'detail',detail))filter(where not ok)failed from t_res;
rollback;
