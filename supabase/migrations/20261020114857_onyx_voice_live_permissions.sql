-- ONYX: laufende Sprachverbindungen nach Rechteänderungen neu prüfen.
-- Nur additive Schema-Erweiterung. HTTP-Aufträge werden erst nach Commit gesendet.
alter table public.voice_states add column permission_version bigint not null default 0;

-- Wiederholbare Zustellung, falls Edge Function oder Room-API vorübergehend ausfallen.
create table private.voice_permission_jobs (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  room text not null, sid text not null, version bigint not null,
  retry_at timestamptz not null default now() + interval '1 minute'
);
alter table private.voice_permission_jobs enable row level security;
revoke all on private.voice_permission_jobs from public, anon, authenticated;

create function private.voice_queue_permissions(p_users uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare v_batch jsonb;
begin
  if coalesce(cardinality(p_users), 0) = 0 then return; end if;
  for v_batch in
    with changed as (
      update public.voice_states s set permission_version = s.permission_version + 1
      where s.user_id = any (p_users) and s.channel_id is not null
      returning s.user_id, s.room, s.sid, s.permission_version
    ), queued as (
      insert into private.voice_permission_jobs (user_id, room, sid, version)
      select user_id, room, sid, permission_version from changed
      on conflict (user_id) do update set room = excluded.room, sid = excluded.sid, version = excluded.version, retry_at = now() + interval '1 minute'
      returning user_id, room, sid, version
    ), numbered as (
      select *, (row_number() over (order by user_id) - 1) / 50 as batch from queued
    )
    select jsonb_agg(jsonb_build_object('identity', user_id, 'room', room, 'sid', sid, 'version', version::text) order by user_id)
    from numbered group by batch
  loop
    perform private.voice_signal(jsonb_build_object('action', 'permissions', 'targets', v_batch));
  end loop;
end;
$$;

-- Transition-Tabellen: ein Bündel pro Anweisung, keine HTTP-Abfrage pro geänderter Zeile.
create function private.voice_permissions_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_rows jsonb;
  v_users uuid[];
begin
  if tg_op = 'INSERT' then execute 'select coalesce(jsonb_agg(to_jsonb(n)), ''[]''::jsonb) from new_rows n' into v_rows;
  elsif tg_op = 'DELETE' then execute 'select coalesce(jsonb_agg(to_jsonb(o)), ''[]''::jsonb) from old_rows o' into v_rows;
  else
    if tg_table_name = 'roles' then
      execute 'select coalesce(jsonb_agg(to_jsonb(n)), ''[]''::jsonb) from new_rows n join old_rows o using (id) where (n.permissions, n.is_default, n.server_id) is distinct from (o.permissions, o.is_default, o.server_id)' into v_rows;
    elsif tg_table_name = 'channels' then
      execute 'select coalesce(jsonb_agg(to_jsonb(n)), ''[]''::jsonb) from new_rows n join old_rows o using (id) where (n.category_id, n.type, n.server_id) is distinct from (o.category_id, o.type, o.server_id)' into v_rows;
    elsif tg_table_name = 'servers' then
      execute 'select coalesce(jsonb_agg(to_jsonb(n)), ''[]''::jsonb) from new_rows n join old_rows o using (id) where n.owner_id is distinct from o.owner_id' into v_rows;
    else
      execute 'select coalesce(jsonb_agg(r), ''[]''::jsonb) from (select to_jsonb(n) r from new_rows n union select to_jsonb(o) from old_rows o) q' into v_rows;
    end if;
  end if;
  if v_rows = '[]'::jsonb then return null; end if;
  select array_agg(distinct s.user_id) into v_users
  from public.voice_states s join public.channels c on c.id = s.channel_id
  where exists (
    select 1 from jsonb_array_elements(v_rows) r
    where case tg_table_name
      when 'roles' then (r->>'server_id')::uuid = s.server_id
      when 'servers' then (r->>'id')::uuid = s.server_id
      when 'member_roles' then (r->>'server_id')::uuid = s.server_id and (r->>'user_id')::uuid = s.user_id
      when 'permission_overwrites' then (r->>'channel_id')::uuid = s.channel_id or (r->>'category_id')::uuid = c.category_id
      when 'channels' then (r->>'id')::uuid = s.channel_id
      else false
    end
  );
  perform private.voice_queue_permissions(v_users);
  return null;
end;
$$;

do $$
declare v_table text;
begin
  foreach v_table in array array['permission_overwrites', 'member_roles', 'roles'] loop
    execute format('create trigger voice_permissions_insert after insert on public.%I referencing new table as new_rows for each statement execute function private.voice_permissions_changed()', v_table);
    execute format('create trigger voice_permissions_update after update on public.%I referencing old table as old_rows new table as new_rows for each statement execute function private.voice_permissions_changed()', v_table);
    execute format('create trigger voice_permissions_delete after delete on public.%I referencing old table as old_rows for each statement execute function private.voice_permissions_changed()', v_table);
  end loop;
end;
$$;
create trigger voice_permissions_update after update on public.channels referencing old table as old_rows new table as new_rows
  for each statement execute function private.voice_permissions_changed();
create trigger voice_permissions_update after update on public.servers referencing old table as old_rows new table as new_rows
  for each statement execute function private.voice_permissions_changed();

-- Frische Rechte für genau diese Verbindung. Alte Aufträge treffen niemals eine neue SID.
-- Keine Rate-Limits oder Move-Tickets verbrauchen; nur die Edge Function darf aufrufen.
create function public.voice_permissions_snapshot(p_targets jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  s public.voice_states;
  c public.channels;
  p public.permission[];
  v_mute boolean;
  v_deaf boolean;
  v_out jsonb := '[]'::jsonb;
begin
  perform private.require_service_role();
  if jsonb_typeof(p_targets) <> 'array' or jsonb_array_length(p_targets) > 50 then
    raise exception 'invalid targets' using errcode = '22023';
  end if;
  for r in select * from jsonb_to_recordset(p_targets) as x(identity uuid, room text, sid text) loop
    select * into s from public.voice_states vs where vs.user_id = r.identity and vs.room = r.room and vs.sid = r.sid for update;
    if not found or s.channel_id is null then
      v_out := v_out || jsonb_build_array(jsonb_build_object('action', 'ignore', 'identity', r.identity, 'room', r.room, 'sid', r.sid));
      continue;
    end if;
    select * into c from public.channels ch where ch.id = s.channel_id;
    p := private._scope_permissions(s.server_id, c.id, c.category_id, true, s.user_id);
    if c.type <> 'voice' or not coalesce('connect' = any (p), false)
      or exists (select 1 from public.platform_bans b where b.user_id = s.user_id and b.lifted_at is null) then
      -- Erst das bestätigte LiveKit-Leave entfernt den Status. Sonst könnte
      -- ein fehlgeschlagener Rauswurf beim nächsten Versuch als „ignore“ gelten.
      v_out := v_out || jsonb_build_array(jsonb_build_object('action', 'evict', 'identity', s.user_id, 'room', s.room, 'sid', s.sid, 'version', s.permission_version::text));
      continue;
    end if;
    select f.mute, f.deaf into v_mute, v_deaf from private.voice_member_flags f where f.server_id = s.server_id and f.user_id = s.user_id;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'action', 'permissions', 'identity', s.user_id, 'room', s.room, 'sid', s.sid, 'version', s.permission_version::text,
      'can_speak', 'speak' = any (p) and not coalesce(v_mute, false), 'can_video', 'video' = any (p), 'can_screen', 'screenShare' = any (p), 'can_subscribe', not coalesce(v_deaf, false)));
  end loop;
  return v_out;
end;
$$;

revoke all on function private.voice_queue_permissions(uuid[]) from public, anon, authenticated;
revoke all on function private.voice_permissions_changed() from public, anon, authenticated;
revoke all on function public.voice_permissions_snapshot(jsonb) from public, anon, authenticated;
grant execute on function public.voice_permissions_snapshot(jsonb) to service_role;

create function public.voice_permissions_complete(p_targets jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_service_role();
  delete from private.voice_permission_jobs j using jsonb_to_recordset(p_targets) as x(identity uuid, room text, sid text, version bigint)
  where j.user_id = x.identity and j.room = x.room and j.sid = x.sid and j.version <= x.version;
end;
$$;
revoke all on function public.voice_permissions_complete(jsonb) from public, anon, authenticated;
grant execute on function public.voice_permissions_complete(jsonb) to service_role;

create function private.voice_retry_permissions() returns void
language plpgsql security definer set search_path = '' as $$
declare v_batch jsonb;
begin
  delete from private.voice_permission_jobs j where not exists (select 1 from public.voice_states s where s.user_id = j.user_id and s.room = j.room and s.sid = j.sid);
  for v_batch in
    with ready as (
      select user_id from private.voice_permission_jobs where retry_at <= now() order by retry_at limit 500 for update skip locked
    ), claimed as (
      update private.voice_permission_jobs j set retry_at = now() + interval '1 minute' from ready r where j.user_id = r.user_id returning j.*
    ), numbered as (select *, (row_number() over (order by user_id) - 1) / 50 as batch from claimed)
    select jsonb_agg(jsonb_build_object('identity', user_id, 'room', room, 'sid', sid, 'version', version::text)) from numbered group by batch
  loop perform private.voice_signal(jsonb_build_object('action', 'permissions', 'targets', v_batch)); end loop;
end;
$$;
revoke all on function private.voice_retry_permissions() from public, anon, authenticated;
create extension if not exists pg_cron;
select cron.schedule('onyx-voice-permissions', '* * * * *', 'select private.voice_retry_permissions()');

-- Aktivität am Server-Icon: nur ein Invalidierungssignal pro Server/Anweisung.
-- Namen, Kanal-IDs und Zahlen werden nicht an Servermitglieder ausgesendet.
-- Die anschließende Abfrage läuft als Benutzer und filtert über voice_states-RLS.
create function public.voice_server_activity() returns table(server_id uuid)
language sql stable security invoker set search_path = '' as $$
  select distinct s.server_id from public.voice_states s where s.channel_id is not null
$$;
revoke all on function public.voice_server_activity() from public, anon;
grant execute on function public.voice_server_activity() to authenticated;

create or replace function private.can_join_voice_topic(p_topic text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when auth.uid() is null then false
    when p_topic = 'calls:' || auth.uid()::text then true
    when private.topic_id(p_topic, 'voice-activity:') is not null then
      private.is_server_member(private.topic_id(p_topic, 'voice-activity:'))
    when private.topic_id(p_topic, 'voice:') is null then false
    else coalesce(private.has_channel_permission(private.topic_id(p_topic, 'voice:'), 'viewChannel'), false)
      or coalesce(private.is_dm_participant(private.topic_id(p_topic, 'voice:')), false)
  end
$$;

create function private.voice_activity_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_servers uuid[]; v_server uuid;
begin
  if tg_op = 'INSERT' then
    select array_agg(distinct server_id) into v_servers from new_rows where server_id is not null;
  elsif tg_op = 'DELETE' then
    select array_agg(distinct server_id) into v_servers from old_rows where server_id is not null;
  else
    select array_agg(distinct id) into v_servers from (
      select n.server_id id from new_rows n join old_rows o using (user_id) where n.channel_id is distinct from o.channel_id
      union select o.server_id from new_rows n join old_rows o using (user_id) where n.channel_id is distinct from o.channel_id
    ) q where id is not null;
  end if;
  foreach v_server in array coalesce(v_servers, '{}'::uuid[]) loop
    begin
      perform realtime.send('{}'::jsonb, 'refresh', 'voice-activity:' || v_server, true);
    exception when others then raise warning 'onyx: voice activity broadcast failed: %', sqlerrm;
    end;
  end loop;
  return null;
end;
$$;
create trigger voice_activity_insert after insert on public.voice_states referencing new table as new_rows
  for each statement execute function private.voice_activity_changed();
create trigger voice_activity_delete after delete on public.voice_states referencing old table as old_rows
  for each statement execute function private.voice_activity_changed();
create trigger voice_activity_update after update on public.voice_states referencing old table as old_rows new table as new_rows
  for each statement execute function private.voice_activity_changed();
revoke all on function private.voice_activity_changed() from public, anon, authenticated;

-- Verspätete Join-Ereignisse dürfen entzogene Rechte nicht umgehen.
create or replace function public.voice_event(p jsonb) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_event text := p->>'event';
  v_room text := p->>'room';
  v_sid text := coalesce(p->>'sid', '');
  v_at timestamptz := coalesce(to_timestamp(nullif(p->>'at', '')::double precision), now());
  v_identity uuid;
  v_kind text;
  v_id uuid;
  c public.channels;
  v_permissions public.permission[];
  v_mute boolean;
  v_deaf boolean;
  v_on boolean;
  v_source text := upper(coalesce(p->>'source', ''));
begin
  perform private.require_service_role();
  if v_room ~ '^channel:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_kind := 'channel';
    v_id := substr(v_room, 9)::uuid;
  elsif v_room ~ '^dm:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_kind := 'dm';
    v_id := substr(v_room, 4)::uuid;
  else
    return 'ignored: room';
  end if;

  if v_event = 'room_finished' then
    delete from public.voice_states vs where vs.room = v_room and vs.event_at <= v_at;
    if v_kind = 'dm' then
      update public.calls set ended_at = now() where dm_id = v_id and ended_at is null and started_at <= v_at;
    end if;
    return 'ok';
  end if;
  if v_event not in ('participant_joined', 'participant_left', 'participant_connection_aborted', 'track_published', 'track_unpublished') then
    return 'ignored: event';
  end if;

  -- Nur echte Konten (keine Aufnahme-/Agent-Teilnehmer).
  if coalesce(p->>'identity', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return 'ignored: identity';
  end if;
  v_identity := (p->>'identity')::uuid;

  if v_event = 'participant_joined' then
    if not exists (select 1 from public.profiles pr where pr.id = v_identity) then
      return 'ignored: unknown user';
    end if;
    if exists (select 1 from public.platform_bans b where b.user_id = v_identity and b.lifted_at is null) then
      return 'ignored: no access';
    end if;
    if v_kind = 'channel' then
      select * into c from public.channels ch where ch.id = v_id and ch.type = 'voice';
      if not found or not exists (select 1 from public.server_members m where m.server_id = c.server_id and m.user_id = v_identity) then
        return 'ignored: no access';
      end if;
      v_permissions := private._scope_permissions(c.server_id, c.id, c.category_id, true, v_identity);
      if not coalesce('connect' = any(v_permissions), false) then return 'ignored: no access'; end if;
      select f.mute, f.deaf into v_mute, v_deaf from private.voice_member_flags f where f.server_id = c.server_id and f.user_id = v_identity;
      insert into public.voice_states as s (user_id, room, server_id, channel_id, sid, joined_at, event_at, server_mute, server_deaf)
      values (v_identity, v_room, c.server_id, c.id, v_sid, v_at, v_at, coalesce(v_mute, false), coalesce(v_deaf, false))
      on conflict (user_id) do update set
        room = excluded.room, server_id = excluded.server_id, channel_id = excluded.channel_id, dm_id = null, sid = excluded.sid,
        joined_at = excluded.joined_at, event_at = excluded.event_at, server_mute = excluded.server_mute, server_deaf = excluded.server_deaf,
        camera = false, screen = false
      where s.event_at <= excluded.event_at and (s.sid <> excluded.sid or s.room <> excluded.room);
    else
      if not exists (select 1 from public.dm_participants dp where dp.dm_id = v_id and dp.user_id = v_identity) then
        return 'ignored: no access';
      end if;
      if exists (select 1 from public.dm_channels d where d.id = v_id and d.type = 'dm'
        and (not exists (select 1 from public.dm_participants o where o.dm_id = v_id and o.user_id <> v_identity)
          or exists (select 1 from public.dm_participants o where o.dm_id = v_id and o.user_id <> v_identity and private.is_blocked_between(v_identity, o.user_id)))) then
        return 'ignored: no access';
      end if;
      insert into public.voice_states as s (user_id, room, dm_id, sid, joined_at, event_at)
      values (v_identity, v_room, v_id, v_sid, v_at, v_at)
      on conflict (user_id) do update set
        room = excluded.room, server_id = null, channel_id = null, dm_id = excluded.dm_id, sid = excluded.sid,
        joined_at = excluded.joined_at, event_at = excluded.event_at, server_mute = false, server_deaf = false,
        camera = false, screen = false
      where s.event_at <= excluded.event_at and (s.sid <> excluded.sid or s.room <> excluded.room);
      -- Kurz nach dem Ende wieder da (Verbindung neu aufgebaut)? Dann läuft derselbe Anruf weiter.
      if not exists (select 1 from public.calls k where k.dm_id = v_id and k.ended_at is null) then
        update public.calls set ended_at = null
        where id = (select k.id from public.calls k where k.dm_id = v_id and k.ended_at > now() - interval '60 seconds' order by k.started_at desc limit 1);
      end if;
      update public.calls k set joined = case when v_identity = any (k.joined) then k.joined else array_append(k.joined, v_identity) end, updated_at = now()
      where k.dm_id = v_id and k.ended_at is null;
    end if;
    return 'ok';
  end if;

  if v_event in ('participant_left', 'participant_connection_aborted') then
    delete from public.voice_states vs where vs.user_id = v_identity and vs.sid = v_sid;
    if v_kind = 'dm' then
      update public.calls set updated_at = now() where dm_id = v_id and ended_at is null;
      if not exists (select 1 from public.voice_states vs where vs.dm_id = v_id) then
        update public.calls set ended_at = now() where dm_id = v_id and ended_at is null;
      end if;
    end if;
    return 'ok';
  end if;

  -- track_published / track_unpublished: Kamera und Bildschirm für die Anzeige in der Kanalliste
  v_on := v_event = 'track_published';
  if v_source = 'CAMERA' then
    update public.voice_states set camera = v_on where user_id = v_identity and sid = v_sid;
  elsif v_source = 'SCREEN_SHARE' then
    update public.voice_states set screen = v_on where user_id = v_identity and sid = v_sid;
  end if;
  return 'ok';
end;
$$;
