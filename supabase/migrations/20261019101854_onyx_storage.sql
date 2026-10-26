-- ONYX Phase 2 – Dateispeicher (Supabase Storage)
--
-- Bucket "media" (öffentlich lesbar): Avatare, Banner, Server-Icons, Emojis,
--   Server-Abzeichen. Pfade: users/<user-id>/…, servers/<server-id>/…, dms/<dm-id>/…
-- Bucket "attachments" (privat): Dateien und Sprachnachrichten.
--   Pfade: channels/<kanal-id>/<nachricht-id>/… bzw. dms/<dm-id>/<nachricht-id>/…
--   Lesen nur, wer den Kanal sieht bzw. an der DM teilnimmt (signierte Links).
--
-- In Tabellen stehen nur noch Pfade der Form "storage:media/<pfad>" statt
-- Data-URLs; bestehende Data-URLs bleiben gültig.

/* ------------------------------------------------------------------ */
/* Buckets                                                              */
/* ------------------------------------------------------------------ */

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('media', 'media', true, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']),
  ('attachments', 'attachments', false, 52428800, null)
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

/** Erster Ordner und ID (zweiter Ordner) eines Storage-Pfads; null, wenn die ID keine UUID ist. */
create function private.storage_scope(p_name text) returns text
language sql immutable set search_path = ''
as $$ select (string_to_array(p_name, '/'))[1] $$;

create function private.storage_scope_id(p_name text) returns uuid
language sql immutable set search_path = ''
as $$
  select case when (string_to_array(p_name, '/'))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then (string_to_array(p_name, '/'))[2]::uuid end
$$;

/** Darf die angemeldete Person in diesen media-Ordner schreiben? */
create function private.can_write_media(p_name text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select case private.storage_scope(p_name)
    when 'users' then private.storage_scope_id(p_name) = auth.uid()
    when 'servers' then private.has_server_permission(private.storage_scope_id(p_name), 'manageServer')
      or private.has_server_permission(private.storage_scope_id(p_name), 'manageBadges')
    when 'dms' then private.is_dm_participant(private.storage_scope_id(p_name))
    else false
  end
$$;

/** Darf die angemeldete Person diesen Anhang sehen? */
create function private.can_read_attachment(p_name text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select case private.storage_scope(p_name)
    when 'channels' then private.has_channel_permission(private.storage_scope_id(p_name), 'viewChannel')
      and private.has_channel_permission(private.storage_scope_id(p_name), 'readHistory')
    when 'dms' then private.is_dm_participant(private.storage_scope_id(p_name))
    else false
  end
$$;

/** Darf die angemeldete Person hier etwas hochladen (Datei oder Sprachnachricht)? */
create function private.can_upload_attachment(p_name text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select case private.storage_scope(p_name)
    when 'channels' then private.has_channel_permission(private.storage_scope_id(p_name), 'attachFiles')
      or private.has_channel_permission(private.storage_scope_id(p_name), 'sendVoiceMessages')
    when 'dms' then private.can_send_dm(private.storage_scope_id(p_name))
    else false
  end
$$;

/** Moderation: Anhänge fremder Nachrichten löschen (mit "Nachrichten verwalten"). */
create function private.can_moderate_attachment(p_name text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.storage_scope(p_name) = 'channels'
    and private.has_channel_permission(private.storage_scope_id(p_name), 'manageMessages')
$$;


/* ------------------------------------------------------------------ */
/* Storage-Regeln                                                       */
/* ------------------------------------------------------------------ */

create policy "media: hochladen in eigene Ordner" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and private.can_write_media(name));
create policy "media: ersetzen in eigenen Ordnern" on storage.objects for update to authenticated
  using (bucket_id = 'media' and private.can_write_media(name)) with check (bucket_id = 'media' and private.can_write_media(name));
create policy "media: löschen in eigenen Ordnern" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and private.can_write_media(name));

create policy "attachments: lesen mit Kanalzugriff" on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and private.can_read_attachment(name));
create policy "attachments: hochladen mit Berechtigung" on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and private.can_upload_attachment(name));
create policy "attachments: eigene oder moderiert löschen" on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and (owner_id = (select auth.uid())::text or private.can_moderate_attachment(name)));

/* ------------------------------------------------------------------ */
/* Bildspalten: Storage-Pfade erlauben                                  */
/* ------------------------------------------------------------------ */

-- Gleiche Funktions-ID (CHECKs verweisen darauf), neuer Rumpf.
create or replace function private.is_inline_image(p text) returns boolean
language sql immutable set search_path = ''
as $$
  select p is null
    or p like 'data:image/%'
    or p ~ '^storage:media/(users|servers|dms)/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,120}$'
$$;

alter table public.server_badges drop constraint server_badges_image_inline;
alter table public.server_badges add constraint server_badges_image_inline check (private.is_inline_image(image) and image is not null);

/* ------------------------------------------------------------------ */
/* Server-Emojis                                                        */
/* ------------------------------------------------------------------ */

create table public.server_emojis (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers (id) on delete cascade,
  name text not null,
  image text not null,
  animated boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint server_emojis_name_format check (name ~ '^[a-z0-9_]{2,32}$'),
  constraint server_emojis_image check (private.is_inline_image(image)),
  constraint server_emojis_image_size check (octet_length(image) <= 150000)
);

create index server_emojis_server_idx on public.server_emojis (server_id);
create index server_emojis_created_by_idx on public.server_emojis (created_by);

create function private.server_emojis_limit() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select count(*) from public.server_emojis e where e.server_id = new.server_id) >= 200 then
    raise exception 'server emoji limit reached' using errcode = '23514';
  end if;
  new.created_by := auth.uid();
  return new;
end;
$$;

create trigger server_emojis_limit before insert on public.server_emojis for each row execute function private.server_emojis_limit();

alter table public.server_emojis enable row level security;
revoke all on table public.server_emojis from anon, authenticated;
grant select, delete on public.server_emojis to authenticated;
grant insert (id, server_id, name, image, animated) on public.server_emojis to authenticated;
grant update (name) on public.server_emojis to authenticated;

create policy "server_emojis: Mitglieder sehen" on public.server_emojis for select to authenticated using (private.is_server_member(server_id));
create policy "server_emojis: hochladen mit Server verwalten" on public.server_emojis for insert to authenticated
  with check (private.has_server_permission(server_id, 'manageServer'));
create policy "server_emojis: umbenennen mit Server verwalten" on public.server_emojis for update to authenticated
  using (private.has_server_permission(server_id, 'manageServer')) with check (private.has_server_permission(server_id, 'manageServer'));
create policy "server_emojis: löschen mit Server verwalten" on public.server_emojis for delete to authenticated
  using (private.has_server_permission(server_id, 'manageServer'));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.server_emojis;
  end if;
end;
$$;

/* ------------------------------------------------------------------ */
/* Anhänge in Nachrichten                                               */
/* ------------------------------------------------------------------ */

alter table public.messages drop constraint messages_no_attachments_yet;

/**
 * Jeder Anhang verweist auf eine Datei unter genau dieser Nachricht
 * (channels/<kanal>/<nachricht>/… bzw. dms/<dm>/<nachricht>/…) – fremde Dateien
 * lassen sich nicht einbinden. Keine Data-URLs oder lokalen Schlüssel.
 */
create function private.messages_check_attachments() returns trigger
language plpgsql set search_path = ''
as $$
declare
  a jsonb;
  v_prefix text := case when new.channel_id is not null then 'channels/' || new.channel_id || '/' || new.id || '/'
                        else 'dms/' || new.dm_id || '/' || new.id || '/' end;
begin
  if jsonb_array_length(new.attachments) > 10 then
    raise exception 'at most 10 attachments' using errcode = '23514';
  end if;
  for a in select * from jsonb_array_elements(new.attachments) loop
    if jsonb_typeof(a) <> 'object'
       or coalesce(a->>'path', '') not like v_prefix || '%'
       or a ? 'url' or a ? 'localKey'
       or coalesce(a->>'kind', '') not in ('image', 'video', 'audio', 'file')
       or coalesce((a->>'size')::bigint, 0) > 52428800 then
      raise exception 'invalid attachment' using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;

create trigger messages_check_attachments before insert or update of attachments on public.messages
  for each row execute function private.messages_check_attachments();

/** Dateien brauchen "Dateien anhängen", Sprachnachrichten "Sprachnachrichten senden". */
create function private.attachments_allowed(p_channel uuid, p_attachments jsonb) returns boolean
language sql stable security definer set search_path = ''
as $$
  select (not exists (select 1 from jsonb_array_elements(p_attachments) a where coalesce((a->>'voice')::boolean, false))
          or private.has_channel_permission(p_channel, 'sendVoiceMessages'))
     and (not exists (select 1 from jsonb_array_elements(p_attachments) a where not coalesce((a->>'voice')::boolean, false))
          or private.has_channel_permission(p_channel, 'attachFiles'))
$$;


alter policy "messages: schreiben" on public.messages
  with check (
    author_id = (select auth.uid())
    and (
      (channel_id is not null and (
        (type = 'default' and private.has_channel_permission(channel_id, 'sendMessages')
          and (jsonb_array_length(attachments) = 0 or private.attachments_allowed(channel_id, attachments)))
        or (type = 'pin' and private.has_channel_permission(channel_id, 'manageMessages') and jsonb_array_length(attachments) = 0)
      ))
      or (dm_id is not null and type in ('default', 'pin') and private.can_send_dm(dm_id))
    )
  );

/* ------------------------------------------------------------------ */
/* Ausführungsrechte (wie in der Härtungs-Migration)                    */
/* ------------------------------------------------------------------ */

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;
revoke execute on function private._scope_permissions(uuid, uuid, uuid, boolean, uuid) from authenticated;
revoke execute on function private.is_blocked_between(uuid, uuid) from authenticated;
revoke execute on function private.handle_new_user() from authenticated;
