-- Confirmed reports are the only source of automatic Bug Hunter awards.
alter table public.bug_reports drop constraint bug_reports_status_check;
update public.bug_reports set status=case when status='resolved' then 'confirmed' else 'open' end where status in ('triaged','resolved');
alter table public.bug_reports add constraint bug_reports_status_check check(status in ('open','confirmed','not_bug'));
create index bug_reports_confirmed_reporter_idx on public.bug_reports(reporter_id) where status='confirmed';
create table private.bug_hunter_awards(user_id uuid primary key references public.profiles(id) on delete cascade);
alter table private.bug_hunter_awards enable row level security;
revoke all on private.bug_hunter_awards from public,anon,authenticated;
create function private.sync_bug_hunter(p_user uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.profiles where id=p_user for update;
 if not found then return;end if;
 if exists(select 1 from public.bug_reports where reporter_id=p_user and status='confirmed') then
  if not exists(select 1 from public.user_badges where user_id=p_user and badge='bug-hunter') then
   insert into private.bug_hunter_awards(user_id) values(p_user) on conflict do nothing;
   perform private.grant_badge(p_user,'bug-hunter');
  end if;
 elsif exists(select 1 from private.bug_hunter_awards where user_id=p_user) then
  delete from public.user_badges where user_id=p_user and badge='bug-hunter';
  update public.profiles set badges=array_remove(badges,'bug-hunter') where id=p_user;
  delete from private.bug_hunter_awards where user_id=p_user;
 end if;
end $$;
revoke all on function private.sync_bug_hunter(uuid) from public,anon,authenticated;
create function private.bug_hunter_from_report() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then perform private.sync_bug_hunter(old.reporter_id);return old;end if;
 if tg_op='INSERT' or new.status is distinct from old.status then perform private.sync_bug_hunter(new.reporter_id);end if;
 return new;
end $$;
revoke all on function private.bug_hunter_from_report() from public,anon,authenticated;
create trigger bug_hunter_from_report after insert or update or delete on public.bug_reports for each row execute function private.bug_hunter_from_report();
do $$declare v_user uuid;begin for v_user in select distinct reporter_id from public.bug_reports where status='confirmed' loop perform private.sync_bug_hunter(v_user);end loop;end $$;
alter publication supabase_realtime add table public.bug_reports;

-- Resolve the configured community by rayvn's existing permanent invite.
alter table public.servers add column is_official boolean not null default false;
create unique index servers_one_official_idx on public.servers(is_official) where is_official;
do $$declare v_server uuid;begin
 select s.id into v_server from public.invites i join public.servers s on s.id=i.server_id where i.code='3ibbk3x7kh' and (i.expires_at is null or i.expires_at>now()) and (i.max_uses is null or i.uses<i.max_uses);
 if v_server is null then raise exception 'configured ONYX community invite unavailable';end if;
 update public.servers set is_official=true where id=v_server;
end $$;
create function private.ensure_official_member(p_user uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare v_server uuid;
begin
 select id into v_server from public.servers where is_official;
 if v_server is null or not exists(select 1 from public.profiles where id=p_user) then return null;end if;
 if exists(select 1 from public.platform_bans where user_id=p_user and lifted_at is null) or exists(select 1 from public.server_bans where server_id=v_server and user_id=p_user) then return null;end if;
 insert into public.server_members(server_id,user_id) values(v_server,p_user) on conflict do nothing;
 return v_server;
end $$;
revoke all on function private.ensure_official_member(uuid) from public,anon,authenticated;
create function private.ensure_own_official_server() returns uuid language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or private.is_platform_banned() then raise exception 'not allowed' using errcode='42501';end if;
 return private.ensure_official_member(auth.uid());
end $$;
revoke all on function private.ensure_own_official_server() from public,anon;
grant execute on function private.ensure_own_official_server() to authenticated;
create function public.ensure_official_server() returns uuid language sql security invoker set search_path='' as $$select private.ensure_own_official_server()$$;
revoke all on function public.ensure_official_server() from public,anon;
grant execute on function public.ensure_official_server() to authenticated;
create function private.profile_join_official_server() returns trigger language plpgsql security definer set search_path='' as $$
begin perform private.ensure_official_member(new.id);return new;end $$;
revoke all on function private.profile_join_official_server() from public,anon,authenticated;
create trigger profile_join_official_server after insert on public.profiles for each row execute function private.profile_join_official_server();
create function private.protect_official_server() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='server_members' then
  -- Account deletion still cascades. Kicks/bans by another authorized account still work.
  if old.user_id=auth.uid() and exists(select 1 from public.profiles where id=old.user_id) and exists(select 1 from public.servers where id=old.server_id and is_official) then raise exception 'official community membership is required' using errcode='42501';end if;
 elsif old.is_official and (tg_op='DELETE' or not new.is_official) then
  raise exception 'official community is protected' using errcode='42501';
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function private.protect_official_server() from public,anon,authenticated;
create trigger protect_official_membership before delete on public.server_members for each row execute function private.protect_official_server();
create trigger protect_official_server before delete or update on public.servers for each row execute function private.protect_official_server();
insert into public.server_members(server_id,user_id)
 select s.id,p.id from public.servers s cross join public.profiles p where s.is_official
 and not exists(select 1 from public.platform_bans b where b.user_id=p.id and b.lifted_at is null)
 and not exists(select 1 from public.server_bans b where b.server_id=s.id and b.user_id=p.id)
 on conflict do nothing;

-- Rate-limited, authenticated template import; creation and permissions commit atomically.
create function private.discord_import_gate(p_kind text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or private.is_platform_banned() then raise exception 'not allowed' using errcode='42501';end if;
 if p_kind not in ('preview','import','commit') then raise exception 'invalid import action';end if;
 perform pg_advisory_xact_lock(hashtextextended('discord-import-limit:'||auth.uid()::text,0));
 perform private.hit_rate_limit('discord_'||p_kind,case when p_kind='preview' then 30 when p_kind='import' then 20 else 10 end,case when p_kind='preview' then interval '10 minutes' else interval '1 hour' end);
end $$;
revoke all on function private.discord_import_gate(text) from public,anon;
grant execute on function private.discord_import_gate(text) to authenticated;
create function public.discord_import_gate(p_kind text) returns void language sql security invoker set search_path='' as $$select private.discord_import_gate(p_kind)$$;
revoke all on function public.discord_import_gate(text) from public,anon;
grant execute on function public.discord_import_gate(text) to authenticated;
create function public.import_discord_server(p jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare v_server uuid:=(p->>'id')::uuid;v_owner uuid;v_count integer;
begin
 if auth.uid() is null or private.is_platform_banned() then raise exception 'not allowed' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('discord-import-create:'||auth.uid()::text,0));
 select owner_id into v_owner from public.servers where id=v_server;
 if v_owner=auth.uid() then return v_server;end if;
 perform private.discord_import_gate('commit');
 if jsonb_typeof(p)<>'object' or pg_column_size(p)>750000 or jsonb_array_length(coalesce(p->'overwrites','[]'))>5000 then raise exception 'template too large';end if;
 v_server:=public.create_server(p||jsonb_build_object('memberRoleIds','[]'::jsonb,'systemChannelId',null));
 -- All channel/role/category UUIDs are new. Existing FK and RLS rules bind every write to this server.
 update public.servers set description=left(coalesce(p->>'description',''),1000) where id=v_server;
 update public.channels c set slowmode=coalesce((x->>'slowmode')::integer,0),age_restricted=coalesce((x->>'ageRestricted')::boolean,false),user_limit=coalesce((x->>'userLimit')::integer,0)
 from jsonb_array_elements(p->'channels') x where c.server_id=v_server and c.id=(x->>'id')::uuid;
 if exists(select 1 from jsonb_array_elements(coalesce(p->'overwrites','[]')) x where not exists(select 1 from public.roles r where r.server_id=v_server and r.id=(x->>'roleId')::uuid) or not exists(select 1 from public.channels c where c.server_id=v_server and c.id=(x->>'channelId')::uuid)) then raise exception 'invalid import permission scope' using errcode='42501';end if;
 insert into public.permission_overwrites(server_id,channel_id,target_type,target_id,allow,deny)
 select v_server,(x->>'channelId')::uuid,'role',(x->>'roleId')::uuid,
 array(select jsonb_array_elements_text(coalesce(x->'allow','[]')))::public.permission[],array(select jsonb_array_elements_text(coalesce(x->'deny','[]')))::public.permission[]
 from jsonb_array_elements(coalesce(p->'overwrites','[]')) x;
 return v_server;
end $$;
revoke all on function public.import_discord_server(jsonb) from public,anon;
grant execute on function public.import_discord_server(jsonb) to authenticated;
