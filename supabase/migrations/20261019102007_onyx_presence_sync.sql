-- ONYX Phase 4 – Präsenz, "tippt …", Gelesen-Status und Notizen
--
-- Präsenz und Tippen laufen über private Realtime-Kanäle. Wer einem Kanal
-- beitreten oder darin senden darf, entscheiden die Regeln auf
-- realtime.messages (Realtime Authorization):
--   onyx:presence          – alle angemeldeten Nutzer
--   typing:channel:<id>    – wer den Kanal sieht (senden: wer schreiben darf)
--   typing:dm:<id>         – Teilnehmer der DM/Gruppe
-- Gelesen-Status und Notizen werden pro Konto gespeichert (geräteübergreifend).

/* ------------------------------------------------------------------ */
/* Gelesen-Status                                                       */
/* ------------------------------------------------------------------ */

create table public.read_states (
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Kanal- oder DM-ID
  scope_id uuid not null,
  last_read_at timestamptz not null,
  primary key (user_id, scope_id)
);

alter table public.read_states enable row level security;
revoke all on table public.read_states from anon, authenticated;
grant select, insert, update, delete on public.read_states to authenticated;

create policy "read_states: nur eigene" on public.read_states for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

/* ------------------------------------------------------------------ */
/* Notizen zu Personen (nur für einen selbst sichtbar)                  */
/* ------------------------------------------------------------------ */

create table public.user_notes (
  owner_id uuid not null references public.profiles (id) on delete cascade,
  target_id uuid not null references public.profiles (id) on delete cascade,
  note text not null,
  updated_at timestamptz not null default now(),
  primary key (owner_id, target_id),
  constraint user_notes_length check (char_length(note) between 1 and 256)
);

create index user_notes_target_idx on public.user_notes (target_id);

alter table public.user_notes enable row level security;
revoke all on table public.user_notes from anon, authenticated;
grant select, insert, update, delete on public.user_notes to authenticated;

create policy "user_notes: nur eigene" on public.user_notes for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

/* ------------------------------------------------------------------ */
/* Realtime Authorization                                               */
/* ------------------------------------------------------------------ */

/** ID aus "typing:channel:<uuid>" bzw. "typing:dm:<uuid>" (null bei anderem Format). */
create function private.topic_id(p_topic text, p_prefix text) returns uuid
language sql immutable set search_path = ''
as $$
  select case when p_topic ~ ('^' || p_prefix || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    then substr(p_topic, char_length(p_prefix) + 1)::uuid end
$$;

/** Beitreten / mithören. */
create function private.can_join_topic(p_topic text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select case
    when auth.uid() is null then false
    when p_topic = 'onyx:presence' then true
    when p_topic like 'typing:channel:%' then coalesce(private.has_channel_permission(private.topic_id(p_topic, 'typing:channel:'), 'viewChannel'), false)
    when p_topic like 'typing:dm:%' then coalesce(private.is_dm_participant(private.topic_id(p_topic, 'typing:dm:')), false)
    else false
  end
$$;

/** Senden (Präsenz melden, "tippt …" schicken). */
create function private.can_send_topic(p_topic text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select case
    when auth.uid() is null then false
    when p_topic = 'onyx:presence' then true
    when p_topic like 'typing:channel:%' then coalesce(private.has_channel_permission(private.topic_id(p_topic, 'typing:channel:'), 'sendMessages'), false)
    when p_topic like 'typing:dm:%' then coalesce(private.can_send_dm(private.topic_id(p_topic, 'typing:dm:')), false)
    else false
  end
$$;

do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute $p$create policy "onyx: Realtime-Kanäle beitreten" on realtime.messages for select to authenticated
      using (private.can_join_topic((select realtime.topic())))$p$;
    execute $p$create policy "onyx: in Realtime-Kanälen senden" on realtime.messages for insert to authenticated
      with check (private.can_send_topic((select realtime.topic())))$p$;
  end if;
end;
$$;

/* ------------------------------------------------------------------ */
/* Ausführungsrechte                                                    */
/* ------------------------------------------------------------------ */

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;
revoke execute on function private._scope_permissions(uuid, uuid, uuid, boolean, uuid) from authenticated;
revoke execute on function private.is_blocked_between(uuid, uuid) from authenticated;
revoke execute on function private.handle_new_user() from authenticated;
revoke execute on function private.hit_rate_limit(text, integer, interval) from authenticated;
