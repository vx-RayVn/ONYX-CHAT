-- No real accounts or requests: every fixture and assertion is rolled back.
begin;
create temp table t_res(n serial, name text, ok boolean, detail text) on commit drop;
grant all on t_res to authenticated, anon, service_role;
grant usage on sequence t_res_n_seq to authenticated, anon, service_role;
create temp table saved_seq as select last_value, is_called from public.member_number_seq;
create function pg_temp.t(p_name text, p_user uuid, p_sql text, p_expect text, p_role text default 'authenticated') returns void
language plpgsql as $$ declare v text; begin
  begin
    perform set_config('request.jwt.claims', case when p_user is null and p_role <> 'service_role' then '' else json_build_object('sub', p_user, 'role', p_role)::text end, true);
    execute format('set local role %I', p_role);
    if p_sql ~* '^\s*(insert|update|delete)' and p_sql !~* '\mreturning\M' then execute p_sql; v:=null; else execute p_sql into v; end if;
    reset role; perform set_config('request.jwt.claims', '', true);
    insert into t_res(name,ok,detail) values(p_name,p_expect='ok' or (p_expect like '=%' and v is not distinct from substr(p_expect,2)),coalesce(v,'null'));
  exception when others then
    reset role; perform set_config('request.jwt.claims', '', true);
    insert into t_res(name,ok,detail) values(p_name,p_expect<>'ok' and p_expect not like '=%' and sqlerrm ilike '%'||p_expect||'%',sqlerrm);
  end;
end; $$;

insert into auth.users(id,email,aud,role,raw_user_meta_data) values
 ('00000000-0000-4000-8000-0000000000f1','zz-platform1@onyx.invalid','authenticated','authenticated','{"username":"zz_platform1"}'),
 ('00000000-0000-4000-8000-0000000000f2','zz-platform2@onyx.invalid','authenticated','authenticated','{"username":"zz_platform2"}'),
 ('00000000-0000-4000-8000-0000000000f3','zz-platform3@onyx.invalid','authenticated','authenticated','{"username":"zz_platform3"}');
select setval('public.member_number_seq',last_value,is_called) from saved_seq;
insert into private.platform_admins(user_id) values('00000000-0000-4000-8000-0000000000f1');
insert into public.servers(id,owner_id,name) values('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000f1','Test server');
insert into public.server_members(server_id,user_id) values('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000f1'),('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000f3');
insert into public.roles(server_id,name,is_default,permissions) values('00000000-0000-4000-8000-0000000000a1','@everyone',true,'{viewChannel,sendMessages,readHistory}');
insert into public.channels(id,server_id,name,type) values('00000000-0000-4000-8000-0000000000c1','00000000-0000-4000-8000-0000000000a1','public','text'),('00000000-0000-4000-8000-0000000000c2','00000000-0000-4000-8000-0000000000a1','not-granted','text');
insert into public.invites(code,server_id,channel_id,inviter_id) values('zz-platform-invite','00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000c1','00000000-0000-4000-8000-0000000000f1');
insert into public.server_tags(server_id,created_by,label,invite_code) values('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000f1','TEST','zz-platform-invite');
insert into public.bot_apps(id,owner_id,name,commands) values('00000000-0000-4000-8000-0000000000b1','00000000-0000-4000-8000-0000000000f1','Test Bot','[{"name":"ping","description":"Ping"}]');
insert into public.bot_installs(bot_id,server_id,installed_by,channel_ids) values('00000000-0000-4000-8000-0000000000b1','00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000f1','{00000000-0000-4000-8000-0000000000c1}');
select pg_temp.t('only nine official badges',null,$q$select count(*)::text from public.badge_catalog$q$,'=9','anon');
select pg_temp.t('retired awards are disabled',null,$q$select private.grant_badge('00000000-0000-4000-8000-0000000000f1','halloween-2026')::text$q$,'=false','postgres');
select pg_temp.t('anon preview contains server metadata',null,$q$select public.invite_preview('zz-platform-invite')->>'name'$q$,'=Test server','anon');
select pg_temp.t('unknown invitation has no preview',null,$q$select (public.invite_preview('unknown-invite') is null)::text$q$,'=true','anon');
select pg_temp.t('non-admin cannot change metadata','00000000-0000-4000-8000-0000000000f2',$q$with x as(update public.badge_catalog set name='Forged' where id='founder' returning *)select count(*)::text from x$q$,'=0','authenticated');
select pg_temp.t('admin can edit name and description','00000000-0000-4000-8000-0000000000f1',$q$with x as(update public.badge_catalog set name='New name',description='New description' where id='founder' returning *)select count(*)::text from x$q$,'=1','authenticated');
select pg_temp.t('reject unsafe badge image','00000000-0000-4000-8000-0000000000f1',$q$update public.badge_catalog set image='https://evil.invalid/tracker.svg' where id='founder'$q$,'check constraint','authenticated');
select pg_temp.t('no other catalog IDs','00000000-0000-4000-8000-0000000000f1',$q$insert into public.badge_catalog(id,name,description) values('fake','Fake','Fake')$q$,'permission denied','authenticated');
select pg_temp.t('every member may choose a tag','00000000-0000-4000-8000-0000000000f3',$q$insert into public.profile_tags(user_id,server_id) values('00000000-0000-4000-8000-0000000000f3','00000000-0000-4000-8000-0000000000a1')$q$,'ok','authenticated');
select pg_temp.t('outsider cannot wear the tag','00000000-0000-4000-8000-0000000000f2',$q$insert into public.profile_tags(user_id,server_id) values('00000000-0000-4000-8000-0000000000f2','00000000-0000-4000-8000-0000000000a1')$q$,'foreign key','authenticated');
select pg_temp.t('cannot choose for another user','00000000-0000-4000-8000-0000000000f2',$q$with x as(update public.profile_tags set server_id='00000000-0000-4000-8000-0000000000a1' where user_id='00000000-0000-4000-8000-0000000000f3' returning user_id)select count(*)::text from x$q$,'=0','authenticated');
select pg_temp.t('tag config is manager-only','00000000-0000-4000-8000-0000000000f3',$q$with x as(update public.server_tags set label='BAD' where server_id='00000000-0000-4000-8000-0000000000a1' returning *)select count(*)::text from x$q$,'=0','authenticated');
select pg_temp.t('one tag per server','00000000-0000-4000-8000-0000000000f1',$q$insert into public.server_tags(server_id,label) values('00000000-0000-4000-8000-0000000000a1','DUPE')$q$,'duplicate key','authenticated');
select pg_temp.t('manager may edit tag','00000000-0000-4000-8000-0000000000f1',$q$update public.server_tags set label='NEW' where server_id='00000000-0000-4000-8000-0000000000a1'$q$,'ok','authenticated');
select pg_temp.t('tag edit requires members to reapply','00000000-0000-4000-8000-0000000000f3',$q$select count(*)::text from public.profile_tags where user_id='00000000-0000-4000-8000-0000000000f3'$q$,'=0','authenticated');
select pg_temp.t('server activation defaults to public listing','00000000-0000-4000-8000-0000000000f3',$q$update public.profiles set plus_since=coalesce(plus_since,now()) where id='00000000-0000-4000-8000-0000000000f3' returning (plus_since is not null)::text$q$,'=true','postgres');
select pg_temp.t('new plus is listed','00000000-0000-4000-8000-0000000000f3',$q$select supporter_wall::text from public.profiles where id='00000000-0000-4000-8000-0000000000f3'$q$,'=true','authenticated');
select pg_temp.t('plus may opt out','00000000-0000-4000-8000-0000000000f3',$q$update public.profiles set supporter_wall=false where id='00000000-0000-4000-8000-0000000000f3'$q$,'ok','authenticated');
select pg_temp.t('repeat server activation preserves opt out','00000000-0000-4000-8000-0000000000f3',$q$update public.profiles set plus_since=coalesce(plus_since,now()) where id='00000000-0000-4000-8000-0000000000f3' returning (plus_since is not null)::text$q$,'=true','postgres');
select pg_temp.t('opt out preserved','00000000-0000-4000-8000-0000000000f3',$q$select supporter_wall::text from public.profiles where id='00000000-0000-4000-8000-0000000000f3'$q$,'=false','authenticated');
select pg_temp.t('bot owner cannot be forged','00000000-0000-4000-8000-0000000000f2',$q$insert into public.bot_apps(owner_id,name) values('00000000-0000-4000-8000-0000000000f1','Fake bot')$q$,'permission denied','authenticated');
select pg_temp.t('only owner deletes bot','00000000-0000-4000-8000-0000000000f2',$q$with x as(delete from public.bot_apps where id='00000000-0000-4000-8000-0000000000b1' returning *)select count(*)::text from x$q$,'=0','authenticated');
select pg_temp.t('install is manager-only','00000000-0000-4000-8000-0000000000f3',$q$with x as(update public.bot_installs set channel_ids='{00000000-0000-4000-8000-0000000000c2}' where bot_id='00000000-0000-4000-8000-0000000000b1' returning bot_id)select count(*)::text from x$q$,'=0','authenticated');
select pg_temp.t('anon cannot dispatch',null,$q$select public.bot_dispatch('00000000-0000-4000-8000-0000000000b1','00000000-0000-4000-8000-0000000000c1','ping','')$q$,'permission denied','anon');
select pg_temp.t('wrong channel is denied','00000000-0000-4000-8000-0000000000f3',$q$select public.bot_dispatch('00000000-0000-4000-8000-0000000000b1','00000000-0000-4000-8000-0000000000c2','ping','')$q$,'command unavailable','authenticated');
select pg_temp.t('missing command is denied','00000000-0000-4000-8000-0000000000f3',$q$select public.bot_dispatch('00000000-0000-4000-8000-0000000000b1','00000000-0000-4000-8000-0000000000c1','missing','')$q$,'command unavailable','authenticated');
select pg_temp.t('member can dispatch ping','00000000-0000-4000-8000-0000000000f3',$q$select (public.bot_dispatch('00000000-0000-4000-8000-0000000000b1','00000000-0000-4000-8000-0000000000c1','ping','hello')>0)::text$q$,'=true','authenticated');
select pg_temp.t('bot credentials are private','00000000-0000-4000-8000-0000000000f1',$q$select count(*) from private.bot_credentials$q$,'permission denied','authenticated');
select pg_temp.t('client cannot mint tokens','00000000-0000-4000-8000-0000000000f1',$q$select public.bot_pair_claim(repeat('a',64),repeat('b',64))$q$,'permission denied','authenticated');
select pg_temp.t('pairing start is service-only','00000000-0000-4000-8000-0000000000f1',$q$select public.bot_pair_start('00000000-0000-4000-8000-0000000000b1',repeat('a',64),'ABCDEF0001')$q$,'permission denied','authenticated');
select pg_temp.t('service starts pairing',null,$q$select public.bot_pair_start('00000000-0000-4000-8000-0000000000b1',repeat('a',64),'ABCDEF0001')$q$,'ok','service_role');
select pg_temp.t('pairing start is limited',null,$q$select public.bot_pair_start('00000000-0000-4000-8000-0000000000b1',repeat('c',64),'ABCDEF0002')$q$,'rate limited','service_role');
select pg_temp.t('unapproved device waits',null,$q$select public.bot_pair_claim(repeat('a',64),repeat('b',64))->>'status'$q$,'=pending','service_role');
select pg_temp.t('another owner cannot approve device','00000000-0000-4000-8000-0000000000f2',$q$select public.bot_pair_approve('ABCDEF0001')$q$,'pairing code unavailable','authenticated');
select pg_temp.t('owner approves device','00000000-0000-4000-8000-0000000000f1',$q$select public.bot_pair_approve('ABCDEF0001')$q$,'=Test Bot','authenticated');
select pg_temp.t('approved device gets one credential',null,$q$select public.bot_pair_claim(repeat('a',64),repeat('b',64))->>'status'$q$,'=approved','service_role');
select pg_temp.t('pairing cannot be replayed',null,$q$select public.bot_pair_claim(repeat('a',64),repeat('c',64))$q$,'pairing expired','service_role');
select pg_temp.t('fake bot token fails',null,$q$select public.bot_api(repeat('c',64),'me')$q$,'invalid bot token','service_role');
select pg_temp.t('valid token identifies the bot',null,$q$select public.bot_api(repeat('b',64),'me')->>'name'$q$,'=Test Bot','service_role');
select pg_temp.t('bot sees only dispatched commands',null,$q$select jsonb_array_length(public.bot_api(repeat('b',64),'events','{"after":"0"}'))::text$q$,'=1','service_role');
select pg_temp.t('client cannot forge bot messages','00000000-0000-4000-8000-0000000000f3',$q$insert into public.messages(channel_id,author_id,content,bot_id,bot_author) values('00000000-0000-4000-8000-0000000000c1','00000000-0000-4000-8000-0000000000f3','fake','00000000-0000-4000-8000-0000000000b1','{}')$q$,'permission denied','authenticated');
select pg_temp.t('bot sends a real message',null,$q$select public.bot_api(repeat('b',64),'message','{"channel_id":"00000000-0000-4000-8000-0000000000c1","content":"Pong!","nonce":"00000000-0000-4000-8000-0000000000d1"}')->>'id'$q$,'=00000000-0000-4000-8000-0000000000d1','service_role');
select pg_temp.t('retry is idempotent',null,$q$select public.bot_api(repeat('b',64),'message','{"channel_id":"00000000-0000-4000-8000-0000000000c1","content":"Pong!","nonce":"00000000-0000-4000-8000-0000000000d1"}')->>'replayed'$q$,'=true','service_role');
select pg_temp.t('bot message keeps human identity empty','00000000-0000-4000-8000-0000000000f3',$q$select (author_id is null and bot_author->>'name'='Test Bot')::text from public.messages where id='00000000-0000-4000-8000-0000000000d1'$q$,'=true','authenticated');
select pg_temp.t('bot cannot use another channel',null,$q$select public.bot_api(repeat('b',64),'message','{"channel_id":"00000000-0000-4000-8000-0000000000c2","content":"Pong!","nonce":"00000000-0000-4000-8000-0000000000d1"}')$q$,'channel forbidden','service_role');
select pg_temp.t('bot cannot mass mention',null,$q$select public.bot_api(repeat('b',64),'message','{"channel_id":"00000000-0000-4000-8000-0000000000c1","content":"@everyone","nonce":"00000000-0000-4000-8000-0000000000d1"}')$q$,'invalid message','service_role');
select pg_temp.t('member can remove own tag','00000000-0000-4000-8000-0000000000f3',$q$delete from public.profile_tags where user_id='00000000-0000-4000-8000-0000000000f3'$q$,'ok','authenticated');
update private.bot_credentials set requests=120 where bot_id='00000000-0000-4000-8000-0000000000b1';
select pg_temp.t('bot request limit is enforced',null,$q$select public.bot_api(repeat('b',64),'me')$q$,'rate limited','service_role');
update private.bot_credentials set requests=0,expires_at=now()-interval '1 second' where bot_id='00000000-0000-4000-8000-0000000000b1';
select pg_temp.t('expired token fails',null,$q$select public.bot_api(repeat('b',64),'me')$q$,'invalid bot token','service_role');
update private.bot_credentials set expires_at=now()+interval '1 day' where bot_id='00000000-0000-4000-8000-0000000000b1';
select pg_temp.t('duplicate commands are refused',null,$q$select public.bot_api(repeat('b',64),'commands','{"commands":[{"name":"ping","description":"one"},{"name":"ping","description":"two"}]}')$q$,'invalid commands','service_role');
select pg_temp.t('nonexistent channels cannot be installed','00000000-0000-4000-8000-0000000000f1',$q$update public.bot_installs set channel_ids='{ffffffff-ffff-4fff-8fff-ffffffffffff}' where bot_id='00000000-0000-4000-8000-0000000000b1'$q$,'invalid bot channels','authenticated');
select pg_temp.t('owner revokes bot credentials','00000000-0000-4000-8000-0000000000f1',$q$select public.bot_revoke('00000000-0000-4000-8000-0000000000b1')$q$,'ok','authenticated');
select pg_temp.t('revoked credential stops immediately',null,$q$select public.bot_api(repeat('b',64),'me')$q$,'invalid bot token','service_role');
select pg_temp.t('bot owner may remove bot and messages','00000000-0000-4000-8000-0000000000f1',$q$delete from public.bot_apps where id='00000000-0000-4000-8000-0000000000b1'$q$,'ok','authenticated');
select pg_temp.t('bot removal cleans message identities','00000000-0000-4000-8000-0000000000f3',$q$select count(*)::text from public.messages where id='00000000-0000-4000-8000-0000000000d1'$q$,'=0','authenticated');
insert into private.platform_admins(user_id) values('00000000-0000-4000-8000-0000000000f2');
select pg_temp.t('admin customizes global badge','00000000-0000-4000-8000-0000000000f2',$q$update public.badge_catalog set name='Custom Verified',edited_by='00000000-0000-4000-8000-0000000000f2' where id='verified'$q$,'ok','authenticated');
select pg_temp.t('customization flag is server controlled','00000000-0000-4000-8000-0000000000f2',$q$update public.badge_catalog set customized=false where id='verified'$q$,'permission denied','authenticated');
delete from auth.users where id='00000000-0000-4000-8000-0000000000f2';
select pg_temp.t('deleting badge editor preserves global catalog',null,$q$select count(*)::text from public.badge_catalog$q$,'=9','anon');
select pg_temp.t('custom badge name survives editor deletion',null,$q$select (name='Custom Verified' and customized and edited_by is null)::text from public.badge_catalog where id='verified'$q$,'=true','anon');
-- Match the frontend's first-save payload, including column privileges.
select pg_temp.t('tag owner can remove previous configuration','00000000-0000-4000-8000-0000000000f1',$q$delete from public.server_tags where server_id='00000000-0000-4000-8000-0000000000a1'$q$,'ok','authenticated');
select pg_temp.t('tag owner inserts permanent invite without protected counter','00000000-0000-4000-8000-0000000000f1',$q$insert into public.invites(code,server_id,channel_id,inviter_id,max_uses,expires_at) values('zz-tag-first-save','00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000c1','00000000-0000-4000-8000-0000000000f1',null,null)$q$,'ok','authenticated');
select pg_temp.t('invite defaults remain server controlled','00000000-0000-4000-8000-0000000000f1',$q$select (uses=0 and max_uses is null and expires_at is null)::text from public.invites where code='zz-tag-first-save'$q$,'=true','authenticated');
select pg_temp.t('tag owner inserts exact first-save payload','00000000-0000-4000-8000-0000000000f1',$q$insert into public.server_tags(server_id,label,image,enabled,invite_code) values('00000000-0000-4000-8000-0000000000a1','TEST',null,true,'zz-tag-first-save')$q$,'ok','authenticated');
select pg_temp.t('invitation counter still cannot be forged','00000000-0000-4000-8000-0000000000f1',$q$insert into public.invites(code,server_id,inviter_id,uses) values('zz-forged-counter','00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000f1',123)$q$,'permission denied','authenticated');
select setval('public.member_number_seq',last_value,is_called) from saved_seq;
select count(*) as total,count(*) filter(where ok) as passed,jsonb_agg(jsonb_build_object('name',name,'detail',detail)) filter(where not ok) as failed from t_res;
rollback;
