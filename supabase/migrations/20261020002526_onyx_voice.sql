-- ONYX – Sprach- und Videochat, Teil 2
--
-- Ton und Bild laufen über einen SFU (LiveKit). Die Edge Function "voice"
-- stellt nach den Prüfungen hier die Zugangs-Tokens aus, "voice-webhook"
-- trägt die Ereignisse von LiveKit ein. Die Datenbank kennt:
--
--   public.voice_states   Wer ist gerade in welchem Sprachkanal bzw. DM-Anruf?
--                         Schreibt nur der Webhook (service_role); die eigene
--                         Stumm-/Taub-Anzeige setzt voice_set_self().
--   public.calls          Anrufe in DMs und Gruppen. id = id der Systemnachricht
--                         (Typ "call") im Chat.
--   private.voice_member_flags  Server-Stumm/-Taub pro Mitglied (bleibt beim Neubeitritt).
--   private.voice_moves   kurzlebige Tickets fürs Verschieben (dürfen in volle Kanäle).
--   private.voice_config  URL + Geheimnis für Datenbank → voice-webhook
--                         (Rauswurf aus dem Raum bei Kick, Bann, Sperre, Löschen).
--
-- Live-Updates: Realtime-Broadcast an "voice:<kanal- oder dm-id>" und
-- "calls:<user-id>". Die Berechtigung prüft Realtime einmal beim Beitreten –
-- nicht pro Änderung und Abonnent wie bei postgres_changes.

/* ------------------------------------------------------------------ */
/* Neue Rechte: wer bisher gleichwertige hatte, bekommt sie dazu         */
/* ------------------------------------------------------------------ */

update public.roles set permissions = private._perm_union(permissions, array['screenShare']::public.permission[])
  where 'video' = any (permissions) and not ('screenShare' = any (permissions));
update public.roles set permissions = private._perm_union(permissions, array['deafenMembers', 'moveMembers']::public.permission[])
  where 'muteMembers' = any (permissions) and not ('deafenMembers' = any (permissions) and 'moveMembers' = any (permissions));
update public.permission_overwrites set allow = private._perm_union(allow, array['screenShare']::public.permission[])
  where 'video' = any (allow) and not ('screenShare' = any (allow));
update public.permission_overwrites set deny = private._perm_union(deny, array['screenShare']::public.permission[])
  where 'video' = any (deny) and not ('screenShare' = any (deny));

/* ------------------------------------------------------------------ */
/* Tabellen                                                             */
/* ------------------------------------------------------------------ */

create table public.voice_states (
  -- Ein Konto ist höchstens in einem Raum (wie bei Discord).
  user_id uuid primary key references public.profiles (id) on delete cascade,
  -- LiveKit-Raum: "channel:<id>" bzw. "dm:<id>"
  room text not null,
  server_id uuid references public.servers (id) on delete cascade,
  channel_id uuid,
  dm_id uuid references public.dm_channels (id) on delete cascade,
  -- Teilnehmer-SID bei LiveKit: ein "verlassen" gilt nur für genau diese Verbindung.
  sid text not null,
  joined_at timestamptz not null default now(),
  -- Zeit des zuletzt angewendeten LiveKit-Ereignisses (Reihenfolge).
  event_at timestamptz not null default now(),
  self_mute boolean not null default false,
  self_deaf boolean not null default false,
  server_mute boolean not null default false,
  server_deaf boolean not null default false,
  camera boolean not null default false,
  screen boolean not null default false,
  constraint voice_states_one_target check ((channel_id is null) <> (dm_id is null)),
  constraint voice_states_server check ((channel_id is null) = (server_id is null)),
  constraint voice_states_room check (room = case when channel_id is not null then 'channel:' || channel_id else 'dm:' || dm_id end),
  foreign key (channel_id, server_id) references public.channels (id, server_id) on delete cascade
);

create index voice_states_channel_idx on public.voice_states (channel_id, server_id) where channel_id is not null;
create index voice_states_server_idx on public.voice_states (server_id) where server_id is not null;
create index voice_states_dm_idx on public.voice_states (dm_id) where dm_id is not null;
create index voice_states_room_idx on public.voice_states (room);

create table public.calls (
  id uuid primary key references public.messages (id) on delete cascade,
  dm_id uuid not null references public.dm_channels (id) on delete cascade,
  started_by uuid references public.profiles (id) on delete set null,
  started_at timestamptz not null default now(),
  -- letzte Änderung der Teilnehmer (Ende eines liegengebliebenen Anrufs)
  updated_at timestamptz not null default now(),
  ended_at timestamptz,
  video boolean not null default false,
  -- wer zu irgendeinem Zeitpunkt im Anruf war bzw. abgelehnt hat
  joined uuid[] not null default '{}',
  declined uuid[] not null default '{}'
);

create unique index calls_one_active_idx on public.calls (dm_id) where ended_at is null;
create index calls_dm_idx on public.calls (dm_id, started_at desc);
create index calls_started_by_idx on public.calls (started_by);

create table private.voice_member_flags (
  server_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  mute boolean not null default false,
  deaf boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (server_id, user_id),
  foreign key (server_id, user_id) references public.server_members (server_id, user_id) on delete cascade
);

create index voice_member_flags_user_idx on private.voice_member_flags (user_id);

create table private.voice_moves (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  channel_id uuid not null references public.channels (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index voice_moves_channel_idx on private.voice_moves (channel_id);

create table private.voice_config (
  id boolean primary key default true check (id),
  -- wird von der Edge Function voice-webhook beim ersten Aufruf eingetragen
  url text,
  secret text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  created_at timestamptz not null default now()
);

insert into private.voice_config default values;

alter table private.voice_member_flags enable row level security;
alter table private.voice_moves enable row level security;
alter table private.voice_config enable row level security;
revoke all on table private.voice_member_flags, private.voice_moves, private.voice_config from public, anon, authenticated;

/* ------------------------------------------------------------------ */
/* RLS: lesen wie der Kanal bzw. die DM, schreiben nur über Funktionen   */
/* ------------------------------------------------------------------ */

alter table public.voice_states enable row level security;
revoke all on table public.voice_states from anon, authenticated;
grant select on public.voice_states to authenticated;
create policy "voice_states: sichtbar mit Kanal bzw. DM" on public.voice_states for select to authenticated
  using (case when channel_id is not null then private.has_channel_permission(channel_id, 'viewChannel') else private.is_dm_participant(dm_id) end);

alter table public.calls enable row level security;
revoke all on table public.calls from anon, authenticated;
grant select on public.calls to authenticated;
create policy "calls: Teilnehmer der DM" on public.calls for select to authenticated
  using (private.is_dm_participant(dm_id));

create trigger block_suspended_writes before insert or update or delete on public.voice_states
  for each statement execute function private.block_suspended_writes();
create trigger block_suspended_writes before insert or update or delete on public.calls
  for each statement execute function private.block_suspended_writes();

/* ------------------------------------------------------------------ */
/* Realtime                                                             */
/* ------------------------------------------------------------------ */

/** Was Clients über einen Teilnehmer erfahren. */
create function private.voice_state_json(v public.voice_states) returns jsonb
language sql immutable set search_path = ''
as $$
  select jsonb_build_object(
    'user_id', v.user_id, 'server_id', v.server_id, 'channel_id', v.channel_id, 'dm_id', v.dm_id, 'joined_at', v.joined_at,
    'self_mute', v.self_mute, 'self_deaf', v.self_deaf, 'server_mute', v.server_mute, 'server_deaf', v.server_deaf,
    'camera', v.camera, 'screen', v.screen)
$$;

create function private.voice_states_broadcast() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and private.voice_state_json(new) = private.voice_state_json(old) and new.room = old.room then
    return null;
  end if;
  begin
    if tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.room <> old.room) then
      perform realtime.send(jsonb_build_object('user_id', old.user_id), 'leave', 'voice:' || coalesce(old.channel_id, old.dm_id), true);
    end if;
    if tg_op <> 'DELETE' then
      perform realtime.send(private.voice_state_json(new), 'state', 'voice:' || coalesce(new.channel_id, new.dm_id), true);
    end if;
  exception when others then
    -- Ein Problem mit Realtime darf den Status nie blockieren (der Client lädt beim Öffnen neu).
    raise warning 'onyx: voice broadcast failed: %', sqlerrm;
  end;
  return null;
end;
$$;

create trigger voice_states_broadcast after insert or update or delete on public.voice_states
  for each row execute function private.voice_states_broadcast();

create function private.calls_broadcast() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid;
begin
  for v_user in select dp.user_id from public.dm_participants dp where dp.dm_id = new.dm_id loop
    begin
      perform realtime.send(to_jsonb(new), 'call', 'calls:' || v_user, true);
    exception when others then
      raise warning 'onyx: call broadcast failed: %', sqlerrm;
    end;
  end loop;
  return null;
end;
$$;

create trigger calls_broadcast after insert or update on public.calls
  for each row execute function private.calls_broadcast();

/** Realtime: Sprach-Status eines sichtbaren Kanals bzw. einer eigenen DM, eigene Anrufe. */
create function private.can_join_voice_topic(p_topic text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select case
    when auth.uid() is null then false
    when p_topic = 'calls:' || auth.uid()::text then true
    when private.topic_id(p_topic, 'voice:') is null then false
    else coalesce(private.has_channel_permission(private.topic_id(p_topic, 'voice:'), 'viewChannel'), false)
      or coalesce(private.is_dm_participant(private.topic_id(p_topic, 'voice:')), false)
  end
$$;

do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute $p$create policy "onyx: Sprach-Status und Anrufe" on realtime.messages for select to authenticated
      using (private.can_join_voice_topic((select realtime.topic())))$p$;
  end if;
end;
$$;

/* ------------------------------------------------------------------ */
/* Datenbank → Edge Function: aus dem Raum werfen                       */
/* ------------------------------------------------------------------ */

/** Schickt einen Auftrag an voice-webhook (über pg_net, erst nach dem Commit; ein Fehler blockiert nie). */
create function private.voice_signal(p_body jsonb) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select c.url, c.secret into v_url, v_secret from private.voice_config c;
  if v_url is null then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    body := p_body,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-onyx-voice', v_secret),
    timeout_milliseconds := 8000
  );
exception when others then
  raise warning 'onyx: voice signal failed: %', sqlerrm;
end;
$$;

/** Mitglied verlässt den Server (Kick, Bann, selbst) → raus aus dessen Sprachkanal. */
create function private.voice_member_removed() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
begin
  for r in delete from public.voice_states vs where vs.user_id = old.user_id and vs.server_id = old.server_id returning vs.room loop
    perform private.voice_signal(jsonb_build_object('action', 'evict', 'room', r.room, 'identity', old.user_id));
  end loop;
  return null;
end;
$$;

create trigger voice_member_removed after delete on public.server_members
  for each row execute function private.voice_member_removed();

/** Person verlässt eine Gruppe → raus aus deren Anruf. */
create function private.voice_dm_participant_removed() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
begin
  for r in delete from public.voice_states vs where vs.user_id = old.user_id and vs.dm_id = old.dm_id returning vs.room loop
    perform private.voice_signal(jsonb_build_object('action', 'evict', 'room', r.room, 'identity', old.user_id));
  end loop;
  return null;
end;
$$;

create trigger voice_dm_participant_removed after delete on public.dm_participants
  for each row execute function private.voice_dm_participant_removed();

/** Sprachkanal bzw. DM wird gelöscht → Raum schließen (alle fliegen raus). */
create function private.voice_room_deleted() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_table_name = 'channels' then
    if old.type = 'voice' and exists (select 1 from public.voice_states vs where vs.channel_id = old.id) then
      perform private.voice_signal(jsonb_build_object('action', 'close', 'room', 'channel:' || old.id));
    end if;
  elsif exists (select 1 from public.voice_states vs where vs.dm_id = old.id) then
    perform private.voice_signal(jsonb_build_object('action', 'close', 'room', 'dm:' || old.id));
  end if;
  return old;
end;
$$;

create trigger voice_room_deleted before delete on public.channels
  for each row execute function private.voice_room_deleted();
create trigger voice_room_deleted before delete on public.dm_channels
  for each row execute function private.voice_room_deleted();

/** ONYX-weite Sperre → sofort aus jedem Raum. */
create function private.voice_platform_banned() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
begin
  if new.lifted_at is not null then
    return null;
  end if;
  for r in delete from public.voice_states vs where vs.user_id = new.user_id returning vs.room loop
    perform private.voice_signal(jsonb_build_object('action', 'evict', 'room', r.room, 'identity', new.user_id));
  end loop;
  return null;
end;
$$;

create trigger voice_platform_banned after insert on public.platform_bans
  for each row execute function private.voice_platform_banned();

/* ------------------------------------------------------------------ */
/* Für die App (mit dem JWT der Person, über die Edge Function)          */
/* ------------------------------------------------------------------ */

/**
 * Darf ich diesem Sprachkanal bzw. Anruf beitreten – und mit welchen Rechten?
 * Die Edge Function "voice" ruft das mit dem JWT der Person auf und schreibt
 * das Ergebnis als Grants ins LiveKit-Token.
 */
create function public.voice_join_check(p_target uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  c public.channels;
  d public.dm_channels;
  v public.permission[];
  v_mute boolean;
  v_deaf boolean;
  v_ticket boolean;
  v_current text;
begin
  if me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if private.is_platform_banned() then
    raise exception 'account suspended' using errcode = '42501';
  end if;
  perform private.hit_rate_limit('voice_join', 30, interval '1 minute');
  select vs.room into v_current from public.voice_states vs where vs.user_id = me;

  select * into c from public.channels ch where ch.id = p_target;
  if found then
    if c.type <> 'voice' then
      raise exception 'not a voice channel' using errcode = '22023';
    end if;
    v := private._scope_permissions(c.server_id, c.id, c.category_id, true, me);
    if not ('connect' = any (v)) then
      raise exception 'missing permission: connect' using errcode = '42501';
    end if;
    select f.mute, f.deaf into v_mute, v_deaf from private.voice_member_flags f where f.server_id = c.server_id and f.user_id = me;
    delete from private.voice_moves mv where mv.user_id = me and mv.channel_id = c.id and mv.created_at > now() - interval '2 minutes'
      returning true into v_ticket;
    return jsonb_build_object(
      'kind', 'channel',
      'room', 'channel:' || c.id,
      'server_id', c.server_id,
      'channel_id', c.id,
      'user_limit', nullif(c.user_limit, 0),
      -- "Mitglieder verschieben" darf (wie bei Discord) auch in volle Kanäle; ebenso, wer gerade verschoben wurde.
      'bypass_limit', 'moveMembers' = any (v) or coalesce(v_ticket, false),
      'can_speak', 'speak' = any (v) and not coalesce(v_mute, false),
      'can_video', 'video' = any (v),
      'can_screen', 'screenShare' = any (v),
      'server_mute', coalesce(v_mute, false),
      'server_deaf', coalesce(v_deaf, false),
      'current_room', v_current
    );
  end if;

  select * into d from public.dm_channels dm where dm.id = p_target;
  if not found or not private.is_dm_participant(p_target) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if not private.can_send_dm(p_target) then
    raise exception 'blocked' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'kind', 'dm',
    'room', 'dm:' || d.id,
    'dm_id', d.id,
    'user_limit', null,
    'bypass_limit', true,
    'can_speak', true,
    'can_video', true,
    'can_screen', true,
    'server_mute', false,
    'server_deaf', false,
    'current_room', v_current
  );
end;
$$;

/**
 * Anruf in einer DM/Gruppe starten oder dem laufenden beitreten. Ein neuer
 * Anruf legt die Systemnachricht an (sie löst Push beim Gegenüber aus) und
 * klingelt per Realtime bei allen Teilnehmern.
 */
create function public.call_start(p_dm uuid, p_video boolean default false) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  v_call public.calls;
  v_id uuid;
begin
  if me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if private.is_platform_banned() then
    raise exception 'account suspended' using errcode = '42501';
  end if;
  if not private.is_dm_participant(p_dm) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if not private.can_send_dm(p_dm) then
    raise exception 'blocked' using errcode = '42501';
  end if;
  -- Gleichzeitige Starts in derselben DM nacheinander.
  perform 1 from public.dm_channels d where d.id = p_dm for update;
  select * into v_call from public.calls c where c.dm_id = p_dm and c.ended_at is null;
  if found then
    -- Liegengeblieben (niemand verbunden, Webhook verloren)? Dann gilt er als beendet.
    if v_call.updated_at < now() - interval '90 seconds' and not exists (select 1 from public.voice_states vs where vs.dm_id = p_dm) then
      update public.calls set ended_at = v_call.updated_at where id = v_call.id;
    else
      return jsonb_build_object('id', v_call.id, 'started', false);
    end if;
  end if;
  perform private.hit_rate_limit('call', 10, interval '5 minutes');
  v_id := gen_random_uuid();
  insert into public.messages (id, dm_id, author_id, type, content) values (v_id, p_dm, me, 'call', '');
  insert into public.calls (id, dm_id, started_by, video) values (v_id, p_dm, me, coalesce(p_video, false));
  return jsonb_build_object('id', v_id, 'started', true);
end;
$$;

/** Anruf ablehnen (hört auf allen eigenen Geräten auf zu klingeln). */
create function public.call_decline(p_call uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  update public.calls c set declined = array_append(c.declined, me), updated_at = now()
  where c.id = p_call and c.ended_at is null and private.is_dm_participant(c.dm_id) and not (me = any (c.declined));
end;
$$;

/** Eigene Stumm-/Taub-Anzeige (nur Anzeige – gesendet wird ohnehin nichts, solange man stumm ist). */
create function public.voice_set_self(p_mute boolean, p_deaf boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  v_mute boolean := coalesce(p_mute, false) or coalesce(p_deaf, false);
  v_deaf boolean := coalesce(p_deaf, false);
begin
  if me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.voice_states vs where vs.user_id = me and (vs.self_mute, vs.self_deaf) is distinct from (v_mute, v_deaf)) then
    return;
  end if;
  perform private.hit_rate_limit('voice_self', 60, interval '1 minute');
  update public.voice_states set self_mute = v_mute, self_deaf = v_deaf where user_id = me;
end;
$$;

/**
 * Moderation im Sprachkanal: stumm/taub (Server), trennen, verschieben.
 * Prüft Recht im Kanal und Rangfolge (wie Kick: nur Mitglieder unter mir,
 * sich selbst darf man). Speichert Stumm/Taub dauerhaft und gibt der Edge
 * Function zurück, was sie bei LiveKit ändern muss.
 */
create function public.voice_moderate(p_target uuid, p_action text, p_dest uuid default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  vs public.voice_states;
  c public.channels;
  dest public.channels;
  v public.permission[];
  t public.permission[];
  v_need public.permission;
  v_mute boolean;
  v_deaf boolean;
begin
  if me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if private.is_platform_banned() then
    raise exception 'account suspended' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('mute', 'unmute', 'deafen', 'undeafen', 'disconnect', 'move') then
    raise exception 'unknown action' using errcode = '22023';
  end if;
  select * into vs from public.voice_states s where s.user_id = p_target;
  if not found or vs.channel_id is null then
    raise exception 'not in a voice channel' using errcode = 'P0002';
  end if;
  select * into c from public.channels ch where ch.id = vs.channel_id;
  v := private._scope_permissions(c.server_id, c.id, c.category_id, true, me);
  v_need := case
    when p_action in ('mute', 'unmute') then 'muteMembers'
    when p_action in ('deafen', 'undeafen') then 'deafenMembers'
    else 'moveMembers'
  end;
  if not (v_need = any (v)) then
    raise exception 'missing permission: %', v_need using errcode = '42501';
  end if;
  if p_target <> me and private.top_role_position(c.server_id, p_target) >= private.top_role_position(c.server_id, me) then
    raise exception 'target is not below you' using errcode = '42501';
  end if;
  perform private.hit_rate_limit('voice_moderate', 60, interval '1 minute');

  if p_action = 'move' then
    select * into dest from public.channels ch where ch.id = p_dest;
    if not found or dest.type <> 'voice' or dest.server_id <> c.server_id or dest.id = c.id then
      raise exception 'invalid destination' using errcode = '22023';
    end if;
    if not ('connect' = any (private._scope_permissions(dest.server_id, dest.id, dest.category_id, true, me))) then
      raise exception 'missing permission: connect' using errcode = '42501';
    end if;
    if not ('connect' = any (private._scope_permissions(dest.server_id, dest.id, dest.category_id, true, p_target))) then
      raise exception 'target cannot connect there' using errcode = '42501';
    end if;
    insert into private.voice_moves (user_id, channel_id) values (p_target, dest.id)
    on conflict (user_id) do update set channel_id = excluded.channel_id, created_at = now();
  end if;

  if p_action in ('mute', 'unmute', 'deafen', 'undeafen') then
    insert into private.voice_member_flags as f (server_id, user_id, mute, deaf)
    values (c.server_id, p_target, p_action = 'mute', p_action = 'deafen')
    on conflict (server_id, user_id) do update set
      mute = case when p_action in ('mute', 'unmute') then p_action = 'mute' else f.mute end,
      deaf = case when p_action in ('deafen', 'undeafen') then p_action = 'deafen' else f.deaf end,
      updated_at = now()
    returning f.mute, f.deaf into v_mute, v_deaf;
    update public.voice_states s set server_mute = v_mute, server_deaf = v_deaf where s.user_id = p_target;
  else
    select f.mute, f.deaf into v_mute, v_deaf from private.voice_member_flags f where f.server_id = c.server_id and f.user_id = p_target;
  end if;

  t := private._scope_permissions(c.server_id, c.id, c.category_id, true, p_target);
  return jsonb_build_object(
    'room', vs.room,
    'server_id', c.server_id,
    'channel_id', c.id,
    'dest_channel_id', p_dest,
    'server_mute', coalesce(v_mute, false),
    'server_deaf', coalesce(v_deaf, false),
    'can_speak', 'speak' = any (t) and not coalesce(v_mute, false),
    'can_video', 'video' = any (t),
    'can_screen', 'screenShare' = any (t)
  );
end;
$$;

/* ------------------------------------------------------------------ */
/* Nur für die Edge Functions (service_role)                            */
/* ------------------------------------------------------------------ */

create function private.require_service_role() returns void
language plpgsql stable set search_path = ''
as $$
begin
  -- Zusätzlich zu den Ausführungsrechten: auch ein späteres "grant … to authenticated" öffnet das nicht.
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role', '') <> 'service_role' then
    raise exception 'service role only' using errcode = '42501';
  end if;
end;
$$;

/**
 * Ein Ereignis von LiveKit (Webhook, Signatur bereits geprüft) eintragen.
 * p: { event, room, identity, sid, at (Unix-Sekunden), source }
 * Ereignisse können doppelt oder verspätet kommen: "verlassen" gilt nur für
 * dieselbe Verbindung (sid), "beitreten" nur, wenn es neuer ist.
 */
create function public.voice_event(p jsonb) returns text
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
    if v_kind = 'channel' then
      select * into c from public.channels ch where ch.id = v_id and ch.type = 'voice';
      if not found or not exists (select 1 from public.server_members m where m.server_id = c.server_id and m.user_id = v_identity) then
        return 'ignored: no access';
      end if;
      select f.mute, f.deaf into v_mute, v_deaf from private.voice_member_flags f where f.server_id = c.server_id and f.user_id = v_identity;
      insert into public.voice_states as s (user_id, room, server_id, channel_id, sid, joined_at, event_at, server_mute, server_deaf)
      values (v_identity, v_room, c.server_id, c.id, v_sid, v_at, v_at, coalesce(v_mute, false), coalesce(v_deaf, false))
      on conflict (user_id) do update set
        room = excluded.room, server_id = excluded.server_id, channel_id = excluded.channel_id, dm_id = null, sid = excluded.sid,
        joined_at = excluded.joined_at, event_at = excluded.event_at, server_mute = excluded.server_mute, server_deaf = excluded.server_deaf,
        camera = false, screen = false
      where s.event_at <= excluded.event_at;
    else
      if not exists (select 1 from public.dm_participants dp where dp.dm_id = v_id and dp.user_id = v_identity) then
        return 'ignored: no access';
      end if;
      insert into public.voice_states as s (user_id, room, dm_id, sid, joined_at, event_at)
      values (v_identity, v_room, v_id, v_sid, v_at, v_at)
      on conflict (user_id) do update set
        room = excluded.room, server_id = null, channel_id = null, dm_id = excluded.dm_id, sid = excluded.sid,
        joined_at = excluded.joined_at, event_at = excluded.event_at, server_mute = false, server_deaf = false,
        camera = false, screen = false
      where s.event_at <= excluded.event_at;
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

/**
 * Abgleich mit der Teilnehmerliste von LiveKit (vor jedem Beitritt): Einträge
 * ohne Verbindung, deren letztes Ereignis älter als 30 s ist, fallen weg.
 */
create function public.voice_reconcile(p_room text, p_identities uuid[]) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  n integer;
begin
  perform private.require_service_role();
  delete from public.voice_states vs
  where vs.room = p_room and not (vs.user_id = any (coalesce(p_identities, '{}'))) and vs.event_at < now() - interval '30 seconds';
  get diagnostics n = row_count;
  return n;
end;
$$;

/** voice-webhook: eigene URL eintragen, Geheimnis lesen. */
create function public.voice_config(p_url text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_secret text;
begin
  perform private.require_service_role();
  update private.voice_config set url = p_url where p_url is not null and url is distinct from p_url;
  select c.secret into v_secret from private.voice_config c;
  return v_secret;
end;
$$;

/* ------------------------------------------------------------------ */
/* Push: eingehender Anruf                                              */
/* ------------------------------------------------------------------ */

-- Wie 20261019232342_onyx_web_push, zusätzlich Anrufe in DMs (Systemnachricht "call").
create or replace function private.messages_push_dispatch() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  -- Systemnachrichten (Beitritt, Anheften) lösen nie einen Hinweis aus – außer ein Anruf in einer DM.
  if new.author_id is null or not (new.type = 'default' or (new.type = 'call' and new.dm_id is not null)) then
    return null;
  end if;
  select c.dispatch_url, c.dispatch_secret into v_url, v_secret from private.push_config c;
  if v_url is null then
    return null;
  end if;
  -- Nur aufrufen, wenn überhaupt ein Empfänger Push eingeschaltet hat.
  if new.dm_id is not null then
    if not exists (select 1 from public.dm_participants dp join public.push_subscriptions ps on ps.user_id = dp.user_id
                   where dp.dm_id = new.dm_id and dp.user_id <> new.author_id) then
      return null;
    end if;
  elsif not exists (select 1 from public.channels c join public.server_members sm on sm.server_id = c.server_id
                    join public.push_subscriptions ps on ps.user_id = sm.user_id
                    where c.id = new.channel_id and sm.user_id <> new.author_id) then
    return null;
  end if;
  begin
    perform net.http_post(
      url := v_url,
      body := jsonb_build_object('message_id', new.id),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-onyx-dispatch', v_secret),
      timeout_milliseconds := 8000
    );
  exception when others then
    -- Ein Problem beim Versand darf das Senden der Nachricht nie verhindern.
    raise warning 'onyx push dispatch failed: %', sqlerrm;
  end;
  return null;
end;
$$;

/* ------------------------------------------------------------------ */
/* Ausführungsrechte                                                    */
/* ------------------------------------------------------------------ */

revoke all on function private.voice_state_json(public.voice_states) from public, anon, authenticated;
revoke all on function private.voice_states_broadcast() from public, anon, authenticated;
revoke all on function private.calls_broadcast() from public, anon, authenticated;
revoke all on function private.can_join_voice_topic(text) from public, anon;
grant execute on function private.can_join_voice_topic(text) to authenticated;
revoke all on function private.voice_signal(jsonb) from public, anon, authenticated;
revoke all on function private.voice_member_removed() from public, anon, authenticated;
revoke all on function private.voice_dm_participant_removed() from public, anon, authenticated;
revoke all on function private.voice_room_deleted() from public, anon, authenticated;
revoke all on function private.voice_platform_banned() from public, anon, authenticated;
revoke all on function private.require_service_role() from public, anon, authenticated;
revoke all on function private.messages_push_dispatch() from public, anon, authenticated;

revoke all on function public.voice_join_check(uuid) from public, anon;
revoke all on function public.call_start(uuid, boolean) from public, anon;
revoke all on function public.call_decline(uuid) from public, anon;
revoke all on function public.voice_set_self(boolean, boolean) from public, anon;
revoke all on function public.voice_moderate(uuid, text, uuid) from public, anon;
grant execute on function public.voice_join_check(uuid) to authenticated;
grant execute on function public.call_start(uuid, boolean) to authenticated;
grant execute on function public.call_decline(uuid) to authenticated;
grant execute on function public.voice_set_self(boolean, boolean) to authenticated;
grant execute on function public.voice_moderate(uuid, text, uuid) to authenticated;

revoke all on function public.voice_event(jsonb) from public, anon, authenticated;
revoke all on function public.voice_reconcile(text, uuid[]) from public, anon, authenticated;
revoke all on function public.voice_config(text) from public, anon, authenticated;
grant execute on function public.voice_event(jsonb) to service_role;
grant execute on function public.voice_reconcile(text, uuid[]) to service_role;
grant execute on function public.voice_config(text) to service_role;
grant execute on function private.require_service_role() to service_role;
