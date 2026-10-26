-- ONYX – Konto löschen (DSGVO Art. 17) und Server übertragen
--
-- Ablauf (Edge Function "delete-account", nur mit gültigem Nutzer-JWT):
--   1. account_deletion_prepare(user) – nur mit der Service-Role aufrufbar. Nennt
--      die Server, die das Konto noch besitzt (dann bricht die Function ab), und
--      die Storage-Dateien, die mitgelöscht werden.
--   2. Die Function löscht diese Dateien über die Storage-API.
--   3. Sie löscht den Auth-Nutzer (Admin-API). Über die Fremdschlüssel
--      verschwinden Profil, Mitgliedschaften (samt Rollen, Server-Abzeichen und
--      Mitglieds-Überschreibungen), Freundschaften und Anfragen, Blockierungen,
--      DM-Teilnahmen, Reaktionen, Notizen (eigene und über ihn), Gelesen-Status,
--      verdiente Abzeichen, eingelöste Codes und Zähler. Nachrichten bleiben ohne
--      Autor stehen ("Gelöschter Nutzer"), Einladungen und Emojis ebenso.
--      Mitgliedsnummern kommen aus einer Sequenz und werden nie neu vergeben.
--
-- Besitzt das Konto Server, wird die Löschung verweigert (sonst würden die
-- Server samt aller Nachrichten der anderen per cascade mitgelöscht). Dafür gibt
-- es jetzt transfer_server_ownership().

/* ------------------------------------------------------------------ */
/* Server an ein Mitglied übertragen                                    */
/* ------------------------------------------------------------------ */

/** Nur der Inhaber; das neue Mitglied muss schon auf dem Server sein. Der alte Inhaber bleibt Mitglied. */
create function public.transfer_server_ownership(p_server uuid, p_user uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  perform 1 from public.servers s where s.id = p_server and s.owner_id = me for update;
  if not found then
    raise exception 'only the owner can transfer a server' using errcode = '42501';
  end if;
  if p_user is null or p_user = me then
    raise exception 'invalid user' using errcode = '22023';
  end if;
  if not exists (select 1 from public.server_members m where m.server_id = p_server and m.user_id = p_user) then
    raise exception 'the new owner must be a member' using errcode = '42501';
  end if;
  -- Gleiches Limit wie create_server().
  if (select count(*) from public.servers s where s.owner_id = p_user) >= 100 then
    raise exception 'server limit reached' using errcode = '23514';
  end if;
  update public.servers set owner_id = p_user where id = p_server;
end;
$$;

/* ------------------------------------------------------------------ */
/* Vorbereitung der Löschung (nur Edge Function / Service-Role)         */
/* ------------------------------------------------------------------ */

/**
 * {owned_servers: [{id, name}], media: [pfad], attachments: [pfad]}
 *
 * media: alles unter users/<id>/ (Avatar, Banner). attachments: alle Dateien,
 * die das Konto hochgeladen hat. Dazu jeweils die Ordner der Gespräche, in denen
 * sonst niemand mehr ist – die verschwinden mit dem Konto ganz.
 * Server-Icons, Emojis oder Gruppenbilder, die er für andere hochgeladen hat,
 * gehören dem Server bzw. der Gruppe und bleiben.
 */
create function public.account_deletion_prepare(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_dms uuid[];
begin
  -- Zusätzlich zu den Ausführungsrechten: auch ein späteres "grant … to authenticated" öffnet das nicht.
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role', '') <> 'service_role' then
    raise exception 'service role only' using errcode = '42501';
  end if;
  if p_user is null then
    raise exception 'invalid user' using errcode = '22023';
  end if;
  v_dms := array(
    select p.dm_id from public.dm_participants p
    where p.user_id = p_user
      and not exists (select 1 from public.dm_participants o where o.dm_id = p.dm_id and o.user_id <> p_user)
  );
  return jsonb_build_object(
    'owned_servers', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.created_at)
      from public.servers s where s.owner_id = p_user
    ), '[]'),
    'media', coalesce((
      select jsonb_agg(o.name order by o.name) from storage.objects o
      where o.bucket_id = 'media'
        and (o.name like 'users/' || p_user || '/%'
          or (private.storage_scope(o.name) = 'dms' and private.storage_scope_id(o.name) = any (v_dms)))
    ), '[]'),
    'attachments', coalesce((
      select jsonb_agg(o.name order by o.name) from storage.objects o
      where o.bucket_id = 'attachments'
        and (o.owner_id = p_user::text
          or (private.storage_scope(o.name) = 'dms' and private.storage_scope_id(o.name) = any (v_dms)))
    ), '[]')
  );
end;
$$;

/* ------------------------------------------------------------------ */
/* Beim Löschen des Profils                                             */
/* ------------------------------------------------------------------ */

-- Läuft vor den Fremdschlüssel-Aktionen, egal wer löscht (Function oder Dashboard).
create function private.profiles_before_delete() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.servers s where s.owner_id = old.id) then
    raise exception 'account still owns servers' using errcode = '23503', hint = 'Transfer or delete the servers first.';
  end if;
  -- Die Dateien hat die Function schon gelöscht: Verweise entfernen, Nachrichten nur aus Dateien ganz löschen.
  delete from public.messages m
  where m.author_id = old.id and m.type = 'default' and btrim(m.content) = '' and jsonb_array_length(m.attachments) > 0;
  update public.messages m set attachments = '[]'
  where m.author_id = old.id and jsonb_array_length(m.attachments) > 0;
  -- Gruppen gehen an die Person, die am längsten dabei ist.
  update public.dm_channels d
  set owner_id = (
    select p.user_id from public.dm_participants p
    where p.dm_id = d.id and p.user_id <> old.id
    order by p.joined_at, p.user_id limit 1
  )
  where d.owner_id = old.id and d.type = 'group';
  -- Gespräche, in denen sonst niemand mehr ist, verschwinden ganz.
  delete from public.dm_channels d
  where exists (select 1 from public.dm_participants p where p.dm_id = d.id and p.user_id = old.id)
    and not exists (select 1 from public.dm_participants o where o.dm_id = d.id and o.user_id <> old.id);
  -- Rate-Limit-Protokoll hat keinen Fremdschlüssel.
  delete from private.rate_events e where e.user_id = old.id;
  return old;
end;
$$;

create trigger profiles_before_delete before delete on public.profiles
  for each row execute function private.profiles_before_delete();

/* ------------------------------------------------------------------ */
/* 1:1-DM mit einem gelöschten Konto: nur noch lesen                    */
/* ------------------------------------------------------------------ */

-- Gleiche Funktions-ID (RLS-Regeln verweisen darauf), zusätzliche Bedingung.
create or replace function private.can_send_dm(p_dm uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_dm_participant(p_dm)
    and not exists (
      select 1 from public.dm_channels d join public.dm_participants o on o.dm_id = d.id and o.user_id <> auth.uid()
      where d.id = p_dm and d.type = 'dm' and private.is_blocked_between(auth.uid(), o.user_id)
    )
    and not exists (
      select 1 from public.dm_channels d
      where d.id = p_dm and d.type = 'dm'
        and not exists (select 1 from public.dm_participants o where o.dm_id = d.id and o.user_id <> auth.uid())
    )
$$;

/* ------------------------------------------------------------------ */
/* Ausführungsrechte                                                    */
/* ------------------------------------------------------------------ */

revoke all on function public.transfer_server_ownership(uuid, uuid) from public, anon;
grant execute on function public.transfer_server_ownership(uuid, uuid) to authenticated;

revoke all on function public.account_deletion_prepare(uuid) from public, anon, authenticated;
grant execute on function public.account_deletion_prepare(uuid) to service_role;

revoke all on function private.profiles_before_delete() from public, anon, authenticated;
