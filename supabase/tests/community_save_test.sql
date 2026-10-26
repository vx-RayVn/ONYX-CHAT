-- Live schema and actual authenticated column privileges; no persistent test users.
begin;
create temp table t_res(n serial,name text,ok boolean,detail text) on commit drop;
grant all on t_res to authenticated,anon;
grant usage on sequence t_res_n_seq to authenticated,anon;
create temp table saved_seq as select last_value,is_called from public.member_number_seq;
create function pg_temp.t(p_name text,p_user uuid,p_sql text,p_expect text,p_role text default 'authenticated') returns void
language plpgsql as $$ declare v text; begin
 begin
  perform set_config('request.jwt.claims',case when p_user is null then '' else json_build_object('sub',p_user,'role',p_role)::text end,true);
  execute format('set local role %I',p_role);
  execute p_sql into v;
  reset role; perform set_config('request.jwt.claims','',true);
  insert into t_res(name,ok,detail) values(p_name,p_expect='ok' or (p_expect like '=%' and v is not distinct from substr(p_expect,2)),coalesce(v,'null'));
 exception when others then
  reset role; perform set_config('request.jwt.claims','',true);
  insert into t_res(name,ok,detail) values(p_name,p_expect<>'ok' and p_expect not like '=%' and sqlerrm ilike '%'||p_expect||'%',sqlerrm);
 end;
end $$;
insert into auth.users(id,email,aud,role,raw_user_meta_data) values
 ('00000000-0000-4000-8000-0000000000f1','zz-save1@onyx.invalid','authenticated','authenticated','{"username":"zz_save1"}'),
 ('00000000-0000-4000-8000-0000000000f2','zz-save2@onyx.invalid','authenticated','authenticated','{"username":"zz_save2"}');
select setval('public.member_number_seq',last_value,is_called) from saved_seq;
insert into private.platform_admins(user_id) values('00000000-0000-4000-8000-0000000000f1');
insert into public.servers(id,owner_id,name) values
 ('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000f1','Tag save one'),
 ('00000000-0000-4000-8000-0000000000a2','00000000-0000-4000-8000-0000000000f1','Tag save two');
insert into public.server_members(server_id,user_id) values
 ('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000f1'),
 ('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000f2'),
 ('00000000-0000-4000-8000-0000000000a2','00000000-0000-4000-8000-0000000000f1');
select pg_temp.t('anonymous cannot save',null,$q$select public.save_server_tag('00000000-0000-4000-8000-0000000000a1','SAME')$q$,'permission denied','anon');
select pg_temp.t('member cannot configure','00000000-0000-4000-8000-0000000000f2',$q$select public.save_server_tag('00000000-0000-4000-8000-0000000000a1','SAME')$q$,'permission denied');
select pg_temp.t('owner first save returns row','00000000-0000-4000-8000-0000000000f1',$q$select (public.save_server_tag('00000000-0000-4000-8000-0000000000a1','SAME')).label$q$,'=SAME');
select pg_temp.t('stale cache repeated save updates','00000000-0000-4000-8000-0000000000f1',$q$select (public.save_server_tag('00000000-0000-4000-8000-0000000000a1','NEW')).label$q$,'=NEW');
select pg_temp.t('tag can change back','00000000-0000-4000-8000-0000000000f1',$q$select (public.save_server_tag('00000000-0000-4000-8000-0000000000a1','SAME')).label$q$,'=SAME');
select pg_temp.t('one permanent invitation after repeated saves','00000000-0000-4000-8000-0000000000f1',$q$select (count(*)=1 and bool_and(expires_at is null and max_uses is null and uses=0))::text from public.invites where server_id='00000000-0000-4000-8000-0000000000a1'$q$,'=true');
select pg_temp.t('same label on second server','00000000-0000-4000-8000-0000000000f1',$q$select (public.save_server_tag('00000000-0000-4000-8000-0000000000a2','SAME')).label$q$,'=SAME');
select pg_temp.t('both servers keep same label','00000000-0000-4000-8000-0000000000f1',$q$select count(*)::text from public.server_tags where server_id in ('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000a2') and label='SAME'$q$,'=2');
select pg_temp.t('member selects tag','00000000-0000-4000-8000-0000000000f2',$q$insert into public.profile_tags(user_id,server_id) values('00000000-0000-4000-8000-0000000000f2','00000000-0000-4000-8000-0000000000a1') returning user_id::text$q$,'=00000000-0000-4000-8000-0000000000f2');
select pg_temp.t('unchanged save preserves selection','00000000-0000-4000-8000-0000000000f1',$q$select (public.save_server_tag('00000000-0000-4000-8000-0000000000a1','SAME')).enabled::text$q$,'=true');
select pg_temp.t('selection retained','00000000-0000-4000-8000-0000000000f2',$q$select count(*)::text from public.profile_tags where user_id=auth.uid()$q$,'=1');
select pg_temp.t('disabling succeeds','00000000-0000-4000-8000-0000000000f1',$q$select (public.save_server_tag('00000000-0000-4000-8000-0000000000a1','SAME',null,false)).enabled::text$q$,'=false');
select pg_temp.t('disabled selection cleared','00000000-0000-4000-8000-0000000000f2',$q$select count(*)::text from public.profile_tags where user_id=auth.uid()$q$,'=0');
select pg_temp.t('label length enforced','00000000-0000-4000-8000-0000000000f1',$q$select public.save_server_tag('00000000-0000-4000-8000-0000000000a1','TOOLONG')$q$,'check constraint');
select pg_temp.t('whitespace enforced','00000000-0000-4000-8000-0000000000f1',$q$select public.save_server_tag('00000000-0000-4000-8000-0000000000a1','A B')$q$,'check constraint');
select pg_temp.t('image safety enforced','00000000-0000-4000-8000-0000000000f1',$q$select public.save_server_tag('00000000-0000-4000-8000-0000000000a1','SAME','https://invalid.test/tracker.svg')$q$,'check constraint');
select pg_temp.t('admin badge acknowledgement matches full row','00000000-0000-4000-8000-0000000000f1',$q$with x as(update public.badge_catalog set name='Shared name',description='Regression',edited_by=auth.uid() where id='verified' returning *)select (name='Shared name' and customized and edited_by=auth.uid())::text from x$q$,'=true');
select pg_temp.t('official badge names need not be unique','00000000-0000-4000-8000-0000000000f1',$q$with x as(update public.badge_catalog set name='Shared name',edited_by=auth.uid() where id='founder' returning *)select (name='Shared name')::text from x$q$,'=true');
select pg_temp.t('non admin cannot edit official badge','00000000-0000-4000-8000-0000000000f2',$q$with x as(update public.badge_catalog set name='Forged' where id='verified' returning *)select count(*)::text from x$q$,'=0');
select pg_temp.t('anonymous cannot choose',null,$q$select public.choose_server_tag('00000000-0000-4000-8000-0000000000a2')$q$,'permission denied','anon');
select pg_temp.t('outsider cannot choose','00000000-0000-4000-8000-0000000000f2',$q$select public.choose_server_tag('00000000-0000-4000-8000-0000000000a2')$q$,'foreign key');
select pg_temp.t('disabled tag cannot be chosen','00000000-0000-4000-8000-0000000000f2',$q$select public.choose_server_tag('00000000-0000-4000-8000-0000000000a1')$q$,'row-level security');
select pg_temp.t('owner re-enables tag','00000000-0000-4000-8000-0000000000f1',$q$select (public.save_server_tag('00000000-0000-4000-8000-0000000000a1','SAME')).enabled::text$q$,'=true');
select pg_temp.t('member first choice returns server','00000000-0000-4000-8000-0000000000f2',$q$select public.choose_server_tag('00000000-0000-4000-8000-0000000000a1')::text$q$,'=00000000-0000-4000-8000-0000000000a1');
select pg_temp.t('repeated choice needs no identity update grant','00000000-0000-4000-8000-0000000000f2',$q$select public.choose_server_tag('00000000-0000-4000-8000-0000000000a1')::text$q$,'=00000000-0000-4000-8000-0000000000a1');
select pg_temp.t('member removes own tag','00000000-0000-4000-8000-0000000000f2',$q$select (public.choose_server_tag(null) is null)::text$q$,'=true');
select pg_temp.t('removed choice is gone','00000000-0000-4000-8000-0000000000f2',$q$select count(*)::text from public.profile_tags where user_id=auth.uid()$q$,'=0');
select pg_temp.t('actor identity stays protected','00000000-0000-4000-8000-0000000000f2',$q$update public.profile_tags set user_id='00000000-0000-4000-8000-0000000000f1' returning user_id::text$q$,'permission denied');
insert into public.servers(id,owner_id,name) values('00000000-0000-4000-8000-0000000000a3','00000000-0000-4000-8000-0000000000f2','Fresh invalid save');
insert into public.server_members(server_id,user_id) values('00000000-0000-4000-8000-0000000000a3','00000000-0000-4000-8000-0000000000f2');
select pg_temp.t('failed first save rolls back invitation too','00000000-0000-4000-8000-0000000000f2',$q$select public.save_server_tag('00000000-0000-4000-8000-0000000000a3','TOOLONG')$q$,'check constraint');
select pg_temp.t('no orphan invitation after rejected tag','00000000-0000-4000-8000-0000000000f2',$q$select count(*)::text from public.invites where server_id='00000000-0000-4000-8000-0000000000a3'$q$,'=0');
insert into public.platform_bans(user_id) values('00000000-0000-4000-8000-0000000000f2');
select pg_temp.t('suspended owner cannot save','00000000-0000-4000-8000-0000000000f2',$q$select public.save_server_tag('00000000-0000-4000-8000-0000000000a3','TEST')$q$,'account suspended');
select pg_temp.t('suspended member cannot choose','00000000-0000-4000-8000-0000000000f2',$q$select public.choose_server_tag('00000000-0000-4000-8000-0000000000a1')$q$,'account suspended');
select pg_temp.t('suspended member cannot clear','00000000-0000-4000-8000-0000000000f2',$q$select public.choose_server_tag(null)$q$,'account suspended');
select setval('public.member_number_seq',last_value,is_called) from saved_seq;
select count(*) as total,count(*) filter(where ok) as passed,jsonb_agg(jsonb_build_object('name',name,'detail',detail)) filter(where not ok) as failed from t_res;
rollback;
