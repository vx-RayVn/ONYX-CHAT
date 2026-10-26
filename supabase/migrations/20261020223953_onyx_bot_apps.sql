-- ONYX bot API: owner-approved device pairing, channel-scoped installations and command polling.
-- Supabase default privileges may include table-wide grants; explicitly narrow them.
revoke all on public.badge_catalog,public.server_tags,public.profile_tags from anon,authenticated;
grant select on public.badge_catalog to anon,authenticated;
grant update(name,description,image,edited_by,updated_at) on public.badge_catalog to authenticated;
grant select,delete on public.server_tags to authenticated;
grant insert(server_id,label,image,enabled,invite_code),update(label,image,enabled,invite_code,updated_at) on public.server_tags to authenticated;
grant select,delete on public.profile_tags to authenticated;
grant insert(user_id,server_id),update(server_id) on public.profile_tags to authenticated;
create index badge_catalog_edited_by_idx on public.badge_catalog(edited_by);
create table public.bot_apps (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
 name text not null check(char_length(btrim(name)) between 2 and 32), description text not null default '' check(char_length(description)<=300),
 avatar text check(avatar is null or (avatar ~ '^data:image/(png|webp);base64,' and octet_length(avatar)<=180000)),
 commands jsonb not null default '[]' check(jsonb_typeof(commands)='array' and jsonb_array_length(commands)<=20), created_at timestamptz not null default now()
);
create index bot_apps_owner_idx on public.bot_apps(owner_id);
alter table public.bot_apps enable row level security;
revoke all on public.bot_apps from anon,authenticated;
grant select,delete on public.bot_apps to authenticated;
grant insert(name,description,avatar),update(name,description,avatar) on public.bot_apps to authenticated;
create policy "bots: public app descriptions" on public.bot_apps for select to authenticated using(true);
create policy "bots: owner write" on public.bot_apps for all to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create trigger block_suspended_writes before insert or update or delete on public.bot_apps for each statement execute function private.block_suspended_writes();
create function private.bot_app_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text,271));
  if (select count(*) from public.bot_apps where owner_id=new.owner_id)>=10 then raise exception 'bot limit reached' using errcode='23514'; end if;
 end if;
 if exists(select 1 from jsonb_array_elements(new.commands) x where jsonb_typeof(x)<>'object' or (x->>'name') is null or (x->>'name') !~ '^[a-z0-9_-]{1,32}$' or char_length(coalesce(x->>'description','')) not between 1 and 100)
 or (select count(*) from jsonb_array_elements(new.commands))<>(select count(distinct x->>'name') from jsonb_array_elements(new.commands) x) then raise exception 'invalid commands' using errcode='23514'; end if;
 return new;
end $$;
create trigger bot_app_guard before insert or update on public.bot_apps for each row execute function private.bot_app_guard();

create table public.bot_installs (
 bot_id uuid references public.bot_apps(id) on delete cascade,server_id uuid references public.servers(id) on delete cascade,
 installed_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
 channel_ids uuid[] not null check(cardinality(channel_ids) between 1 and 100),created_at timestamptz not null default now(),primary key(bot_id,server_id)
);
create index bot_installs_server_idx on public.bot_installs(server_id);
create index bot_installs_installer_idx on public.bot_installs(installed_by);
alter table public.bot_installs enable row level security;
revoke all on public.bot_installs from anon,authenticated;
grant select,delete on public.bot_installs to authenticated;
grant insert(bot_id,server_id,channel_ids),update(channel_ids) on public.bot_installs to authenticated;
create policy "bot installs: members" on public.bot_installs for select to authenticated using(private.is_server_member(server_id));
create policy "bot installs: manage" on public.bot_installs for all to authenticated using(private.has_server_permission(server_id,'manageServer')) with check(private.has_server_permission(server_id,'manageServer'));
create trigger block_suspended_writes before insert or update or delete on public.bot_installs for each statement execute function private.block_suspended_writes();
create function private.bot_install_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from unnest(new.channel_ids) as allowed(channel_id) where not exists(select 1 from public.channels c where c.id=allowed.channel_id and c.server_id=new.server_id and c.type='text')) then raise exception 'invalid bot channels' using errcode='23514'; end if;
 if auth.uid() is not null and exists(select 1 from unnest(new.channel_ids) as allowed(channel_id) where not private.has_channel_permission(allowed.channel_id,'viewChannel') or not private.has_channel_permission(allowed.channel_id,'sendMessages')) then raise exception 'bot channel permission missing' using errcode='42501';end if;
 return new;
end $$;
create trigger bot_install_guard before insert or update on public.bot_installs for each row execute function private.bot_install_guard();

create table private.bot_devices (
 device_hash text primary key check(device_hash ~ '^[a-f0-9]{64}$'),user_code text not null unique check(user_code ~ '^[A-F0-9]{10}$'),
 bot_id uuid not null references public.bot_apps(id) on delete cascade,approved boolean not null default false,
 created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '5 minutes'
);
create index bot_devices_bot_idx on private.bot_devices(bot_id,created_at desc);
create index bot_devices_expiry_idx on private.bot_devices(expires_at);
create table private.bot_credentials (
 bot_id uuid primary key references public.bot_apps(id) on delete cascade,token_hash text unique not null check(token_hash ~ '^[a-f0-9]{64}$'),expires_at timestamptz not null default now()+interval '30 days',window_at timestamptz not null default now(),requests integer not null default 0
);
create table private.bot_events (
 id bigint generated always as identity primary key,bot_id uuid not null references public.bot_apps(id) on delete cascade,
 server_id uuid not null references public.servers(id) on delete cascade,channel_id uuid not null references public.channels(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,command text not null,args text not null,created_at timestamptz not null default now()
);
create index bot_credentials_expiry_idx on private.bot_credentials(expires_at);
create index bot_events_poll_idx on private.bot_events(bot_id,id);
create index bot_events_server_idx on private.bot_events(server_id);
create index bot_events_channel_idx on private.bot_events(channel_id);
create index bot_events_user_idx on private.bot_events(user_id,created_at);
alter table private.bot_devices enable row level security;
alter table private.bot_credentials enable row level security;
alter table private.bot_events enable row level security;
revoke all on private.bot_devices,private.bot_credentials,private.bot_events from public,anon,authenticated;

create function public.bot_pair_start(p_bot uuid,p_device text,p_code text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_bot::text,272));
 if not exists(select 1 from public.bot_apps b where b.id=p_bot and not exists(select 1 from public.platform_bans x where x.user_id=b.owner_id and x.lifted_at is null)) then raise exception 'bot unavailable' using errcode='42501'; end if;
 if exists(select 1 from private.bot_devices where bot_id=p_bot and created_at>now()-interval '30 seconds') then raise exception 'rate limited' using errcode='P0001'; end if;
 delete from private.bot_devices where expires_at<now();
 insert into private.bot_devices(device_hash,user_code,bot_id) values(p_device,p_code,p_bot);
end $$;
create function public.bot_pair_approve(p_code text) returns text language plpgsql security definer set search_path='' as $$
declare v_bot uuid;v_name text;
begin
 if auth.uid() is null or private.is_platform_banned() then raise exception 'unauthorized' using errcode='42501'; end if;
 select d.bot_id,b.name into v_bot,v_name from private.bot_devices d join public.bot_apps b on b.id=d.bot_id where d.user_code=upper(btrim(p_code)) and d.expires_at>now() and b.owner_id=auth.uid() for update of d;
 if v_bot is null then raise exception 'pairing code unavailable' using errcode='42501'; end if;
 update private.bot_devices set approved=true where user_code=upper(btrim(p_code));
 return v_name;
end $$;
create function public.bot_pair_claim(p_device text,p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare d private.bot_devices;
begin
 select * into d from private.bot_devices where device_hash=p_device and expires_at>now() for update;
 if not found then raise exception 'pairing expired' using errcode='42501'; end if;
 if not d.approved then return jsonb_build_object('status','pending'); end if;
 if exists(select 1 from public.bot_apps b join public.platform_bans x on x.user_id=b.owner_id where b.id=d.bot_id and x.lifted_at is null) then raise exception 'bot unavailable' using errcode='42501'; end if;
 insert into private.bot_credentials(bot_id,token_hash) values(d.bot_id,p_token) on conflict(bot_id) do update set token_hash=excluded.token_hash,expires_at=excluded.expires_at;
 delete from private.bot_devices where device_hash=p_device;
 return jsonb_build_object('status','approved','bot_id',d.bot_id);
end $$;
create function public.bot_revoke(p_bot uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or private.is_platform_banned() or not exists(select 1 from public.bot_apps where id=p_bot and owner_id=auth.uid()) then raise exception 'unauthorized' using errcode='42501'; end if;
 delete from private.bot_credentials where bot_id=p_bot;delete from private.bot_devices where bot_id=p_bot;
end $$;

alter table public.messages add column bot_id uuid references public.bot_apps(id) on delete cascade,add column bot_author jsonb;
create index messages_bot_idx on public.messages(bot_id,created_at desc) where bot_id is not null;
create function private.message_bot_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' and old.bot_id is not null and new.bot_id is null and new.bot_author is not distinct from old.bot_author and not exists(select 1 from public.bot_apps where id=old.bot_id) then return new;end if;
 if coalesce(auth.jwt()->>'role','')<>'service_role' and ((tg_op='INSERT' and (new.bot_id is not null or new.bot_author is not null)) or (tg_op='UPDATE' and (new.bot_id is distinct from old.bot_id or new.bot_author is distinct from old.bot_author))) then raise exception 'bot identity is server controlled' using errcode='42501'; end if;
 return new;
end $$;
create trigger message_bot_guard before insert or update on public.messages for each row execute function private.message_bot_guard();

create function public.bot_dispatch(p_bot uuid,p_channel uuid,p_command text,p_args text) returns bigint language plpgsql security definer set search_path='' as $$
declare c public.channels;event_id bigint;
begin
 if auth.uid() is null or private.is_platform_banned() then raise exception 'unauthorized' using errcode='42501'; end if;
 select * into c from public.channels where id=p_channel and type='text';
 if c.id is null or not private.has_channel_permission(c.id,'viewChannel') or not private.has_channel_permission(c.id,'sendMessages') then raise exception 'channel forbidden' using errcode='42501'; end if;
 if char_length(p_args)>2000 or not exists(select 1 from public.bot_installs i join public.bot_apps b on b.id=i.bot_id where i.bot_id=p_bot and i.server_id=c.server_id and c.id=any(i.channel_ids) and exists(select 1 from jsonb_array_elements(b.commands) x where x->>'name'=p_command) and not exists(select 1 from public.platform_bans x where x.user_id=b.owner_id and x.lifted_at is null)) then raise exception 'command unavailable' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,273));
 if(select count(*) from private.bot_events where user_id=auth.uid() and created_at>now()-interval '1 minute')>=30 then raise exception 'rate limited' using errcode='P0001'; end if;
 insert into private.bot_events(bot_id,server_id,channel_id,user_id,command,args) values(p_bot,c.server_id,c.id,auth.uid(),p_command,coalesce(p_args,'')) returning id into event_id;
 return event_id;
end $$;

create function public.bot_api(p_hash text,p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.bot_apps;c public.channels;v_id uuid;v_slow integer;v_requests integer;result jsonb;
begin
 select a.* into b from public.bot_apps a join private.bot_credentials k on k.bot_id=a.id where k.token_hash=p_hash and k.expires_at>now() and not exists(select 1 from public.platform_bans x where x.user_id=a.owner_id and x.lifted_at is null);
 if b.id is null then raise exception 'invalid bot token' using errcode='28000'; end if;
 update private.bot_credentials set requests=case when window_at<now()-interval '1 minute' then 1 else requests+1 end,window_at=case when window_at<now()-interval '1 minute' then now() else window_at end where bot_id=b.id returning requests into v_requests;
 if v_requests>120 then raise exception 'rate limited' using errcode='P0001';end if;
 if p_action='me' then
  return jsonb_build_object('id',b.id,'name',b.name,'installs',coalesce((select jsonb_agg(jsonb_build_object('server_id',i.server_id,'channel_ids',i.channel_ids)) from public.bot_installs i where i.bot_id=b.id),'[]'::jsonb));
 elsif p_action='commands' then
  update public.bot_apps set commands=p_data->'commands' where id=b.id;return jsonb_build_object('ok',true);
 elsif p_action='events' then
  delete from private.bot_events where bot_id=b.id and created_at<now()-interval '7 days';
  select coalesce(jsonb_agg(to_jsonb(e)),'[]'::jsonb) into result from(select e.id::text id,e.command,e.args,e.channel_id,e.user_id,e.created_at from private.bot_events e where e.bot_id=b.id and e.id>coalesce((p_data->>'after')::bigint,0) and exists(select 1 from public.bot_installs i where i.bot_id=b.id and i.server_id=e.server_id and e.channel_id=any(i.channel_ids) and not exists(select 1 from public.server_bans z where z.user_id=b.owner_id and z.server_id=i.server_id)) order by e.id limit 50)e;
  return result;
 elsif p_action='message' then
  select * into c from public.channels where id=(p_data->>'channel_id')::uuid and type='text';
  if c.id is null or not exists(select 1 from public.bot_installs i where i.bot_id=b.id and i.server_id=c.server_id and c.id=any(i.channel_ids)) or exists(select 1 from public.server_bans z where z.user_id=b.owner_id and z.server_id=c.server_id) then raise exception 'channel forbidden' using errcode='42501'; end if;
  if char_length(btrim(coalesce(p_data->>'content',''))) not between 1 and 4000 or (p_data->>'content') ~* '@(everyone|here)' then raise exception 'invalid message' using errcode='23514'; end if;
  v_id:=(p_data->>'nonce')::uuid;if v_id is null then raise exception 'nonce required' using errcode='23514'; end if;
  perform pg_advisory_xact_lock(hashtextextended(b.id::text,274));
  if exists(select 1 from public.messages where id=v_id) then
   if not exists(select 1 from public.messages where id=v_id and bot_id=b.id and channel_id=c.id and content=p_data->>'content') then raise exception 'nonce conflict' using errcode='23514'; end if;
   return jsonb_build_object('id',v_id,'replayed',true);
  end if;
  v_slow:=coalesce(c.slowmode,0);
  if(select count(*) from public.messages where bot_id=b.id and created_at>now()-interval '1 minute')>=30 or (v_slow>0 and exists(select 1 from public.messages where bot_id=b.id and channel_id=c.id and created_at>now()-make_interval(secs=>v_slow))) then raise exception 'rate limited' using errcode='P0001'; end if;
  insert into public.messages(id,channel_id,author_id,content,bot_id,bot_author) values(v_id,c.id,null,p_data->>'content',b.id,jsonb_build_object('id',b.id,'name',b.name,'avatar',b.avatar));
  return jsonb_build_object('id',v_id);
 end if;
 raise exception 'unknown action' using errcode='22023';
end $$;

revoke all on function private.bot_app_guard(),private.bot_install_guard(),private.message_bot_guard() from public,anon,authenticated;
revoke all on function public.bot_pair_start(uuid,text,text),public.bot_pair_claim(text,text),public.bot_api(text,text,jsonb),public.bot_pair_approve(text),public.bot_revoke(uuid),public.bot_dispatch(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.bot_pair_start(uuid,text,text),public.bot_pair_claim(text,text),public.bot_api(text,text,jsonb) to service_role;
grant execute on function public.bot_pair_approve(text),public.bot_revoke(uuid),public.bot_dispatch(uuid,uuid,text,text) to authenticated;

-- Changing a tag requires members to actively choose the new identity again.
create function private.server_tag_reapply() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.label is distinct from old.label or new.image is distinct from old.image or not new.enabled then delete from public.profile_tags where server_id=new.server_id; end if;return new;
end $$;
create trigger server_tag_reapply after update on public.server_tags for each row execute function private.server_tag_reapply();
revoke all on function private.server_tag_reapply() from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_publication where pubname='supabase_realtime') then alter publication supabase_realtime add table public.bot_apps,public.bot_installs;end if;end $$;

create function private.bot_cleanup() returns void language sql security definer set search_path='' as $$
 delete from private.bot_events where created_at<now()-interval '7 days';
 delete from private.bot_devices where expires_at<now();
 delete from private.bot_credentials where expires_at<now();
$$;
revoke all on function private.bot_cleanup() from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_extension where extname='pg_cron') then perform cron.schedule('onyx_bot_cleanup','*/10 * * * *','select private.bot_cleanup()');end if;end $$;
