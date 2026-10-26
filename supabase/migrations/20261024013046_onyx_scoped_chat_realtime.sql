-- Shared quota bookkeeping is private and keyed by the authenticated actor.
-- Trigger calls may supply the FK-checked author for trusted system/rollback operations.
create function private.consume_quota(p_user uuid,p_kind text,p_limit integer,p_window interval)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_user is null or p_kind is null or p_kind='' or p_limit is null or p_limit<1 or p_window is null or p_window<=interval '0'then raise exception 'invalid rate policy'using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('onyx:rate:'||p_user::text||':'||p_kind,0));
 delete from private.rate_events where user_id=p_user and kind=p_kind and at<now()-greatest(p_window,interval '1 day');
 if(select count(*)from private.rate_events where user_id=p_user and kind=p_kind and at>now()-p_window)>=p_limit then raise exception 'rate limited: %',p_kind using errcode='P0001';end if;
 insert into private.rate_events(user_id,kind)values(p_user,p_kind);
end $$;
revoke all on function private.consume_quota(uuid,text,integer,interval)from public,anon,authenticated,service_role;
create or replace function private.hit_rate_limit(p_kind text,p_limit integer,p_window interval)returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid()is null then raise exception 'not authenticated'using errcode='28000';end if;
 perform private.consume_quota(auth.uid(),p_kind,p_limit,p_window);
end $$;
create or replace function private.messages_rate_limit()returns trigger language plpgsql security definer set search_path='' as $$
declare v_slow integer;
begin
 if new.type<>'default'or new.author_id is null then return new;end if;
 -- Deleting a sent message never refunds a send, including simultaneous requests.
 perform private.consume_quota(new.author_id,'message',15,interval '10 seconds');
 if new.channel_id is not null then
  select slowmode into v_slow from public.channels where id=new.channel_id;
  if coalesce(v_slow,0)>0 and not private.has_channel_permission(new.channel_id,'manageMessages')and not private.has_channel_permission(new.channel_id,'manageChannels')then
   begin perform private.consume_quota(new.author_id,'slowmode:'||new.channel_id,1,make_interval(secs=>v_slow));
   exception when raise_exception then raise exception 'slowmode active'using errcode='P0001';end;
  end if;
 end if;
 return new;
end $$;

-- Scoped Realtime: Broadcast is a wake-up only. Message bodies retain fresh RLS.
create table private.chat_heads(
 scope_key text primary key,
 scope_id uuid not null,
 channel_id uuid unique references public.channels(id) on delete cascade,
 dm_id uuid unique references public.dm_channels(id) on delete cascade,
 revision bigint not null default 0,
 floor_revision bigint not null default 0,
 check(num_nonnulls(channel_id,dm_id)=1 and scope_id=coalesce(channel_id,dm_id)),
 check(scope_key=(case when dm_id is null then 'channel:'else 'dm:'end)||scope_id::text)
);
create table private.chat_events(
 scope_key text not null references private.chat_heads(scope_key) on delete cascade,
 scope_id uuid not null,
 revision bigint not null,
 message_id uuid not null,
 operation text not null check(operation in('INSERT','UPDATE','DELETE')),
 at timestamptz not null default now(),
 primary key(scope_key,revision)
);
create index chat_events_expiry_idx on private.chat_events(at);
create table private.browser_presence(
 user_id uuid not null references public.profiles(id) on delete cascade,
 instance_id uuid not null,
 expires_at timestamptz not null,
 primary key(user_id,instance_id)
);
create index browser_presence_expiry_idx on private.browser_presence(expires_at);
alter table private.chat_heads enable row level security;
alter table private.chat_events enable row level security;
alter table private.browser_presence enable row level security;
revoke all on private.chat_heads,private.chat_events,private.browser_presence from public,anon,authenticated,service_role;

create function private.require_realtime_session() returns void language plpgsql stable security definer set search_path='' as $$
declare state text:=private.own_session_state();
begin
 if auth.uid() is null or state<>'ready' then raise exception '%',case when state='mfa_required' then 'mfa_required' else 'session_expired' end using errcode='42501';end if;
 if private.is_platform_banned()then raise exception 'account suspended' using errcode='42501';end if;
end $$;
revoke all on function private.require_realtime_session()from public,anon;
grant execute on function private.require_realtime_session()to authenticated;

create function private.wake_chat(p_channel uuid,p_dm uuid)returns void language plpgsql security definer set search_path='' as $$
declare sid uuid;uid uuid;
begin
 if p_channel is not null then
  select server_id into sid from public.channels where id=p_channel;
  if sid is not null then perform realtime.send('{}'::jsonb,'messages','onyx:server:'||sid,true);end if;
 else
  for uid in select user_id from public.dm_participants where dm_id=p_dm loop
   perform realtime.send('{}'::jsonb,'messages','onyx:inbox:'||uid,true);
  end loop;
 end if;
end $$;
revoke all on function private.wake_chat(uuid,uuid)from public,anon,authenticated,service_role;

create function private.journal_chat_change(p_channel uuid,p_dm uuid,p_message uuid,p_operation text)returns void language plpgsql security definer set search_path='' as $$
declare rev bigint;sid uuid:=coalesce(p_channel,p_dm);key text:=(case when p_dm is null then 'channel:'else 'dm:'end)||sid::text;
begin
 -- One row lock per chat gives committed revisions a stable order, unlike a global sequence.
 insert into private.chat_heads(scope_key,scope_id,channel_id,dm_id,revision)values(key,sid,p_channel,p_dm,1)
 on conflict(scope_key)do update set revision=private.chat_heads.revision+1 returning revision into rev;
 insert into private.chat_events(scope_key,scope_id,revision,message_id,operation)values(key,sid,rev,p_message,p_operation);
 perform private.wake_chat(p_channel,p_dm);
end $$;
revoke all on function private.journal_chat_change(uuid,uuid,uuid,text)from public,anon,authenticated,service_role;

create function private.journal_message()returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then
  -- A parent channel/DM may already be gone during a cascading deletion.
  if (old.channel_id is not null and exists(select 1 from public.channels where id=old.channel_id))or(old.dm_id is not null and exists(select 1 from public.dm_channels where id=old.dm_id))then
   perform private.journal_chat_change(old.channel_id,old.dm_id,old.id,'DELETE');
  end if;
  return old;
 end if;
 perform private.journal_chat_change(new.channel_id,new.dm_id,new.id,tg_op);
 return new;
end $$;
revoke all on function private.journal_message()from public,anon,authenticated,service_role;
create trigger onyx_message_journal after insert or update or delete on public.messages for each row execute function private.journal_message();

create function private.journal_reaction()returns trigger language plpgsql security definer set search_path='' as $$
declare mid uuid;cid uuid;did uuid;
begin
 mid:=case when tg_op='DELETE' then old.message_id else new.message_id end;
 select channel_id,dm_id into cid,did from public.messages where id=mid;
 if found then perform private.journal_chat_change(cid,did,mid,'UPDATE');end if;
 return null;
end $$;
revoke all on function private.journal_reaction()from public,anon,authenticated,service_role;
create trigger onyx_reaction_journal after insert or delete on public.reactions for each row execute function private.journal_reaction();

-- Private metadata only. Bodies are selected by the SECURITY INVOKER function below.
create function private.chat_delta(p_id uuid,p_dm boolean,p_cursor bigint)returns jsonb language plpgsql stable security definer set search_path='' as $$
declare head bigint;floor bigint;last_rev bigint;ev jsonb;key text:=(case when p_dm then 'dm:'else 'channel:'end)||p_id::text;
begin
 perform private.require_realtime_session();
 if not coalesce(case when p_dm then private.is_dm_participant(p_id)else private.has_channel_permission(p_id,'viewChannel')end,false)then
  return jsonb_build_object('id',p_id,'dm',p_dm,'allowed',false);
 end if;
 select revision,floor_revision into head,floor from private.chat_heads where scope_key=key;
 head:=coalesce(head,0);floor:=coalesce(floor,0);
 if p_cursor is null or p_cursor<floor or p_cursor>head then
  return jsonb_build_object('id',p_id,'dm',p_dm,'allowed',true,'reset',true,'cursor',head::text,'more',false,'events','[]'::jsonb);
 end if;
 select coalesce(jsonb_agg(to_jsonb(e)order by e.revision),'[]'::jsonb),max(e.revision) into ev,last_rev
 from(select revision,message_id,operation from private.chat_events where scope_key=key and revision>p_cursor order by revision limit 200)e;
 return jsonb_build_object('id',p_id,'dm',p_dm,'allowed',true,'reset',false,'cursor',coalesce(last_rev,head)::text,'more',coalesce(last_rev,head)<head,'events',ev);
end $$;
revoke all on function private.chat_delta(uuid,boolean,bigint)from public,anon,service_role;
grant execute on function private.chat_delta(uuid,boolean,bigint)to authenticated;

create function public.message_sync(p_scopes jsonb)returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare scope jsonb;meta jsonb;body jsonb;gone jsonb;out jsonb:='[]';sid uuid;is_dm boolean;
begin
 perform private.require_realtime_session();
 if jsonb_typeof(p_scopes)<>'array' or p_scopes is null or jsonb_array_length(p_scopes)>20 then raise exception 'invalid sync batch' using errcode='22023';end if;
 for scope in select value from jsonb_array_elements(p_scopes)loop
  sid:=(scope->>'id')::uuid;is_dm:=coalesce((scope->>'dm')::boolean,false);
  if sid is null then raise exception 'invalid sync scope' using errcode='22023';end if;
  meta:=private.chat_delta(sid,is_dm,(scope->>'cursor')::bigint);
  if (meta->>'allowed')::boolean then
   -- This SELECT is deliberately invoker/RLS, including history, guest and MFA policies.
   select coalesce(jsonb_agg(to_jsonb(m)||jsonb_build_object('reactions',coalesce(
    (select jsonb_agg(jsonb_build_object('emoji',r.emoji,'user_id',r.user_id)order by r.created_at)from public.reactions r where r.message_id=m.id),'[]'::jsonb))
    order by m.created_at,m.id),'[]'::jsonb)into body
   from(select * from (
    select * from public.messages x where not is_dm and x.channel_id=sid
    union all select * from public.messages x where is_dm and x.dm_id=sid
    )scoped where ((meta->>'reset')::boolean or id in(select (value->>'message_id')::uuid from jsonb_array_elements(meta->'events')))
    order by created_at desc,id desc limit(case when(meta->>'reset')::boolean then 50 else 200 end))m;
   -- Missing/inaccessible edited rows are removed as well as explicit deletions.
   select coalesce(jsonb_agg(distinct value->>'message_id'),'[]'::jsonb)into gone
   from jsonb_array_elements(meta->'events')where (value->>'message_id')::uuid not in
    (select (v->>'id')::uuid from jsonb_array_elements(body)v);
   out:=out||jsonb_build_array((meta-'events')||jsonb_build_object('rows',body,'deleted',gone));
  else out:=out||jsonb_build_array(meta||jsonb_build_object('rows','[]'::jsonb,'deleted','[]'::jsonb));
  end if;
 end loop;
 return out;
end $$;
revoke all on function public.message_sync(jsonb)from public,anon;
grant execute on function public.message_sync(jsonb)to authenticated;

create function private.wake_presence(p_user uuid)returns void language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 for target in select server_id from public.server_members where user_id=p_user loop
  perform realtime.send(jsonb_build_object('user_id',p_user),'presence','onyx:server:'||target,true);
 end loop;
 for target in
  select case when requester_id=p_user then addressee_id else requester_id end from public.friendships where status='accepted'and(requester_id=p_user or addressee_id=p_user)
  union select p.user_id from public.dm_participants me join public.dm_participants p using(dm_id)where me.user_id=p_user
 loop perform realtime.send(jsonb_build_object('user_id',p_user),'presence','onyx:inbox:'||target,true);end loop;
end $$;
revoke all on function private.wake_presence(uuid)from public,anon,authenticated,service_role;

create function public.presence_touch(p_instance uuid,p_leave boolean default false)returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid();was_online boolean;is_online boolean;
begin
 perform private.require_realtime_session();
 if p_instance is null then raise exception 'invalid instance' using errcode='22023';end if;
 perform private.hit_rate_limit('presence',120,interval '1 minute');
 perform pg_advisory_xact_lock(hashtextextended('onyx:presence:'||me,0));
 select exists(select 1 from private.browser_presence where user_id=me and expires_at>now())into was_online;
 delete from private.browser_presence where user_id=me and expires_at<=now();
 if p_leave then delete from private.browser_presence where user_id=me and instance_id=p_instance;
 else
  if (select count(*)from private.browser_presence where user_id=me)>=32 and not exists(select 1 from private.browser_presence where user_id=me and instance_id=p_instance)then raise exception 'too many presence instances' using errcode='54000';end if;
  insert into private.browser_presence values(me,p_instance,now()+interval '70 seconds')on conflict(user_id,instance_id)do update set expires_at=excluded.expires_at;
 end if;
 select exists(select 1 from private.browser_presence where user_id=me and expires_at>now())into is_online;
 if was_online is distinct from is_online then perform private.wake_presence(me);end if;
end $$;
revoke all on function public.presence_touch(uuid,boolean)from public,anon;
grant execute on function public.presence_touch(uuid,boolean)to authenticated;

create function public.presence_snapshot(p_users uuid[])returns jsonb language plpgsql stable security definer set search_path='' as $$
declare out jsonb;
begin
 perform private.require_realtime_session();
 if p_users is null or cardinality(p_users)>500 then raise exception 'invalid presence batch' using errcode='22023';end if;
 select coalesce(jsonb_object_agg(p.id,jsonb_build_object('status',case when exists(select 1 from public.platform_bans b where b.user_id=p.id and b.lifted_at is null)then 'offline'::public.presence_status else p.status end,'online',exists(select 1 from private.browser_presence b where b.user_id=p.id and b.expires_at>now()))),'{}'::jsonb)into out from public.profiles p
 where p.id=any(p_users)
 and(p.id=auth.uid()
 or exists(select 1 from public.server_members me join public.server_members other using(server_id)where me.user_id=auth.uid()and other.user_id=p.id)
 or exists(select 1 from public.friendships f where f.status='accepted'and((f.requester_id=auth.uid()and f.addressee_id=p.id)or(f.addressee_id=auth.uid()and f.requester_id=p.id)))
 or exists(select 1 from public.dm_participants me join public.dm_participants other using(dm_id)where me.user_id=auth.uid()and other.user_id=p.id));
 return out;
end $$;
revoke all on function public.presence_snapshot(uuid[])from public,anon;
grant execute on function public.presence_snapshot(uuid[])to authenticated;

create function private.presence_profile_change()returns trigger language plpgsql security definer set search_path='' as $$
begin if old.status is distinct from new.status then perform private.wake_presence(new.id);end if;return null;end $$;
revoke all on function private.presence_profile_change()from public,anon,authenticated,service_role;
create trigger onyx_presence_profile after update of status on public.profiles for each row execute function private.presence_profile_change();

create function public.typing_ping(p_scope uuid,p_dm boolean)returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_realtime_session();
 if not coalesce(case when p_dm then private.can_send_dm(p_scope)else private.has_channel_permission(p_scope,'viewChannel')and private.has_channel_permission(p_scope,'sendMessages')end,false)then raise exception 'missing permission' using errcode='42501';end if;
 perform private.hit_rate_limit('typing',120,interval '1 minute');
 -- Identity comes from the verified JWT, never a client-supplied broadcast payload.
 perform realtime.send(jsonb_build_object('user_id',auth.uid()),'typing','typing:v2:'||case when p_dm then 'dm:'else 'channel:'end||p_scope,true);
end $$;
revoke all on function public.typing_ping(uuid,boolean)from public,anon;
grant execute on function public.typing_ping(uuid,boolean)to authenticated;

create or replace function private.can_join_topic(p_topic text)returns boolean language sql stable security definer set search_path='' as $$
 select case
 when auth.uid() is null then false
 when p_topic like 'onyx:inbox:%'then private.topic_id(p_topic,'onyx:inbox:')=auth.uid()
 when p_topic like 'onyx:server:%'then exists(select 1 from public.server_members where server_id=private.topic_id(p_topic,'onyx:server:')and user_id=auth.uid())
 when p_topic like 'typing:v2:channel:%'then coalesce(private.has_channel_permission(private.topic_id(p_topic,'typing:v2:channel:'),'viewChannel'),false)
 when p_topic like 'typing:v2:dm:%'then coalesce(private.is_dm_participant(private.topic_id(p_topic,'typing:v2:dm:')),false)
 -- Compatibility for installed App25 clients; new clients never trust these identities.
 when p_topic='onyx:presence'then true
 when p_topic like 'typing:channel:%'then coalesce(private.has_channel_permission(private.topic_id(p_topic,'typing:channel:'),'viewChannel'),false)
 when p_topic like 'typing:dm:%'then coalesce(private.is_dm_participant(private.topic_id(p_topic,'typing:dm:')),false)
 else false end
$$;
-- can_send_topic already defaults to false for every new prefix: only Postgres sends them.

create function private.cleanup_chat_realtime()returns void language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 with removed as(delete from private.chat_events where at<now()-interval '1 day'returning scope_key,revision)
 update private.chat_heads h set floor_revision=greatest(h.floor_revision,e.rev)from(select scope_key,max(revision)rev from removed group by scope_key)e where h.scope_key=e.scope_key;
 for target in select distinct user_id from private.browser_presence where expires_at<=now()loop
  delete from private.browser_presence where user_id=target and expires_at<=now();
  if not exists(select 1 from private.browser_presence where user_id=target and expires_at>now())then perform private.wake_presence(target);end if;
 end loop;
end $$;
revoke all on function private.cleanup_chat_realtime()from public,anon,authenticated,service_role;
do $$begin if exists(select 1 from pg_extension where extname='pg_cron')then perform cron.schedule('onyx_chat_realtime_cleanup','* * * * *','select private.cleanup_chat_realtime()');end if;end $$;

create or replace function public.check_account_request()returns void language plpgsql set search_path='' as $$
declare v_state text;v_path text:=current_setting('request.path',true);begin
 if auth.jwt()->>'role'='authenticated'then
  v_state:=private.own_session_state();
  if v_state='mfa_required'then raise sqlstate 'PT403'using message='mfa_required';end if;
  if v_state<>'ready'then raise sqlstate 'PT401'using message='session_expired';end if;
  if private.is_guest(auth.uid())and v_path like '/rpc/%'and split_part(v_path,'/',3)<>all(array['invite_preview','account_status','recent_messages','username_available','voice_server_activity','ensure_official_server','join_server_by_invite','report_message','report_user','user_block','friend_remove','voice_join_check','voice_set_self','complete_guest_registration','check_account_request','message_sync','presence_touch','presence_snapshot','typing_ping'])then
   raise sqlstate 'PT403'using message='registration_required';
  end if;
 end if;
end $$;
