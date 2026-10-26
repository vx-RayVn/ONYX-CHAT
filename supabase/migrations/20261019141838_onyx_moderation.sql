-- ONYX – Moderation: Server-Banns, ONYX-weite Sperren, Meldungen
--
-- 1. Server-Banns (Recht "Mitglieder bannen"): server_bans mit derselben
--    Rangfolge wie beim Kicken. Ein Bann entfernt die Mitgliedschaft,
--    join_server_by_invite() verweigert Gebannte.
-- 2. ONYX-weite Sperren durch Plattform-Admins (private.platform_admins):
--    platform_bans ist nur für Admins lesbar und wird nur von der Edge Function
--    "platform-ban" über platform_moderate() geschrieben (nur service_role).
--    Die Function sperrt außerdem die Anmeldung (Auth-Admin-API, ban_duration).
--    Hier: alle Sitzungen beenden, offene Tabs per Realtime-Signal auf
--    "account:<user-id>" abmelden, und – solange das Access-Token noch gilt –
--    jeden Schreibzugriff verweigern: ein Statement-Trigger pro Tabelle (eine
--    Prüfung pro Anweisung, deckt auch alle RPC-Funktionen ab) und restriktive
--    Regeln für Storage und Realtime.
-- 3. Meldungen (reports) mit einer Kopie des gemeldeten Inhalts; anlegen nur
--    über report_message()/report_user() mit Rate-Limit, lesen und bearbeiten
--    nur Plattform-Admins.

/* ------------------------------------------------------------------ */
/* Plattform-Admins                                                     */
/* ------------------------------------------------------------------ */

-- Verwaltung nur im SQL-Editor (siehe README). Nicht über die API erreichbar.
create table private.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  note text,
  added_at timestamptz not null default now()
);

revoke all on table private.platform_admins from public, anon, authenticated;

insert into private.platform_admins (user_id, note)
select u.id, 'Gründer (rayvn)' from auth.users u where u.id = '2a97c679-6b57-4604-9fe1-fea9e7b3f129'
on conflict do nothing;

create function private.is_platform_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from private.platform_admins a where a.user_id = auth.uid()) $$;

/* ------------------------------------------------------------------ */
/* ONYX-weite Sperren                                                   */
/* ------------------------------------------------------------------ */

-- Verlauf bleibt erhalten: Entsperren setzt lifted_at, aktiv ist die Zeile ohne lifted_at.
create table public.platform_bans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  reason text,
  banned_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  lifted_at timestamptz,
  lifted_by uuid references public.profiles (id) on delete set null,
  constraint platform_bans_reason_length check (reason is null or char_length(reason) <= 1000)
);

create unique index platform_bans_active_key on public.platform_bans (user_id) where lifted_at is null;
create index platform_bans_user_idx on public.platform_bans (user_id);
create index platform_bans_banned_by_idx on public.platform_bans (banned_by);
create index platform_bans_lifted_by_idx on public.platform_bans (lifted_by);

/** Ist die angemeldete Person ONYX-weit gesperrt? (Ein Index-Zugriff.) */
create function private.is_platform_banned() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.platform_bans b where b.user_id = auth.uid() and b.lifted_at is null) $$;

alter table public.platform_bans enable row level security;
revoke all on table public.platform_bans from anon, authenticated;
grant select on public.platform_bans to authenticated;
create policy "platform_bans: nur Plattform-Admins" on public.platform_bans for select to authenticated
  using ((select private.is_platform_admin()));

/* Gesperrte schreiben nichts mehr – auch nicht mit einem noch gültigen Token. */

create function private.block_suspended_writes() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if private.is_platform_banned() then
    raise exception 'account suspended' using errcode = '42501';
  end if;
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'user_badges', 'servers', 'roles', 'server_members', 'member_roles', 'categories', 'channels',
    'permission_overwrites', 'invites', 'server_badges', 'member_badges', 'server_emojis', 'dm_channels',
    'dm_participants', 'messages', 'reactions', 'friendships', 'blocks', 'read_states', 'user_notes', 'code_redemptions'
  ] loop
    execute format(
      'create trigger block_suspended_writes before insert or update or delete on public.%I for each statement execute function private.block_suspended_writes()',
      t
    );
  end loop;
end;
$$;

create policy "storage: gesperrte Konten laden nichts hoch" on storage.objects as restrictive for insert to authenticated
  with check (not (select private.is_platform_banned()));
create policy "storage: gesperrte Konten ändern nichts" on storage.objects as restrictive for update to authenticated
  using (not (select private.is_platform_banned()));
create policy "storage: gesperrte Konten löschen nichts" on storage.objects as restrictive for delete to authenticated
  using (not (select private.is_platform_banned()));

-- Realtime: Gesperrte senden nichts (Präsenz, "tippt …"); jedes Konto hört auf
-- seinem eigenen Kanal "account:<user-id>" (Sperr-Signal, siehe platform_moderate).
do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute $p$create policy "onyx: gesperrte Konten senden nichts" on realtime.messages as restrictive for insert to authenticated
      with check (not (select private.is_platform_banned()))$p$;
    execute $p$create policy "onyx: eigener Konto-Kanal" on realtime.messages for select to authenticated
      using ((select realtime.topic()) = 'account:' || (select auth.uid())::text)$p$;
  end if;
end;
$$;

/** Status des eigenen Kontos nach der Anmeldung: Admin? Gesperrt (mit Grund für den Sperr-Bildschirm)? */
create function public.account_status() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'admin', private.is_platform_admin(),
    'suspension', (
      select jsonb_build_object('reason', b.reason, 'at', b.created_at)
      from public.platform_bans b where b.user_id = auth.uid() and b.lifted_at is null
    )
  )
$$;

/**
 * Sperren und Entsperren – nur für die Edge Function "platform-ban"
 * (service_role), die p_admin aus dem geprüften JWT übernimmt.
 * p_action: 'check' (nur prüfen) | 'ban' | 'unban'.
 */
create function public.platform_moderate(p_admin uuid, p_target uuid, p_action text, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_ban public.platform_bans;
begin
  if p_admin is null or not exists (select 1 from private.platform_admins a where a.user_id = p_admin) then
    raise exception 'not a platform admin' using errcode = '42501';
  end if;
  if p_target is null or not exists (select 1 from public.profiles p where p.id = p_target) then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  if p_target = p_admin then
    raise exception 'admins cannot suspend themselves' using errcode = '22023';
  end if;
  if exists (select 1 from private.platform_admins a where a.user_id = p_target) then
    raise exception 'platform admins cannot be suspended' using errcode = '22023';
  end if;

  if p_action = 'check' then
    return jsonb_build_object('ok', true, 'suspended', exists (select 1 from public.platform_bans b where b.user_id = p_target and b.lifted_at is null));
  elsif p_action = 'ban' then
    select * into v_ban from public.platform_bans b where b.user_id = p_target and b.lifted_at is null;
    if not found then
      insert into public.platform_bans (user_id, reason, banned_by)
      values (p_target, nullif(btrim(coalesce(p_reason, '')), ''), p_admin)
      returning * into v_ban;
    end if;
    -- Alle Sitzungen beenden (die Refresh-Tokens hängen daran, on delete cascade).
    delete from auth.sessions s where s.user_id = p_target;
    delete from auth.refresh_tokens r where r.user_id = p_target::text;
    -- Offene Tabs abmelden. Geht erst nach dem Commit raus; ein Fehler hier darf die Sperre nicht verhindern.
    begin
      perform realtime.send(jsonb_build_object('reason', v_ban.reason, 'at', v_ban.created_at), 'suspended', 'account:' || p_target::text, true);
    exception when others then
      raise warning 'onyx: realtime signal failed: %', sqlerrm;
    end;
  elsif p_action = 'unban' then
    update public.platform_bans b set lifted_at = now(), lifted_by = p_admin
    where b.user_id = p_target and b.lifted_at is null
    returning * into v_ban;
  else
    raise exception 'unknown action' using errcode = '22023';
  end if;
  return to_jsonb(v_ban);
end;
$$;

/* ------------------------------------------------------------------ */
/* Server-Banns                                                         */
/* ------------------------------------------------------------------ */

create table public.server_bans (
  server_id uuid not null references public.servers (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  reason text,
  banned_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (server_id, user_id),
  constraint server_bans_reason_length check (reason is null or char_length(reason) <= 512)
);

create index server_bans_user_idx on public.server_bans (user_id);
create index server_bans_banned_by_idx on public.server_bans (banned_by);

-- Wer gebannt hat und wann, setzt der Server.
create function private.server_bans_before_insert() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.banned_by := auth.uid();
  new.created_at := now();
  new.reason := nullif(btrim(coalesce(new.reason, '')), '');
  return new;
end;
$$;

create trigger server_bans_before_insert before insert on public.server_bans for each row execute function private.server_bans_before_insert();

-- Bann = Mitgliedschaft weg (auch ohne "Mitglieder kicken"); Rollen und Abzeichen fallen per Fremdschlüssel mit.
create function private.server_bans_remove_member() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.server_members m where m.server_id = new.server_id and m.user_id = new.user_id;
  return null;
end;
$$;

create trigger server_bans_remove_member after insert on public.server_bans for each row execute function private.server_bans_remove_member();

create trigger block_suspended_writes before insert or update or delete on public.server_bans
  for each statement execute function private.block_suspended_writes();

alter table public.server_bans enable row level security;
revoke all on table public.server_bans from anon, authenticated;
grant select, delete on public.server_bans to authenticated;
grant insert (server_id, user_id, reason) on public.server_bans to authenticated;

create policy "server_bans: sehen mit Mitglieder bannen" on public.server_bans for select to authenticated
  using (private.has_server_permission(server_id, 'banMembers'));
-- Wie beim Kicken: nur Mitglieder unter der eigenen höchsten Rolle, nie der Inhaber, nie man selbst.
create policy "server_bans: bannen" on public.server_bans for insert to authenticated
  with check (
    private.has_server_permission(server_id, 'banMembers')
    and user_id <> (select auth.uid())
    and user_id <> private.server_owner_id(server_id)
    and private.member_below_me(server_id, user_id)
  );
create policy "server_bans: entbannen" on public.server_bans for delete to authenticated
  using (private.has_server_permission(server_id, 'banMembers'));

-- Einladungen: Gebannte kommen nicht zurück (Rest wie in der Abzeichen-Migration).
create or replace function public.join_server_by_invite(p_code text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  inv public.invites;
  v_system uuid;
begin
  if me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if (select count(*) from private.rate_events e where e.user_id = me and e.kind = 'invite_fail' and e.at > now() - interval '10 minutes') >= 10 then
    raise exception 'rate limited: invite_fail' using errcode = 'P0001';
  end if;
  select * into inv from public.invites i where i.code = lower(btrim(p_code)) for update;
  if not found
     or (inv.expires_at is not null and inv.expires_at <= now())
     or (inv.max_uses is not null and inv.uses >= inv.max_uses) then
    insert into private.rate_events (user_id, kind) values (me, 'invite_fail');
    return null;
  end if;
  if exists (select 1 from public.server_bans b where b.server_id = inv.server_id and b.user_id = me) then
    raise exception 'banned from this server' using errcode = '42501';
  end if;
  if exists (select 1 from public.server_members m where m.server_id = inv.server_id and m.user_id = me) then
    return inv.server_id;
  end if;
  if (select count(*) from public.server_members m where m.user_id = me) >= 200 then
    raise exception 'server limit reached' using errcode = '23514';
  end if;

  insert into public.server_members (server_id, user_id) values (inv.server_id, me);
  update public.invites set uses = uses + 1 where code = inv.code;
  select s.system_channel_id into v_system from public.servers s where s.id = inv.server_id;
  if v_system is not null then
    insert into public.messages (channel_id, author_id, type) values (v_system, me, 'join');
  end if;
  if inv.inviter_id is not null and inv.inviter_id <> me then
    insert into private.invite_joins (inviter_id, joiner_id) values (inv.inviter_id, me) on conflict do nothing;
    if found and (select count(*) from private.invite_joins j where j.inviter_id = inv.inviter_id) >= 25 then
      perform private.grant_badge(inv.inviter_id, 'community-builder');
    end if;
  end if;
  return inv.server_id;
end;
$$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.server_bans;
  end if;
end;
$$;

/* ------------------------------------------------------------------ */
/* Meldungen                                                            */
/* ------------------------------------------------------------------ */

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  reason text not null,
  details text,
  reporter_id uuid references public.profiles (id) on delete set null,
  -- Autor der Nachricht bzw. gemeldete Person
  target_user_id uuid references public.profiles (id) on delete set null,
  -- Kopie zum Zeitpunkt der Meldung: bleibt, auch wenn Nachricht, Kanal oder Konto später verschwinden.
  target_username text,
  message_id uuid,
  server_id uuid,
  server_name text,
  channel_id uuid,
  channel_name text,
  dm_id uuid,
  content text,
  attachments jsonb not null default '[]',
  message_created_at timestamptz,
  profile_snapshot jsonb,
  status text not null default 'open',
  handled_by uuid references public.profiles (id) on delete set null,
  handled_at timestamptz,
  message_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint reports_kind check (kind in ('message', 'user')),
  constraint reports_reason check (reason in ('spam', 'harassment', 'hate', 'violence', 'sexual', 'self_harm', 'scam', 'impersonation', 'illegal', 'other')),
  constraint reports_details_length check (details is null or char_length(details) <= 1000),
  constraint reports_status check (status in ('open', 'resolved', 'dismissed')),
  constraint reports_message_target check (kind <> 'message' or message_id is not null)
);

create index reports_status_created_idx on public.reports (status, created_at desc);
create index reports_reporter_idx on public.reports (reporter_id);
create index reports_target_idx on public.reports (target_user_id);
create index reports_handled_by_idx on public.reports (handled_by);
create index reports_message_idx on public.reports (message_id) where message_id is not null;

create trigger block_suspended_writes before insert or update or delete on public.reports
  for each statement execute function private.block_suspended_writes();

-- Kein direktes Schreiben: Meldungen entstehen nur über die Funktionen unten.
alter table public.reports enable row level security;
revoke all on table public.reports from anon, authenticated;
grant select on public.reports to authenticated;
create policy "reports: nur Plattform-Admins" on public.reports for select to authenticated
  using ((select private.is_platform_admin()));

create function private.valid_report_reason(p text) returns boolean
language sql immutable set search_path = ''
as $$ select p in ('spam', 'harassment', 'hate', 'violence', 'sexual', 'self_harm', 'scam', 'impersonation', 'illegal', 'other') $$;

/**
 * Meldet eine Nachricht, die man selbst sehen kann. Der Server kopiert Text,
 * Anhänge, Autor, Ort und Zeit – der Client kann die Kopie nicht fälschen.
 * Ergebnis: {status: 'created', id} | {status: 'duplicate'} (eigene offene Meldung existiert).
 */
create function public.report_message(p_message uuid, p_reason text, p_details text default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  m public.messages;
  v_server uuid;
  v_server_name text;
  v_channel_name text;
  v_id uuid;
begin
  if me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not coalesce(private.valid_report_reason(p_reason), false) then
    raise exception 'invalid report reason' using errcode = '22023';
  end if;
  select * into m from public.messages x where x.id = p_message;
  if not found
     or m.type <> 'default'
     or (m.channel_id is not null and not private.can_read_channel_message(m.channel_id, m.created_at))
     or (m.dm_id is not null and not private.is_dm_participant(m.dm_id)) then
    raise exception 'message not found' using errcode = 'P0002';
  end if;
  if m.author_id = me then
    raise exception 'cannot report your own message' using errcode = '22023';
  end if;
  if exists (select 1 from public.reports r where r.reporter_id = me and r.message_id = m.id and r.status = 'open') then
    return jsonb_build_object('status', 'duplicate');
  end if;
  perform private.hit_rate_limit('report', 10, interval '10 minutes');

  if m.channel_id is not null then
    select c.server_id, c.name, s.name into v_server, v_channel_name, v_server_name
    from public.channels c join public.servers s on s.id = c.server_id where c.id = m.channel_id;
  end if;
  insert into public.reports (
    kind, reason, details, reporter_id, target_user_id, target_username, message_id,
    server_id, server_name, channel_id, channel_name, dm_id, content, attachments, message_created_at
  )
  values (
    'message', p_reason, nullif(btrim(coalesce(p_details, '')), ''), me, m.author_id,
    (select p.username from public.profiles p where p.id = m.author_id), m.id,
    v_server, v_server_name, m.channel_id, v_channel_name, m.dm_id, m.content, m.attachments, m.created_at
  )
  returning id into v_id;
  return jsonb_build_object('status', 'created', 'id', v_id);
end;
$$;

/** Meldet ein Konto (Profil). Kopiert die sichtbaren Profildaten. Ergebnis wie report_message(). */
create function public.report_user(p_user uuid, p_reason text, p_details text default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  p public.profiles;
  v_id uuid;
begin
  if me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not coalesce(private.valid_report_reason(p_reason), false) then
    raise exception 'invalid report reason' using errcode = '22023';
  end if;
  select * into p from public.profiles x where x.id = p_user;
  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  if p.id = me then
    raise exception 'cannot report yourself' using errcode = '22023';
  end if;
  if exists (select 1 from public.reports r where r.reporter_id = me and r.kind = 'user' and r.target_user_id = p.id and r.status = 'open') then
    return jsonb_build_object('status', 'duplicate');
  end if;
  perform private.hit_rate_limit('report', 10, interval '10 minutes');

  insert into public.reports (kind, reason, details, reporter_id, target_user_id, target_username, profile_snapshot)
  values (
    'user', p_reason, nullif(btrim(coalesce(p_details, '')), ''), me, p.id, p.username,
    jsonb_build_object(
      'username', p.username, 'display_name', p.display_name, 'bio', p.bio, 'pronouns', p.pronouns,
      'avatar', p.avatar, 'banner', p.banner, 'custom_status', p.custom_status
    )
  )
  returning id into v_id;
  return jsonb_build_object('status', 'created', 'id', v_id);
end;
$$;

/** Admin: Meldung erledigt / verworfen / wieder offen. */
create function public.admin_set_report_status(p_report uuid, p_status text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'not a platform admin' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('open', 'resolved', 'dismissed') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  update public.reports r
  set status = p_status,
      handled_by = case when p_status = 'open' then null else auth.uid() end,
      handled_at = case when p_status = 'open' then null else now() end
  where r.id = p_report;
  if not found then
    raise exception 'report not found' using errcode = 'P0002';
  end if;
end;
$$;

/**
 * Admin: löscht die gemeldete Nachricht (überall, auch ohne Mitgliedschaft).
 * Gibt die Anhänge zurück, damit die App die Dateien aus dem Storage entfernt.
 */
create function public.admin_delete_reported_message(p_report uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_message uuid;
  v_attachments jsonb;
begin
  if not private.is_platform_admin() then
    raise exception 'not a platform admin' using errcode = '42501';
  end if;
  select r.message_id into v_message from public.reports r where r.id = p_report and r.kind = 'message';
  if v_message is null then
    raise exception 'report not found' using errcode = 'P0002';
  end if;
  delete from public.messages m where m.id = v_message returning m.attachments into v_attachments;
  update public.reports r set message_deleted_at = now() where r.message_id = v_message and r.message_deleted_at is null;
  return jsonb_build_object('deleted', v_attachments is not null, 'attachments', coalesce(v_attachments, '[]'::jsonb));
end;
$$;

/* Anhänge gemeldeter Nachrichten: Admins dürfen sie ansehen und löschen. */

create function private.is_reported_attachment(p_name text) returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    return false;
  end if;
  return exists (
    select 1 from public.reports r cross join lateral jsonb_array_elements(r.attachments) a
    where r.kind = 'message' and a->>'path' = p_name
  );
end;
$$;

create policy "attachments: Plattform-Admins sehen gemeldete" on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and private.is_reported_attachment(name));
create policy "attachments: Plattform-Admins löschen gemeldete" on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and private.is_reported_attachment(name));

/* ------------------------------------------------------------------ */
/* Ausführungsrechte                                                    */
/* ------------------------------------------------------------------ */

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;
revoke execute on function private._scope_permissions(uuid, uuid, uuid, boolean, uuid) from authenticated;
revoke execute on function private.is_blocked_between(uuid, uuid) from authenticated;
revoke execute on function private.handle_new_user() from authenticated;
revoke execute on function private.hit_rate_limit(text, integer, interval) from authenticated;
revoke execute on function private.grant_badge(uuid, text) from authenticated;
revoke execute on function private.block_suspended_writes() from authenticated;
revoke execute on function private.server_bans_before_insert() from authenticated;
revoke execute on function private.server_bans_remove_member() from authenticated;

revoke execute on function
  public.account_status(), public.report_message(uuid, text, text), public.report_user(uuid, text, text),
  public.admin_set_report_status(uuid, text), public.admin_delete_reported_message(uuid)
from public, anon;
grant execute on function
  public.account_status(), public.report_message(uuid, text, text), public.report_user(uuid, text, text),
  public.admin_set_report_status(uuid, text), public.admin_delete_reported_message(uuid)
to authenticated;

-- Nur die Edge Function (service_role) darf sperren.
revoke execute on function public.platform_moderate(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.platform_moderate(uuid, uuid, text, text) to service_role;
