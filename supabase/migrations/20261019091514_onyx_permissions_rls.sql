-- ONYX Phase 1 – Berechtigungen und Row Level Security
--
-- _scope_permissions() ist eine 1:1-Übertragung von channelPermissions() aus
-- src/lib/permissions.ts (gleiche Reihenfolge wie bei Discord):
--   1. Inhaber und Administrator: alles.
--   2. Basis: Rechte von @everyone plus aller Rollen des Mitglieds.
--   3. Überschreibungen; pro Berechtigung gewinnt der Kanal-Eintrag über den der
--      Kategorie. Reihenfolge: @everyone → Rollen (erst alle Verweigerungen, dann
--      alle Erlaubnisse) → das Mitglied selbst.
--   4. Ohne "viewChannel" nichts; ohne "sendMessages" keine Dateien,
--      Sprachnachrichten oder @everyone; in Sprachkanälen ohne "connect" weder
--      Sprechen noch Video.
-- Wer kein Mitglied ist, hat keine Rechte.

/* ------------------------------------------------------------------ */
/* Hilfsfunktionen                                                      */
/* ------------------------------------------------------------------ */

create function public._perm_minus(a public.permission[], b public.permission[]) returns public.permission[]
language sql immutable set search_path = ''
as $$ select coalesce(array_agg(x order by x), '{}') from unnest(a) x where not (x = any (coalesce(b, '{}'))) $$;

create function public._perm_union(a public.permission[], b public.permission[]) returns public.permission[]
language sql immutable set search_path = ''
as $$ select coalesce(array_agg(distinct x order by x), '{}') from unnest(coalesce(a, '{}') || coalesce(b, '{}')) x $$;

/**
 * Effektive Rechte von p_user auf einem Server (p_channel und p_category null),
 * in einer Kategorie (nur p_category) oder in einem Kanal (p_channel mit seiner
 * Kategorie).
 */
create function public._scope_permissions(p_server uuid, p_channel uuid, p_category uuid, p_voice boolean, p_user uuid)
returns public.permission[]
language plpgsql stable security definer set search_path = ''
as $$
declare
  all_perms constant public.permission[] := enum_range(null::public.permission);
  v_owner uuid;
  v_everyone uuid;
  v_roles uuid[];
  base public.permission[];
  ow record;
  eff_allow public.permission[];
  eff_deny public.permission[];
  e_allow public.permission[] := '{}';
  e_deny public.permission[] := '{}';
  r_allow public.permission[] := '{}';
  r_deny public.permission[] := '{}';
  m_allow public.permission[] := '{}';
  m_deny public.permission[] := '{}';
  v public.permission[];
begin
  if p_user is null then
    return '{}';
  end if;
  select s.owner_id into v_owner from public.servers s where s.id = p_server;
  if not found then
    return '{}';
  end if;
  if v_owner = p_user then
    return all_perms;
  end if;
  if not exists (select 1 from public.server_members m where m.server_id = p_server and m.user_id = p_user) then
    return '{}';
  end if;

  select r.id into v_everyone from public.roles r where r.server_id = p_server and r.is_default;
  select coalesce(array_agg(mr.role_id), '{}') into v_roles
    from public.member_roles mr join public.roles r on r.id = mr.role_id
    where mr.server_id = p_server and mr.user_id = p_user and not r.is_default;
  select coalesce(array_agg(distinct p), '{}') into base
    from public.roles r cross join lateral unnest(r.permissions) p
    where r.server_id = p_server and (r.is_default or r.id = any (v_roles));

  if 'administrator' = any (base) then
    return all_perms;
  end if;
  if p_channel is null and p_category is null then
    return base;
  end if;

  -- Pro Ziel (Rolle oder Mitglied): Kanal-Eintrag (ca/cd) und Kategorie-Eintrag (ka/kd).
  for ow in
    select o.target_type, o.target_id,
      coalesce(max(o.allow) filter (where o.channel_id is not null), '{}') as ca,
      coalesce(max(o.deny) filter (where o.channel_id is not null), '{}') as cd,
      coalesce(max(o.allow) filter (where o.category_id is not null), '{}') as ka,
      coalesce(max(o.deny) filter (where o.category_id is not null), '{}') as kd
    from public.permission_overwrites o
    where (o.channel_id = p_channel or (p_category is not null and o.category_id = p_category))
      and ((o.target_type = 'role' and (o.target_id = v_everyone or o.target_id = any (v_roles)))
        or (o.target_type = 'member' and o.target_id = p_user))
    group by o.target_type, o.target_id
  loop
    -- Kanal zuerst (Verweigern vor Erlauben), sonst Kategorie.
    eff_deny := public._perm_union(ow.cd, public._perm_minus(ow.kd, ow.ca));
    eff_allow := public._perm_union(public._perm_minus(ow.ca, ow.cd), public._perm_minus(public._perm_minus(ow.ka, ow.kd), ow.cd));
    if ow.target_type = 'member' then
      m_allow := eff_allow;
      m_deny := eff_deny;
    elsif ow.target_id = v_everyone then
      e_allow := eff_allow;
      e_deny := eff_deny;
    else
      r_allow := public._perm_union(r_allow, eff_allow);
      r_deny := public._perm_union(r_deny, eff_deny);
    end if;
  end loop;

  v := public._perm_union(public._perm_minus(base, e_deny), e_allow);
  v := public._perm_union(public._perm_minus(v, r_deny), r_allow);
  v := public._perm_union(public._perm_minus(v, m_deny), m_allow);

  if not ('viewChannel' = any (v)) then
    return '{}';
  end if;
  if not ('sendMessages' = any (v)) then
    v := public._perm_minus(v, array['attachFiles', 'sendVoiceMessages', 'mentionEveryone']::public.permission[]);
  end if;
  if p_voice and not ('connect' = any (v)) then
    v := public._perm_minus(v, array['speak', 'video']::public.permission[]);
  end if;
  return v;
end;
$$;

/* Öffentliche Helfer – immer für den angemeldeten Nutzer (auth.uid()). */

create function public.server_permissions(p_server uuid) returns public.permission[]
language sql stable security definer set search_path = ''
as $$ select public._scope_permissions(p_server, null, null, false, auth.uid()) $$;

create function public.channel_permissions(p_channel uuid) returns public.permission[]
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select public._scope_permissions(c.server_id, c.id, c.category_id, c.type = 'voice', auth.uid())
    from public.channels c where c.id = p_channel
  ), '{}')
$$;

create function public.category_permissions(p_category uuid) returns public.permission[]
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select public._scope_permissions(k.server_id, null, k.id, false, auth.uid())
    from public.categories k where k.id = p_category
  ), '{}')
$$;

create function public.has_server_permission(p_server uuid, p_perm public.permission) returns boolean
language sql stable security definer set search_path = ''
as $$ select p_perm = any (public.server_permissions(p_server)) $$;

create function public.has_channel_permission(p_channel uuid, p_perm public.permission) returns boolean
language sql stable security definer set search_path = ''
as $$ select p_perm = any (public.channel_permissions(p_channel)) $$;

create function public.has_category_permission(p_category uuid, p_perm public.permission) returns boolean
language sql stable security definer set search_path = ''
as $$ select p_perm = any (public.category_permissions(p_category)) $$;

create function public.is_server_member(p_server uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.server_members m where m.server_id = p_server and m.user_id = auth.uid()) $$;

create function public.is_server_owner(p_server uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.servers s where s.id = p_server and s.owner_id = auth.uid()) $$;

create function public.server_owner_id(p_server uuid) returns uuid
language sql stable security definer set search_path = ''
as $$ select s.owner_id from public.servers s where s.id = p_server $$;

create function public.is_dm_participant(p_dm uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.dm_participants p where p.dm_id = p_dm and p.user_id = auth.uid()) $$;

/** Ohne "Nachrichtenverlauf lesen" sieht man nur ganz neue Nachrichten (live, wie bisher in der Demo). */
create function public.can_read_channel_message(p_channel uuid, p_created_at timestamptz) returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v public.permission[] := public.channel_permissions(p_channel);
begin
  return 'viewChannel' = any (v) and ('readHistory' = any (v) or p_created_at > now() - interval '2 minutes');
end;
$$;

/** Zwischen zwei Personen ist eine Blockierung aktiv (egal in welche Richtung). */
create function public.is_blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.blocks k where (k.blocker_id = a and k.blocked_id = b) or (k.blocker_id = b and k.blocked_id = a)) $$;

/** In einer 1:1-DM darf nicht geschrieben werden, wenn eine Seite die andere blockiert hat. */
create function public.can_send_dm(p_dm uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_dm_participant(p_dm) and not exists (
    select 1 from public.dm_channels d join public.dm_participants o on o.dm_id = d.id and o.user_id <> auth.uid()
    where d.id = p_dm and d.type = 'dm' and public.is_blocked_between(auth.uid(), o.user_id)
  )
$$;

/** Eine Reaktion, die es schon gibt, darf man auch ohne "Reaktionen hinzufügen" anklicken (wie bei Discord). */
create function public.reaction_exists(p_message uuid, p_emoji text) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.reactions r where r.message_id = p_message and r.emoji = p_emoji) $$;

-- Interne Funktionen nicht über die API aufrufbar.
revoke execute on function public._scope_permissions(uuid, uuid, uuid, boolean, uuid) from public, anon, authenticated;
revoke execute on function public.is_blocked_between(uuid, uuid) from public, anon, authenticated;

/* ------------------------------------------------------------------ */
/* Bearbeiten von Nachrichten                                           */
/* ------------------------------------------------------------------ */

-- Inhalt ändert nur die Person, die geschrieben hat; Anheften braucht "Nachrichten verwalten" (in DMs: alle Teilnehmer).
create function public.messages_before_update() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.content is distinct from old.content then
    if old.author_id is distinct from auth.uid() then
      raise exception 'only the author can edit a message' using errcode = '42501';
    end if;
    new.edited_at := now();
  end if;
  if new.pinned is distinct from old.pinned and old.channel_id is not null
     and not public.has_channel_permission(old.channel_id, 'manageMessages') then
    raise exception 'missing permission: manageMessages' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger messages_before_update before update on public.messages for each row execute function public.messages_before_update();

/* ------------------------------------------------------------------ */
/* Rechte auf Tabellenebene                                             */
/* ------------------------------------------------------------------ */
-- Ausdrücklich gesetzt statt der Supabase-Standardrechte: anon bekommt nichts,
-- authenticated nur, was die App braucht (geschützte Spalten fehlen bewusst).

revoke all on table
  public.profiles, public.user_badges, public.servers, public.roles, public.server_members, public.member_roles,
  public.categories, public.channels, public.permission_overwrites, public.invites, public.server_badges,
  public.member_badges, public.dm_channels, public.dm_participants, public.messages, public.reactions,
  public.friendships, public.blocks
from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (username, display_name, avatar, avatar_color, banner, bio, pronouns, status, custom_status, badges, profile_colors,
  avatar_decoration, profile_frame, profile_effect, name_style, border_line, supporter_wall) on public.profiles to authenticated;

grant select on public.user_badges to authenticated;

grant select, delete on public.servers to authenticated;
grant update (name, icon, icon_color, banner, description, system_channel_id) on public.servers to authenticated;

grant select, delete on public.roles to authenticated;
grant insert (id, server_id, name, color, hoist, position, permissions) on public.roles to authenticated;
grant update (name, color, hoist, position, permissions) on public.roles to authenticated;

grant select, delete on public.server_members to authenticated;
grant update (nickname) on public.server_members to authenticated;

grant select, insert, delete on public.member_roles to authenticated;

grant select, delete on public.categories to authenticated;
grant insert (id, server_id, name, position) on public.categories to authenticated;
grant update (name, position) on public.categories to authenticated;

grant select, delete on public.channels to authenticated;
grant insert (id, server_id, category_id, name, type, topic, position, slowmode, age_restricted, user_limit) on public.channels to authenticated;
grant update (category_id, name, topic, position, slowmode, age_restricted, user_limit) on public.channels to authenticated;

grant select, delete on public.permission_overwrites to authenticated;
grant insert (server_id, channel_id, category_id, target_type, target_id, allow, deny) on public.permission_overwrites to authenticated;
grant update (allow, deny) on public.permission_overwrites to authenticated;

grant select, delete on public.invites to authenticated;
grant insert (code, server_id, channel_id, inviter_id, max_uses, expires_at) on public.invites to authenticated;

grant select, delete on public.server_badges to authenticated;
grant insert (id, server_id, name, image, description) on public.server_badges to authenticated;
grant update (name, image, description) on public.server_badges to authenticated;

grant select, delete on public.member_badges to authenticated;
grant insert (server_id, user_id, badge_id) on public.member_badges to authenticated;

grant select on public.dm_channels to authenticated;
grant update (name, icon) on public.dm_channels to authenticated;

grant select on public.dm_participants to authenticated;
grant update (hidden) on public.dm_participants to authenticated;

grant select, delete on public.messages to authenticated;
grant insert (id, channel_id, dm_id, author_id, type, content, reply_to_id, reply_mention, attachments, embeds) on public.messages to authenticated;
grant update (content, pinned) on public.messages to authenticated;

grant select, delete on public.reactions to authenticated;
grant insert (message_id, user_id, emoji) on public.reactions to authenticated;

grant select on public.friendships to authenticated;
grant select on public.blocks to authenticated;

/* ------------------------------------------------------------------ */
/* Row Level Security                                                   */
/* ------------------------------------------------------------------ */

alter table public.profiles enable row level security;
alter table public.user_badges enable row level security;
alter table public.servers enable row level security;
alter table public.roles enable row level security;
alter table public.server_members enable row level security;
alter table public.member_roles enable row level security;
alter table public.categories enable row level security;
alter table public.channels enable row level security;
alter table public.permission_overwrites enable row level security;
alter table public.invites enable row level security;
alter table public.server_badges enable row level security;
alter table public.member_badges enable row level security;
alter table public.dm_channels enable row level security;
alter table public.dm_participants enable row level security;
alter table public.messages enable row level security;
alter table public.reactions enable row level security;
alter table public.friendships enable row level security;
alter table public.blocks enable row level security;

-- Profile sind für angemeldete Nutzer öffentlich (wie Profilkarten); ändern nur das eigene.
create policy "profiles: angemeldete sehen Profile" on public.profiles for select to authenticated using (true);
create policy "profiles: eigenes Profil ändern" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "user_badges: angemeldete sehen Abzeichen" on public.user_badges for select to authenticated using (true);

-- Server: nur Mitglieder sehen ihn; ändern mit "Server verwalten"; löschen nur der Inhaber.
create policy "servers: Mitglieder sehen" on public.servers for select to authenticated using (public.is_server_member(id));
create policy "servers: Server verwalten" on public.servers for update to authenticated
  using (public.has_server_permission(id, 'manageServer')) with check (public.has_server_permission(id, 'manageServer'));
create policy "servers: Inhaber löscht" on public.servers for delete to authenticated using (owner_id = (select auth.uid()));

create policy "roles: Mitglieder sehen" on public.roles for select to authenticated using (public.is_server_member(server_id));
create policy "roles: anlegen mit Rollen verwalten" on public.roles for insert to authenticated
  with check (not is_default and public.has_server_permission(server_id, 'manageRoles'));
create policy "roles: ändern mit Rollen verwalten" on public.roles for update to authenticated
  using (public.has_server_permission(server_id, 'manageRoles')) with check (public.has_server_permission(server_id, 'manageRoles'));
create policy "roles: löschen mit Rollen verwalten" on public.roles for delete to authenticated
  using (not is_default and public.has_server_permission(server_id, 'manageRoles'));

-- Mitglieder: Beitritt nur über join_server_by_invite(); Spitzname selbst oder mit "Server verwalten";
-- verlassen (nicht als Inhaber) oder kicken mit "Mitglieder kicken" (nie den Inhaber).
create policy "members: Mitglieder sehen" on public.server_members for select to authenticated using (public.is_server_member(server_id));
create policy "members: Spitzname ändern" on public.server_members for update to authenticated
  using (user_id = (select auth.uid()) or public.has_server_permission(server_id, 'manageServer'))
  with check (user_id = (select auth.uid()) or public.has_server_permission(server_id, 'manageServer'));
create policy "members: verlassen oder kicken" on public.server_members for delete to authenticated
  using (
    user_id <> public.server_owner_id(server_id)
    and (user_id = (select auth.uid()) or public.has_server_permission(server_id, 'kickMembers'))
  );

create policy "member_roles: Mitglieder sehen" on public.member_roles for select to authenticated using (public.is_server_member(server_id));
create policy "member_roles: vergeben mit Rollen verwalten" on public.member_roles for insert to authenticated
  with check (public.has_server_permission(server_id, 'manageRoles'));
create policy "member_roles: entziehen mit Rollen verwalten" on public.member_roles for delete to authenticated
  using (public.has_server_permission(server_id, 'manageRoles'));

create policy "categories: Mitglieder sehen" on public.categories for select to authenticated using (public.is_server_member(server_id));
create policy "categories: anlegen mit Kanäle verwalten" on public.categories for insert to authenticated
  with check (public.has_server_permission(server_id, 'manageChannels'));
create policy "categories: ändern mit Kanäle verwalten" on public.categories for update to authenticated
  using (public.has_server_permission(server_id, 'manageChannels')) with check (public.has_server_permission(server_id, 'manageChannels'));
create policy "categories: löschen mit Kanäle verwalten" on public.categories for delete to authenticated
  using (public.has_server_permission(server_id, 'manageChannels'));

-- Kanäle: sichtbar nur mit "Kanal ansehen" (private Kanäle bleiben auch über die API verborgen).
create policy "channels: sichtbar mit Kanal ansehen" on public.channels for select to authenticated
  using (public.has_channel_permission(id, 'viewChannel'));
create policy "channels: anlegen mit Kanäle verwalten" on public.channels for insert to authenticated
  with check (
    public.has_server_permission(server_id, 'manageChannels')
    and (category_id is null or public.has_category_permission(category_id, 'manageChannels'))
  );
create policy "channels: ändern mit Kanäle verwalten" on public.channels for update to authenticated
  using (public.has_channel_permission(id, 'manageChannels'))
  with check (category_id is null or public.has_category_permission(category_id, 'manageChannels'));
create policy "channels: löschen mit Kanäle verwalten" on public.channels for delete to authenticated
  using (public.has_channel_permission(id, 'manageChannels'));

-- Überschreibungen: lesen, wer den Kanal sieht (Kategorien: alle Mitglieder);
-- ändern mit "Berechtigungen verwalten" (manageRoles) an genau dieser Stelle.
create policy "overwrites: sichtbar" on public.permission_overwrites for select to authenticated
  using (
    (channel_id is not null and public.has_channel_permission(channel_id, 'viewChannel'))
    or (category_id is not null and public.is_server_member(server_id))
  );
create policy "overwrites: anlegen" on public.permission_overwrites for insert to authenticated
  with check (
    (channel_id is not null and public.has_channel_permission(channel_id, 'manageRoles'))
    or (category_id is not null and public.has_category_permission(category_id, 'manageRoles'))
  );
create policy "overwrites: ändern" on public.permission_overwrites for update to authenticated
  using (
    (channel_id is not null and public.has_channel_permission(channel_id, 'manageRoles'))
    or (category_id is not null and public.has_category_permission(category_id, 'manageRoles'))
  );
create policy "overwrites: löschen" on public.permission_overwrites for delete to authenticated
  using (
    (channel_id is not null and public.has_channel_permission(channel_id, 'manageRoles'))
    or (category_id is not null and public.has_category_permission(category_id, 'manageRoles'))
  );

-- Einladungen: Mitglieder sehen sie; erstellen mit "Einladungen erstellen"; widerrufen eigene oder mit "Server verwalten".
create policy "invites: Mitglieder sehen" on public.invites for select to authenticated using (public.is_server_member(server_id));
create policy "invites: erstellen" on public.invites for insert to authenticated
  with check (
    inviter_id = (select auth.uid())
    and (case when channel_id is null then public.has_server_permission(server_id, 'createInvites')
              else public.has_channel_permission(channel_id, 'createInvites') end)
  );
create policy "invites: widerrufen" on public.invites for delete to authenticated
  using (inviter_id = (select auth.uid()) or public.has_server_permission(server_id, 'manageServer'));

create policy "server_badges: Mitglieder sehen" on public.server_badges for select to authenticated using (public.is_server_member(server_id));
create policy "server_badges: erstellen" on public.server_badges for insert to authenticated
  with check (public.has_server_permission(server_id, 'manageBadges'));
create policy "server_badges: ändern" on public.server_badges for update to authenticated
  using (public.has_server_permission(server_id, 'manageBadges')) with check (public.has_server_permission(server_id, 'manageBadges'));
create policy "server_badges: löschen" on public.server_badges for delete to authenticated
  using (public.has_server_permission(server_id, 'manageBadges'));

create policy "member_badges: Mitglieder sehen" on public.member_badges for select to authenticated using (public.is_server_member(server_id));
create policy "member_badges: vergeben" on public.member_badges for insert to authenticated
  with check (public.has_server_permission(server_id, 'manageBadges'));
create policy "member_badges: entziehen" on public.member_badges for delete to authenticated
  using (public.has_server_permission(server_id, 'manageBadges'));

-- DMs: nur Teilnehmer. Anlegen über open_dm() / create_group_dm().
create policy "dm_channels: Teilnehmer sehen" on public.dm_channels for select to authenticated using (public.is_dm_participant(id));
create policy "dm_channels: Gruppe umbenennen" on public.dm_channels for update to authenticated
  using (type = 'group' and public.is_dm_participant(id)) with check (type = 'group' and public.is_dm_participant(id));

create policy "dm_participants: Teilnehmer sehen" on public.dm_participants for select to authenticated using (public.is_dm_participant(dm_id));
create policy "dm_participants: eigene DM ausblenden" on public.dm_participants for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Nachrichten
create policy "messages: lesen" on public.messages for select to authenticated
  using (
    (channel_id is not null and public.can_read_channel_message(channel_id, created_at))
    or (dm_id is not null and public.is_dm_participant(dm_id))
  );
create policy "messages: schreiben" on public.messages for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (
      (channel_id is not null and (
        (type = 'default' and public.has_channel_permission(channel_id, 'sendMessages'))
        or (type = 'pin' and public.has_channel_permission(channel_id, 'manageMessages'))
      ))
      or (dm_id is not null and type in ('default', 'pin') and public.can_send_dm(dm_id))
    )
  );
create policy "messages: bearbeiten oder anheften" on public.messages for update to authenticated
  using (
    (channel_id is not null and public.has_channel_permission(channel_id, 'viewChannel')
      and (author_id = (select auth.uid()) or public.has_channel_permission(channel_id, 'manageMessages')))
    or (dm_id is not null and public.is_dm_participant(dm_id))
  );
create policy "messages: löschen" on public.messages for delete to authenticated
  using (
    author_id = (select auth.uid())
    or (channel_id is not null and public.has_channel_permission(channel_id, 'manageMessages'))
  );

-- Reaktionen
create policy "reactions: lesen" on public.reactions for select to authenticated
  using (
    (channel_id is not null and public.has_channel_permission(channel_id, 'viewChannel'))
    or (dm_id is not null and public.is_dm_participant(dm_id))
  );
create policy "reactions: hinzufügen" on public.reactions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      (channel_id is not null and public.has_channel_permission(channel_id, 'viewChannel')
        and (public.has_channel_permission(channel_id, 'addReactions') or public.reaction_exists(message_id, emoji)))
      or (dm_id is not null and public.can_send_dm(dm_id))
    )
  );
create policy "reactions: eigene entfernen" on public.reactions for delete to authenticated using (user_id = (select auth.uid()));

-- Freundschaften und Blockierungen: nur die eigenen; Änderungen über die RPC-Funktionen.
create policy "friendships: eigene sehen" on public.friendships for select to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));
create policy "blocks: eigene sehen" on public.blocks for select to authenticated using (blocker_id = (select auth.uid()));
