-- Isolated fixture suite. Run through scripts/prepare-sql-audit.mjs; never COMMIT.
begin;
create temp table rt_results(name text,ok boolean,detail text);
grant all on rt_results to authenticated;
create function pg_temp.check_result(n text,b boolean,d text default '')returns void language sql as $$insert into rt_results values(n,coalesce(b,false),d)$$;
create function pg_temp.as_user(u uuid,q text)returns jsonb language plpgsql as $$declare v jsonb;begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 set local role authenticated;execute q into v;reset role;return v;
 exception when others then reset role;raise;
end $$;
create function pg_temp.denied(n text,u uuid,q text,expected text)returns void language plpgsql as $$begin
 begin perform pg_temp.as_user(u,q);perform pg_temp.check_result(n,false,'call succeeded');
 exception when others then perform pg_temp.check_result(n,sqlerrm ilike '%'||expected||'%',sqlerrm);end;
end $$;
insert into auth.users(id,email,aud,role,is_anonymous,raw_user_meta_data)values
('27272727-2727-4272-8272-272727272701','zz-rt-owner@onyx.invalid','authenticated','authenticated',false,'{"username":"zz_rt_owner"}'),
('27272727-2727-4272-8272-272727272702','zz-rt-reader@onyx.invalid','authenticated','authenticated',false,'{"username":"zz_rt_reader"}'),
('27272727-2727-4272-8272-272727272703','zz-rt-other@onyx.invalid','authenticated','authenticated',false,'{"username":"zz_rt_other"}'),
('27272727-2727-4272-8272-272727272704',null,'authenticated','authenticated',true,'{"display_name":"RT guest"}');
insert into public.servers(id,name,owner_id)values('27272727-2727-4272-8272-272727272711','ZZ RT','27272727-2727-4272-8272-272727272701');
insert into public.server_members(server_id,user_id)values
('27272727-2727-4272-8272-272727272711','27272727-2727-4272-8272-272727272702'),
('27272727-2727-4272-8272-272727272711','27272727-2727-4272-8272-272727272704');
insert into public.server_members(server_id,user_id)values('27272727-2727-4272-8272-272727272711','27272727-2727-4272-8272-272727272701')on conflict do nothing;
insert into public.roles(id,server_id,name,is_default,permissions)values('27272727-2727-4272-8272-272727272771','27272727-2727-4272-8272-272727272711','@everyone',true,array['viewChannel','readHistory','sendMessages','addReactions']::public.permission[]);
insert into public.channels(id,server_id,name,type)values
('27272727-2727-4272-8272-272727272721','27272727-2727-4272-8272-272727272711','open','text'),
('27272727-2727-4272-8272-272727272722','27272727-2727-4272-8272-272727272711','secret','text');
insert into public.permission_overwrites(server_id,channel_id,target_type,target_id,deny)
select server_id,'27272727-2727-4272-8272-272727272722','role',id,array['viewChannel']::public.permission[]from public.roles where server_id='27272727-2727-4272-8272-272727272711'and is_default;
insert into public.dm_channels(id,type,name,owner_id)values('27272727-2727-4272-8272-272727272731','group','ZZ RT DM','27272727-2727-4272-8272-272727272701');
insert into public.dm_participants(dm_id,user_id)values
('27272727-2727-4272-8272-272727272731','27272727-2727-4272-8272-272727272701'),
('27272727-2727-4272-8272-272727272731','27272727-2727-4272-8272-272727272702');
insert into public.messages(id,channel_id,author_id,content)values
('27272727-2727-4272-8272-272727272741','27272727-2727-4272-8272-272727272721','27272727-2727-4272-8272-272727272701','Initial fixture'),
('27272727-2727-4272-8272-272727272742','27272727-2727-4272-8272-272727272722','27272727-2727-4272-8272-272727272701','Secret fixture');
insert into public.messages(id,dm_id,author_id,content)values('27272727-2727-4272-8272-272727272743','27272727-2727-4272-8272-272727272731','27272727-2727-4272-8272-272727272701','DM fixture');
select pg_temp.check_result('Message RPC keeps invoker RLS',not(select prosecdef from pg_proc where oid='public.message_sync(jsonb)'::regprocedure));
select pg_temp.check_result('No anonymous RPC access',not has_function_privilege('anon','public.message_sync(jsonb)','execute')and not has_function_privilege('anon','public.presence_touch(uuid,boolean)','execute')and not has_function_privilege('anon','public.presence_snapshot(uuid[])','execute')and not has_function_privilege('anon','public.typing_ping(uuid,boolean)','execute'));
select pg_temp.check_result('Private journals and liveness cannot be read directly',not has_table_privilege('authenticated','private.chat_events','select')and not has_table_privilege('authenticated','private.chat_heads','select')and not has_table_privilege('authenticated','private.browser_presence','select'));
select pg_temp.check_result('Initial snapshot returns the real body',pg_temp.as_user('27272727-2727-4272-8272-272727272702',$q$select public.message_sync('[{"id":"27272727-2727-4272-8272-272727272721","dm":false,"cursor":null}]')$q$)#>>'{0,rows,0,content}'='Initial fixture');
select pg_temp.check_result('Initial snapshot resets with committed revision',pg_temp.as_user('27272727-2727-4272-8272-272727272702',$q$select public.message_sync('[{"id":"27272727-2727-4272-8272-272727272721","dm":false}]')$q$)#>>'{0,cursor}'='1');
select pg_temp.check_result('No changes with current cursor',jsonb_array_length(pg_temp.as_user('27272727-2727-4272-8272-272727272702',$q$select public.message_sync('[{"id":"27272727-2727-4272-8272-272727272721","cursor":"1"}]')$q$)#>'{0,rows}')=0);
select pg_temp.check_result('Private channel body is denied',pg_temp.as_user('27272727-2727-4272-8272-272727272702',$q$select public.message_sync('[{"id":"27272727-2727-4272-8272-272727272722"}]')$q$)#>>'{0,allowed}'='false');
select pg_temp.check_result('Nonmember cannot sync a channel',pg_temp.as_user('27272727-2727-4272-8272-272727272703',$q$select public.message_sync('[{"id":"27272727-2727-4272-8272-272727272721"}]')$q$)#>>'{0,allowed}'='false');
select pg_temp.check_result('DM participants receive DM body',pg_temp.as_user('27272727-2727-4272-8272-272727272702',$q$select public.message_sync('[{"id":"27272727-2727-4272-8272-272727272731","dm":true}]')$q$)#>>'{0,rows,0,content}'='DM fixture');
select pg_temp.check_result('Other account cannot sync a DM',pg_temp.as_user('27272727-2727-4272-8272-272727272703',$q$select public.message_sync('[{"id":"27272727-2727-4272-8272-272727272731","dm":true}]')$q$)#>>'{0,allowed}'='false');
select pg_temp.check_result('Guest may sync allowed channel',pg_temp.as_user('27272727-2727-4272-8272-272727272704',$q$select public.message_sync('[{"id":"27272727-2727-4272-8272-272727272721"}]')$q$)#>>'{0,rows,0,content}'='Initial fixture');
select set_config('request.jwt.claims','{"sub":"27272727-2727-4272-8272-272727272701","role":"authenticated"}',true);
update public.messages set content='Edited fixture'where id='27272727-2727-4272-8272-272727272741';
select pg_temp.check_result('Edit after reconnect returns authoritative row',pg_temp.as_user('27272727-2727-4272-8272-272727272702',$q$select public.message_sync('[{"id":"27272727-2727-4272-8272-272727272721","cursor":"1"}]')$q$)#>>'{0,rows,0,content}'='Edited fixture');
insert into public.reactions(message_id,user_id,emoji)values('27272727-2727-4272-8272-272727272741','27272727-2727-4272-8272-272727272702','👍');
select pg_temp.check_result('Reactions are included in delta',pg_temp.as_user('27272727-2727-4272-8272-272727272702',$q$select public.message_sync('[{"id":"27272727-2727-4272-8272-272727272721","cursor":"2"}]')$q$)#>>'{0,rows,0,reactions,0,emoji}'='👍');
delete from public.reactions where message_id='27272727-2727-4272-8272-272727272741';
select pg_temp.check_result('Reaction removal returns empty reaction list',jsonb_array_length(pg_temp.as_user('27272727-2727-4272-8272-272727272702',$q$select public.message_sync('[{"id":"27272727-2727-4272-8272-272727272721","cursor":"3"}]')$q$)#>'{0,rows,0,reactions}')=0);
select set_config('request.jwt.claims','{"sub":"27272727-2727-4272-8272-272727272701","role":"authenticated"}',true);
delete from public.messages where id='27272727-2727-4272-8272-272727272741';
select pg_temp.check_result('Delete returns a durable tombstone',pg_temp.as_user('27272727-2727-4272-8272-272727272702',$q$select public.message_sync('[{"id":"27272727-2727-4272-8272-272727272721","cursor":"4"}]')$q$)#>>'{0,deleted,0}'='27272727-2727-4272-8272-272727272741');
select pg_temp.check_result('Deleted messages still consume flood quota',(select count(*)=3 from private.rate_events where user_id='27272727-2727-4272-8272-272727272701'and kind='message'));
select pg_temp.check_result('Actor-parametrized quota helper is not client callable',not has_function_privilege('authenticated','private.consume_quota(uuid,text,integer,interval)','execute'));
select set_config('request.jwt.claims','',true);
-- Generate a backlog only inside this rolled-back transaction; never on the published site.
-- Null authors model retained messages of deleted accounts; no flood guard is disabled.
insert into public.messages(channel_id,author_id,content,created_at)select '27272727-2727-4272-8272-272727272721',null,'Backlog '||n,now()from generate_series(1,205)n;
select pg_temp.check_result('Catch-up batch is bounded',pg_temp.as_user('27272727-2727-4272-8272-272727272702',$q$select public.message_sync('[{"id":"27272727-2727-4272-8272-272727272721","cursor":"5"}]')$q$)#>>'{0,more}'='true');
select pg_temp.check_result('Catch-up cursor stops after 200 events',pg_temp.as_user('27272727-2727-4272-8272-272727272702',$q$select public.message_sync('[{"id":"27272727-2727-4272-8272-272727272721","cursor":"5"}]')$q$)#>>'{0,cursor}'='205');
select pg_temp.check_result('Final page completes without dropping messages',jsonb_array_length(pg_temp.as_user('27272727-2727-4272-8272-272727272702',$q$select public.message_sync('[{"id":"27272727-2727-4272-8272-272727272721","cursor":"205"}]')$q$)#>'{0,rows}')=5);
select pg_temp.check_result('Cold snapshot is bounded at 50',jsonb_array_length(pg_temp.as_user('27272727-2727-4272-8272-272727272702',$q$select public.message_sync('[{"id":"27272727-2727-4272-8272-272727272721"}]')$q$)#>'{0,rows}')=50);
select pg_temp.denied('Oversized request is rejected','27272727-2727-4272-8272-272727272702',$q$select public.message_sync((select jsonb_agg(jsonb_build_object('id','27272727-2727-4272-8272-272727272721'))from generate_series(1,21)))$q$,'invalid sync batch');
select pg_temp.denied('Invalid cursor is rejected','27272727-2727-4272-8272-272727272702',$q$select public.message_sync('[{"id":"27272727-2727-4272-8272-272727272721","cursor":"garbage"}]')$q$,'invalid input syntax');
select set_config('request.jwt.claims','',true);
update private.chat_events set at=now()-interval '2 days'where scope_id='27272727-2727-4272-8272-272727272721';


select private.cleanup_chat_realtime();
select pg_temp.check_result('Expired cursor forces a fresh snapshot',pg_temp.as_user('27272727-2727-4272-8272-272727272702',$q$select public.message_sync('[{"id":"27272727-2727-4272-8272-272727272721","cursor":"5"}]')$q$)#>>'{0,reset}'='true');
select pg_temp.check_result('Server Broadcast contains no content or private channel identifier',exists(select from realtime.messages where topic='onyx:server:27272727-2727-4272-8272-272727272711'and event='messages')and not exists(select 1 from realtime.messages where topic='onyx:server:27272727-2727-4272-8272-272727272711'and event='messages'and payload-'id'<>'{}'::jsonb));
select pg_temp.check_result('Channel member may join server wake topic',pg_temp.as_user('27272727-2727-4272-8272-272727272702',$q$select to_jsonb(private.can_join_topic('onyx:server:27272727-2727-4272-8272-272727272711'))$q$)='true'::jsonb);
select pg_temp.check_result('Nonmember cannot join server wake topic',pg_temp.as_user('27272727-2727-4272-8272-272727272703',$q$select to_jsonb(private.can_join_topic('onyx:server:27272727-2727-4272-8272-272727272711'))$q$)='false'::jsonb);
select pg_temp.check_result('Only own inbox is accessible',pg_temp.as_user('27272727-2727-4272-8272-272727272702',$q$select to_jsonb(private.can_join_topic('onyx:inbox:27272727-2727-4272-8272-272727272702')and not private.can_join_topic('onyx:inbox:27272727-2727-4272-8272-272727272701'))$q$)='true'::jsonb);
select pg_temp.check_result('Clients cannot forge server signals or v2 typing',pg_temp.as_user('27272727-2727-4272-8272-272727272702',$q$select to_jsonb(not private.can_send_topic('onyx:server:27272727-2727-4272-8272-272727272711')and not private.can_send_topic('onyx:inbox:27272727-2727-4272-8272-272727272702')and not private.can_send_topic('typing:v2:channel:27272727-2727-4272-8272-272727272721'))$q$)='true'::jsonb);
select pg_temp.as_user('27272727-2727-4272-8272-272727272702',$q$select to_jsonb(public.presence_touch('27272727-2727-4272-8272-272727272751'))$q$);
select pg_temp.check_result('Presence heartbeat is owned by JWT identity',(select exists(select 1 from private.browser_presence where user_id='27272727-2727-4272-8272-272727272702'and instance_id='27272727-2727-4272-8272-272727272751')));
select pg_temp.check_result('Relevant member sees live browser status',pg_temp.as_user('27272727-2727-4272-8272-272727272701',$q$select public.presence_snapshot(array['27272727-2727-4272-8272-272727272702'::uuid])$q$)#>>'{27272727-2727-4272-8272-272727272702,online}'='true');
select pg_temp.as_user('27272727-2727-4272-8272-272727272702',$q$select to_jsonb(public.presence_touch('27272727-2727-4272-8272-272727272752'))$q$);
select pg_temp.as_user('27272727-2727-4272-8272-272727272702',$q$select to_jsonb(public.presence_touch('27272727-2727-4272-8272-272727272751',true))$q$);
select pg_temp.check_result('Closing one tab keeps another tab online',pg_temp.as_user('27272727-2727-4272-8272-272727272701',$q$select public.presence_snapshot(array['27272727-2727-4272-8272-272727272702'::uuid])$q$)#>>'{27272727-2727-4272-8272-272727272702,online}'='true');
select set_config('request.jwt.claims','',true);
update public.profiles set status='offline'where id='27272727-2727-4272-8272-272727272702';
select pg_temp.check_result('Invisible preference remains authoritative',pg_temp.as_user('27272727-2727-4272-8272-272727272701',$q$select public.presence_snapshot(array['27272727-2727-4272-8272-272727272702'::uuid])$q$)#>>'{27272727-2727-4272-8272-272727272702,status}'='offline');
select set_config('request.jwt.claims','',true);
update private.browser_presence set expires_at=now()-interval '1 second'where user_id='27272727-2727-4272-8272-272727272702';
select pg_temp.check_result('Expired liveness is offline before cron runs',pg_temp.as_user('27272727-2727-4272-8272-272727272701',$q$select public.presence_snapshot(array['27272727-2727-4272-8272-272727272702'::uuid])$q$)#>>'{27272727-2727-4272-8272-272727272702,online}'='false');
select pg_temp.denied('Presence snapshot is bounded','27272727-2727-4272-8272-272727272702',$q$select public.presence_snapshot(array_fill('27272727-2727-4272-8272-272727272702'::uuid,array[501]))$q$,'invalid presence batch');
select pg_temp.as_user('27272727-2727-4272-8272-272727272702',$q$select to_jsonb(public.typing_ping('27272727-2727-4272-8272-272727272721',false))$q$);
select pg_temp.check_result('Typing actor is generated by server',exists(select from realtime.messages where topic='typing:v2:channel:27272727-2727-4272-8272-272727272721'and event='typing'and payload->>'user_id'='27272727-2727-4272-8272-272727272702'));
select pg_temp.denied('No typing in hidden channel','27272727-2727-4272-8272-272727272702',$q$select to_jsonb(public.typing_ping('27272727-2727-4272-8272-272727272722',false))$q$,'missing permission');
select pg_temp.denied('No typing in another DM','27272727-2727-4272-8272-272727272703',$q$select to_jsonb(public.typing_ping('27272727-2727-4272-8272-272727272731',true))$q$,'missing permission');
select set_config('request.jwt.claims','',true);
-- Lose membership after subscription: no new body can pass the fresh RLS API.
delete from public.server_members where server_id='27272727-2727-4272-8272-272727272711'and user_id='27272727-2727-4272-8272-272727272702';
select pg_temp.check_result('Removal immediately denies message catch-up',pg_temp.as_user('27272727-2727-4272-8272-272727272702',$q$select public.message_sync('[{"id":"27272727-2727-4272-8272-272727272721","cursor":"205"}]')$q$)#>>'{0,allowed}'='false');
select pg_temp.check_result('Removal immediately denies server topic',pg_temp.as_user('27272727-2727-4272-8272-272727272702',$q$select to_jsonb(private.can_join_topic('onyx:server:27272727-2727-4272-8272-272727272711'))$q$)='false'::jsonb);
select set_config('request.jwt.claims','{"sub":"27272727-2727-4272-8272-272727272701","role":"authenticated","session_id":"27272727-2727-4272-8272-272727272799"}',true);
do $$begin
 begin set local role authenticated;perform public.message_sync('[]');reset role;perform pg_temp.check_result('Revoked session denied',false);
 exception when insufficient_privilege then reset role;perform pg_temp.check_result('Revoked session denied',sqlerrm='session_expired');end;
end $$;
select set_config('request.jwt.claims','',true);
-- Parent cascade must not recreate a journal whose channel was deleted.
-- The quota counts successful sends even when the sender deletes them.
select set_config('request.jwt.claims','',true);
insert into public.messages(channel_id,author_id,content)select '27272727-2727-4272-8272-272727272721','27272727-2727-4272-8272-272727272701','Quota fixture '||n from generate_series(1,12)n;
select pg_temp.denied('Sixteenth send is rate limited','27272727-2727-4272-8272-272727272701',$q$insert into public.messages(channel_id,author_id,content)values('27272727-2727-4272-8272-272727272721',auth.uid(),'Over quota')returning to_jsonb(id)$q$,'rate limited: message');
delete from public.messages where channel_id='27272727-2727-4272-8272-272727272721'and author_id='27272727-2727-4272-8272-272727272701';
select pg_temp.denied('Deleting sends does not bypass flood quota','27272727-2727-4272-8272-272727272701',$q$insert into public.messages(channel_id,author_id,content)values('27272727-2727-4272-8272-272727272721',auth.uid(),'Still over quota')returning to_jsonb(id)$q$,'rate limited: message');
select set_config('request.jwt.claims','',true);
insert into auth.mfa_factors(id,user_id,friendly_name,factor_type,status,created_at,updated_at)values('27272727-2727-4272-8272-272727272798','27272727-2727-4272-8272-272727272702','Rollback factor','totp','verified',now(),now());
select pg_temp.denied('Message sync requires fresh MFA','27272727-2727-4272-8272-272727272702',$q$select public.message_sync('[]')$q$,'mfa_required');
select pg_temp.denied('Presence heartbeat requires fresh MFA','27272727-2727-4272-8272-272727272702',$q$select to_jsonb(public.presence_touch('27272727-2727-4272-8272-272727272751'))$q$,'mfa_required');
select pg_temp.denied('Presence reads require fresh MFA','27272727-2727-4272-8272-272727272702',$q$select public.presence_snapshot('{}'::uuid[])$q$,'mfa_required');
select pg_temp.denied('Typing requires fresh MFA','27272727-2727-4272-8272-272727272702',$q$select to_jsonb(public.typing_ping('27272727-2727-4272-8272-272727272721',false))$q$,'mfa_required');
select set_config('request.jwt.claims','',true);
delete from auth.mfa_factors where id='27272727-2727-4272-8272-272727272798';
delete from public.channels where id='27272727-2727-4272-8272-272727272721';
select pg_temp.check_result('Channel cascade clears journal and head',not exists(select from private.chat_heads where scope_id='27272727-2727-4272-8272-272727272721')and not exists(select from private.chat_events where scope_id='27272727-2727-4272-8272-272727272721'));
select pg_temp.check_result('Cron cleanup is not client callable',not has_function_privilege('authenticated','private.cleanup_chat_realtime()','execute'));
select count(*)total,count(*)filter(where ok)passed,jsonb_agg(jsonb_build_object('name',name,'detail',detail))filter(where not ok)failed from rt_results;
rollback;
