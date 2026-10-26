-- ONYX – Benachrichtigungs-Einstellungen pro Server, Kanal und DM
--
-- Eine Zeile pro Nutzer und Bereich (scope_id = Server-, Kanal- oder DM-ID).
-- Die Zeile mit scope_id = eigene Nutzer-ID hält den Konto-Standard
-- („Alle Nachrichten“ / „Nur @Erwähnungen“ / „Nichts“ für Server ohne eigene Einstellung).
-- Jeder sieht und ändert nur die eigenen Zeilen; Realtime hält alle Geräte gleich.
-- Gerätebezogenes (Popups, Töne, Lautstärke) bleibt im Browser.

create table public.notification_settings (
  user_id uuid not null references public.profiles (id) on delete cascade,
  scope_id uuid not null,
  level text,
  muted boolean not null default false,
  -- Ende einer befristeten Stummschaltung; null = bis man sie selbst aufhebt
  mute_until timestamptz,
  suppress_everyone boolean not null default false,
  suppress_roles boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, scope_id),
  constraint notification_settings_level check (level is null or level in ('all', 'mentions', 'nothing')),
  constraint notification_settings_mute check (mute_until is null or muted)
);

create index notification_settings_scope_idx on public.notification_settings (scope_id);

alter table public.notification_settings enable row level security;
revoke all on table public.notification_settings from anon, authenticated;
grant select, insert, update, delete on public.notification_settings to authenticated;

create policy "notification_settings: nur eigene" on public.notification_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

/* ------------------------------------------------------------------ */
/* Grenzen und Aufräumen                                                */
/* ------------------------------------------------------------------ */

-- Schutz vor Datenmüll: höchstens 2000 Einstellungen pro Konto.
create function private.notification_settings_limit() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select count(*) from public.notification_settings n where n.user_id = new.user_id) >= 2000 then
    raise exception 'notification settings limit reached' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger notification_settings_limit before insert on public.notification_settings
  for each row execute function private.notification_settings_limit();

-- Wird ein Server, Kanal oder eine DM gelöscht, verschwinden auch die Einstellungen dazu.
create function private.notification_settings_cleanup() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.notification_settings n where n.scope_id = old.id;
  return old;
end;
$$;

create trigger notification_settings_cleanup after delete on public.servers
  for each row execute function private.notification_settings_cleanup();
create trigger notification_settings_cleanup after delete on public.channels
  for each row execute function private.notification_settings_cleanup();
create trigger notification_settings_cleanup after delete on public.dm_channels
  for each row execute function private.notification_settings_cleanup();

revoke all on function private.notification_settings_limit() from public, anon, authenticated;
revoke all on function private.notification_settings_cleanup() from public, anon, authenticated;

/* ------------------------------------------------------------------ */
/* Realtime: Änderungen von anderen Geräten                             */
/* ------------------------------------------------------------------ */

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notification_settings;
  end if;
end;
$$;
