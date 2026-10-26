-- New connections are public by default; existing explicit visibility choices are preserved.
alter table public.profile_connections alter column is_visible set default true;
create or replace function public.social_finish(p_user uuid,p_hash text,p_binding text,p_receipt text) returns text
language plpgsql security invoker set search_path='' as $$
declare v private.social_challenges;
begin
 select * into v from private.social_challenges where user_id=p_user and state_hash=p_hash and binding_hash=p_binding and receipt_hash=p_receipt and expires_at>now() for update;
 if v.external_id is null then raise exception 'invalid state';end if;
 if exists(select 1 from public.platform_bans where user_id=p_user and lifted_at is null) then raise exception 'account suspended' using errcode='42501';end if;
 if v.completed_at is not null then
  if exists(select 1 from public.profile_connections where user_id=p_user and provider=v.provider and external_id=v.external_id) then return v.provider;end if;
  raise exception 'invalid state';
 end if;
 insert into public.profile_connections(user_id,provider,external_id,display_name,profile_handle) values(p_user,v.provider,v.external_id,v.display_name,v.profile_handle)
 on conflict(user_id,provider) do update set external_id=excluded.external_id,display_name=excluded.display_name,profile_handle=excluded.profile_handle,
 is_visible=case when profile_connections.external_id=excluded.external_id then profile_connections.is_visible else true end,created_at=now();
 update private.social_challenges set completed_at=now() where user_id=p_user and provider=v.provider;
 return v.provider;
end $$;

create table public.activity_settings (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 enabled boolean not null default true
);
alter table public.activity_settings enable row level security;
revoke all on public.activity_settings from public,anon,authenticated;
grant select on public.activity_settings to authenticated;
grant all on public.activity_settings to service_role;
create policy "activity settings: own" on public.activity_settings for select to authenticated using(user_id=(select auth.uid()));
create trigger block_suspended_writes before insert or update or delete on public.activity_settings for each statement execute function private.block_suspended_writes();

create table private.activity_devices (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id) on delete cascade,
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),name text not null check(char_length(name) between 1 and 40 and name !~ '[[:cntrl:]]'),
 created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '90 days',last_seen timestamptz
);
create index activity_devices_user_idx on private.activity_devices(user_id);
create table private.activity_refreshes (
 user_id uuid primary key references public.profiles(id) on delete cascade,refreshed_at timestamptz not null
);
alter table private.activity_devices enable row level security;
alter table private.activity_refreshes enable row level security;
revoke all on private.activity_devices,private.activity_refreshes from public,anon,authenticated;
grant select,insert,update,delete on private.activity_devices,private.activity_refreshes to service_role;

create table public.game_activities (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 source text not null check(source in ('steam','desktop')),
 device_id uuid references private.activity_devices(id) on delete cascade,
 title text not null check(char_length(title) between 1 and 128 and title !~ '[[:cntrl:]]'),
 game_key text not null check(game_key ~ '^[a-zA-Z0-9_.:-]{1,128}$'),
 since timestamptz not null,timing text not null check(timing in ('started','observed')),
 updated_at timestamptz not null default now(),expires_at timestamptz not null
);
create index game_activities_device_idx on public.game_activities(device_id);
create index game_activities_expiry_idx on public.game_activities(expires_at);
alter table public.game_activities enable row level security;
revoke all on public.game_activities from public,anon,authenticated;
grant select on public.game_activities to authenticated;
grant all on public.game_activities to service_role;
create function private.can_read_game_activity(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null
 and coalesce((select enabled from public.activity_settings where user_id=p_user),true)
 and exists(select 1 from public.profiles where id=p_user and (id=auth.uid() or status<>'offline'))
 and not exists(select 1 from public.platform_bans where user_id=p_user and lifted_at is null)
 and not exists(select 1 from public.blocks where (blocker_id=auth.uid() and blocked_id=p_user) or (blocked_id=auth.uid() and blocker_id=p_user));
$$;
revoke all on function private.can_read_game_activity(uuid) from public,anon;
grant execute on function private.can_read_game_activity(uuid) to authenticated;
create policy "activity: fresh and shared" on public.game_activities for select to authenticated using(expires_at>now() and private.can_read_game_activity(user_id));
create trigger block_suspended_writes before insert or update or delete on public.game_activities for each statement execute function private.block_suspended_writes();

create function private.put_game_activity(p_user uuid,p_source text,p_device uuid,p_title text,p_key text,p_started timestamptz default null) returns void language plpgsql security invoker set search_path='' as $$
declare v public.game_activities;
begin
 perform pg_advisory_xact_lock(hashtextextended('activity:'||p_user::text,0));
 select * into v from public.game_activities where user_id=p_user for update;
 if not coalesce((select enabled from public.activity_settings where user_id=p_user),true) then delete from public.game_activities where user_id=p_user;return;end if;
 if p_source='steam' and v.source='desktop' and v.expires_at>now() then return;end if;
 if p_title is null then delete from public.game_activities where user_id=p_user and source=p_source and (p_device is null or device_id=p_device);return;end if;
 if p_started is not null and (p_started>now()+interval '30 seconds' or p_started<now()-interval '30 days') then raise exception 'invalid start time';end if;
 insert into public.game_activities(user_id,source,device_id,title,game_key,since,timing,expires_at)
 values(p_user,p_source,p_device,p_title,p_key,
  case when v.game_key=p_key and v.source=p_source and v.device_id is not distinct from p_device and v.expires_at>now() then v.since else coalesce(p_started,now()) end,
  case when p_started is null then 'observed' else 'started' end,now()+case when p_source='desktop' then interval '75 seconds' else interval '100 seconds' end)
 on conflict(user_id) do update set source=excluded.source,device_id=excluded.device_id,title=excluded.title,game_key=excluded.game_key,since=excluded.since,timing=excluded.timing,updated_at=now(),expires_at=excluded.expires_at;
end $$;
revoke all on function private.put_game_activity(uuid,text,uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function private.put_game_activity(uuid,text,uuid,text,text,timestamptz) to service_role;

create function public.activity_control(p_user uuid,p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_hash text;v_id uuid;v_steam text;v_seen timestamptz;v_enabled boolean;
begin
 if p_user is null or not exists(select 1 from public.profiles where id=p_user) or exists(select 1 from public.platform_bans where user_id=p_user and lifted_at is null) then raise exception 'unauthorized' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('activity:'||p_user::text,0));
 if p_action='settings' then
  if jsonb_typeof(p_data->'enabled')<>'boolean' or not p_data?'enabled' then raise exception 'invalid settings';end if;
  insert into public.activity_settings values(p_user,(p_data->>'enabled')::boolean) on conflict(user_id) do update set enabled=excluded.enabled;
  if not (p_data->>'enabled')::boolean then delete from public.game_activities where user_id=p_user;end if;
 elsif p_action='pair' then
  v_hash:=p_data->>'hash';
  if v_hash is null or v_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid device';end if;
  delete from private.activity_devices where user_id=p_user and expires_at<now();
  if exists(select 1 from private.activity_devices where token_hash=v_hash and user_id<>p_user) then raise exception 'invalid device';end if;
  if not exists(select 1 from private.activity_devices where user_id=p_user and token_hash=v_hash) and (select count(*) from private.activity_devices where user_id=p_user)>=3 then raise exception 'device limit';end if;
  insert into private.activity_devices(user_id,token_hash,name) values(p_user,v_hash,coalesce(p_data->>'name','Windows')) on conflict(token_hash) do nothing;
 elsif p_action='revoke' then
  delete from private.activity_devices where user_id=p_user and id=(p_data->>'id')::uuid;
 elsif p_action='steam_begin' then
  select external_id into v_steam from public.profile_connections where user_id=p_user and provider='steam';
  if v_steam is null then return null;end if;
  select refreshed_at into v_seen from private.activity_refreshes where user_id=p_user;
  if v_seen>now()-interval '60 seconds' then return null;end if;
  insert into private.activity_refreshes values(p_user,now()) on conflict(user_id) do update set refreshed_at=now();
  return jsonb_build_object('steam_id',v_steam);
 elsif p_action='steam_finish' then
  select external_id into v_steam from public.profile_connections where user_id=p_user and provider='steam' for update;
  if v_steam is null or v_steam is distinct from p_data->>'steam_id' then return null;end if;
  update public.profile_connections set display_name=p_data->>'name' where user_id=p_user and provider='steam';
  v_enabled:=(select is_visible from public.profile_connections where user_id=p_user and provider='steam');
  perform private.put_game_activity(p_user,'steam',null,case when v_enabled then p_data->>'title' else null end,p_data->>'key');
  return null;
 elsif p_action<>'status' then raise exception 'invalid action';end if;
 return jsonb_build_object('enabled',coalesce((select enabled from public.activity_settings where user_id=p_user),true),'devices',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'last_seen',last_seen,'created_at',created_at) order by created_at) from private.activity_devices where user_id=p_user and expires_at>now()),'[]'::jsonb));
end $$;
create function public.activity_publish(p_hash text,p_title text default null,p_key text default null,p_started timestamptz default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v private.activity_devices;v_enabled boolean;
begin
 select * into v from private.activity_devices where token_hash=p_hash and expires_at>now();
 if v.id is not null then perform pg_advisory_xact_lock(hashtextextended('activity:'||v.user_id::text,0));end if;
 select * into v from private.activity_devices where token_hash=p_hash and expires_at>now() for update;
 if v.id is null or exists(select 1 from public.platform_bans where user_id=v.user_id and lifted_at is null) then raise exception 'unauthorized' using errcode='28000';end if;
 if p_title is not null and v.last_seen>now()-interval '10 seconds' then raise exception 'rate limited';end if;
 update private.activity_devices set last_seen=now() where id=v.id;
 perform private.put_game_activity(v.user_id,'desktop',v.id,p_title,p_key,p_started);
 v_enabled:=coalesce((select enabled from public.activity_settings where user_id=v.user_id),true);
 return jsonb_build_object('enabled',v_enabled);
end $$;
revoke all on function public.activity_control(uuid,text,jsonb),public.activity_publish(text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.activity_control(uuid,text,jsonb),public.activity_publish(text,text,text,timestamptz) to service_role;

create function public.activity_disconnect(p_hash text) returns void language plpgsql security invoker set search_path='' as $$
declare v_user uuid;
begin
 select user_id into v_user from private.activity_devices where token_hash=p_hash;
 if v_user is null then raise exception 'unauthorized' using errcode='28000';end if;
 perform pg_advisory_xact_lock(hashtextextended('activity:'||v_user::text,0));
 delete from private.activity_devices where token_hash=p_hash;
end $$;
revoke all on function public.activity_disconnect(text) from public,anon,authenticated;
grant execute on function public.activity_disconnect(text) to service_role;

create function private.clear_steam_activity() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.provider='steam' and (tg_op='DELETE' or not new.is_visible or old.external_id<>new.external_id) then delete from public.game_activities where user_id=old.user_id and source='steam';end if;
 return null;
end $$;
revoke all on function private.clear_steam_activity() from public,anon,authenticated;
create trigger clear_steam_activity after update or delete on public.profile_connections for each row execute function private.clear_steam_activity();

