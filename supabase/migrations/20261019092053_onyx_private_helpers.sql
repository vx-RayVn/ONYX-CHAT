-- ONYX Phase 1 – Härtung nach den Supabase-Advisors
--
-- 1. Hilfsfunktionen für RLS und Trigger ziehen in das Schema "private". Die
--    Data API veröffentlicht nur "public", diese Funktionen sind also nicht mehr
--    als /rest/v1/rpc/… aufrufbar. RLS-Regeln, Trigger und CHECKs verweisen
--    intern über die Funktions-ID darauf und funktionieren unverändert weiter;
--    nur Funktionsrümpfe mit Namensverweisen werden neu geschrieben.
--    In "public" bleiben genau die Funktionen, die die App aufruft.
-- 2. Indizes für alle Fremdschlüssel (Advisor "unindexed foreign keys").

create schema if not exists private;
grant usage on schema private to authenticated;

/* ------------------------------------------------------------------ */
/* Verschieben                                                          */
/* ------------------------------------------------------------------ */

alter function public.is_inline_image(text) set schema private;
alter function public.is_inline_image_source(jsonb) set schema private;
alter function public._perm_minus(public.permission[], public.permission[]) set schema private;
alter function public._perm_union(public.permission[], public.permission[]) set schema private;
alter function public._scope_permissions(uuid, uuid, uuid, boolean, uuid) set schema private;
alter function public.server_permissions(uuid) set schema private;
alter function public.channel_permissions(uuid) set schema private;
alter function public.category_permissions(uuid) set schema private;
alter function public.has_server_permission(uuid, public.permission) set schema private;
alter function public.has_channel_permission(uuid, public.permission) set schema private;
alter function public.has_category_permission(uuid, public.permission) set schema private;
alter function public.is_server_member(uuid) set schema private;
alter function public.server_owner_id(uuid) set schema private;
alter function public.is_dm_participant(uuid) set schema private;
alter function public.can_read_channel_message(uuid, timestamptz) set schema private;
alter function public.is_blocked_between(uuid, uuid) set schema private;
alter function public.can_send_dm(uuid) set schema private;
alter function public.reaction_exists(uuid, text) set schema private;

alter function public.handle_new_user() set schema private;
alter function public.profiles_check_badges() set schema private;
alter function public.roles_guard() set schema private;
alter function public.roles_drop_overwrites() set schema private;
alter function public.members_drop_overwrites() set schema private;
alter function public.member_roles_guard() set schema private;
alter function public.server_badges_limit() set schema private;
alter function public.messages_before_insert() set schema private;
alter function public.messages_touch_dm() set schema private;
alter function public.reactions_fill_scope() set schema private;
alter function public.messages_before_update() set schema private;

-- Wurde nirgends verwendet.
drop function public.is_server_owner(uuid);

/* ------------------------------------------------------------------ */
/* Rümpfe mit Namensverweisen neu schreiben (gleiche Signatur = gleiche ID) */
/* ------------------------------------------------------------------ */

create or replace function private.is_inline_image_source(p jsonb) returns boolean
language sql immutable set search_path = ''
as $$
  select p is null
    or p->>'kind' is distinct from 'image'
    or (private.is_inline_image(p->>'src') and private.is_inline_image(p->>'poster'))
$$;

create or replace function private._scope_permissions(p_server uuid, p_channel uuid, p_category uuid, p_voice boolean, p_user uuid)
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
    eff_deny := private._perm_union(ow.cd, private._perm_minus(ow.kd, ow.ca));
    eff_allow := private._perm_union(private._perm_minus(ow.ca, ow.cd), private._perm_minus(private._perm_minus(ow.ka, ow.kd), ow.cd));
    if ow.target_type = 'member' then
      m_allow := eff_allow;
      m_deny := eff_deny;
    elsif ow.target_id = v_everyone then
      e_allow := eff_allow;
      e_deny := eff_deny;
    else
      r_allow := private._perm_union(r_allow, eff_allow);
      r_deny := private._perm_union(r_deny, eff_deny);
    end if;
  end loop;

  v := private._perm_union(private._perm_minus(base, e_deny), e_allow);
  v := private._perm_union(private._perm_minus(v, r_deny), r_allow);
  v := private._perm_union(private._perm_minus(v, m_deny), m_allow);

  if not ('viewChannel' = any (v)) then
    return '{}';
  end if;
  if not ('sendMessages' = any (v)) then
    v := private._perm_minus(v, array['attachFiles', 'sendVoiceMessages', 'mentionEveryone']::public.permission[]);
  end if;
  if p_voice and not ('connect' = any (v)) then
    v := private._perm_minus(v, array['speak', 'video']::public.permission[]);
  end if;
  return v;
end;
$$;

create or replace function private.server_permissions(p_server uuid) returns public.permission[]
language sql stable security definer set search_path = ''
as $$ select private._scope_permissions(p_server, null, null, false, auth.uid()) $$;

create or replace function private.channel_permissions(p_channel uuid) returns public.permission[]
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select private._scope_permissions(c.server_id, c.id, c.category_id, c.type = 'voice', auth.uid())
    from public.channels c where c.id = p_channel
  ), '{}')
$$;

create or replace function private.category_permissions(p_category uuid) returns public.permission[]
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select private._scope_permissions(k.server_id, null, k.id, false, auth.uid())
    from public.categories k where k.id = p_category
  ), '{}')
$$;

create or replace function private.has_server_permission(p_server uuid, p_perm public.permission) returns boolean
language sql stable security definer set search_path = ''
as $$ select p_perm = any (private.server_permissions(p_server)) $$;

create or replace function private.has_channel_permission(p_channel uuid, p_perm public.permission) returns boolean
language sql stable security definer set search_path = ''
as $$ select p_perm = any (private.channel_permissions(p_channel)) $$;

create or replace function private.has_category_permission(p_category uuid, p_perm public.permission) returns boolean
language sql stable security definer set search_path = ''
as $$ select p_perm = any (private.category_permissions(p_category)) $$;

create or replace function private.can_read_channel_message(p_channel uuid, p_created_at timestamptz) returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v public.permission[] := private.channel_permissions(p_channel);
begin
  return 'viewChannel' = any (v) and ('readHistory' = any (v) or p_created_at > now() - interval '2 minutes');
end;
$$;

create or replace function private.can_send_dm(p_dm uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_dm_participant(p_dm) and not exists (
    select 1 from public.dm_channels d join public.dm_participants o on o.dm_id = d.id and o.user_id <> auth.uid()
    where d.id = p_dm and d.type = 'dm' and private.is_blocked_between(auth.uid(), o.user_id)
  )
$$;

create or replace function private.messages_before_update() returns trigger
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
     and not private.has_channel_permission(old.channel_id, 'manageMessages') then
    raise exception 'missing permission: manageMessages' using errcode = '42501';
  end if;
  return new;
end;
$$;

/* API-Funktionen in "public", die eine verschobene Funktion beim Namen nennen. */

create or replace function public.open_dm(p_user uuid, p_id uuid default null) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  v_key text;
  v_id uuid;
begin
  if me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_user is null or p_user = me or not exists (select 1 from public.profiles p where p.id = p_user) then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  v_key := least(me, p_user)::text || ':' || greatest(me, p_user)::text;
  select d.id into v_id from public.dm_channels d where d.dm_key = v_key;
  if v_id is null then
    if private.is_blocked_between(me, p_user) then
      raise exception 'blocked' using errcode = '42501';
    end if;
    if not exists (
         select 1 from public.friendships f
         where f.status = 'accepted' and least(f.requester_id, f.addressee_id) = least(me, p_user) and greatest(f.requester_id, f.addressee_id) = greatest(me, p_user)
       )
       and not exists (
         select 1 from public.server_members a join public.server_members b on b.server_id = a.server_id
         where a.user_id = me and b.user_id = p_user
       ) then
      raise exception 'you need to be friends or share a server' using errcode = '42501';
    end if;
    insert into public.dm_channels (id, type, dm_key) values (coalesce(p_id, gen_random_uuid()), 'dm', v_key)
    on conflict (dm_key) do nothing
    returning id into v_id;
    if v_id is null then
      select d.id into v_id from public.dm_channels d where d.dm_key = v_key;
    else
      -- Für die andere Seite erscheint die DM erst mit der ersten Nachricht.
      insert into public.dm_participants (dm_id, user_id, hidden) values (v_id, me, false), (v_id, p_user, true);
    end if;
  end if;
  update public.dm_participants set hidden = false where dm_id = v_id and user_id = me;
  return v_id;
end;
$$;

create or replace function public.friend_request(p_username text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  v_target public.profiles;
  v_friendship public.friendships;
  v_status text;
begin
  if me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select * into v_target from public.profiles p where lower(p.username) = lower(ltrim(btrim(p_username), '@'));
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_target.id = me then
    return jsonb_build_object('status', 'self');
  end if;
  if private.is_blocked_between(me, v_target.id) then
    return jsonb_build_object('status', 'unavailable', 'user_id', v_target.id, 'display_name', v_target.display_name);
  end if;
  select * into v_friendship from public.friendships f
  where least(f.requester_id, f.addressee_id) = least(me, v_target.id) and greatest(f.requester_id, f.addressee_id) = greatest(me, v_target.id);
  if not found then
    insert into public.friendships (requester_id, addressee_id) values (me, v_target.id);
    v_status := 'sent';
  elsif v_friendship.status = 'accepted' then
    v_status := 'already_friends';
  elsif v_friendship.requester_id = me then
    v_status := 'already_sent';
  else
    update public.friendships set status = 'accepted', accepted_at = now() where id = v_friendship.id;
    v_status := 'accepted';
  end if;
  return jsonb_build_object('status', v_status, 'user_id', v_target.id, 'display_name', v_target.display_name);
end;
$$;

/* ------------------------------------------------------------------ */
/* Ausführungsrechte in "private"                                       */
/* ------------------------------------------------------------------ */
-- authenticated braucht die Helfer, weil RLS-Regeln und CHECKs mit den Rechten
-- der angemeldeten Person laufen – über die API erreichbar sind sie trotzdem nicht.

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;
revoke execute on function private._scope_permissions(uuid, uuid, uuid, boolean, uuid) from authenticated;
revoke execute on function private.is_blocked_between(uuid, uuid) from authenticated;
revoke execute on function private.handle_new_user() from authenticated;

/* ------------------------------------------------------------------ */
/* Indizes für Fremdschlüssel                                           */
/* ------------------------------------------------------------------ */

create index channels_category_server_idx on public.channels (category_id, server_id);
create index invites_channel_server_idx on public.invites (channel_id, server_id);
create index invites_inviter_idx on public.invites (inviter_id);
create index member_badges_badge_server_idx on public.member_badges (badge_id, server_id);
drop index public.member_roles_role_idx;
create index member_roles_role_server_idx on public.member_roles (role_id, server_id);
drop index public.overwrites_channel_idx;
drop index public.overwrites_category_idx;
create index overwrites_channel_server_idx on public.permission_overwrites (channel_id, server_id);
create index overwrites_category_server_idx on public.permission_overwrites (category_id, server_id);
create index servers_system_channel_idx on public.servers (system_channel_id, id);
create index friendships_requester_idx on public.friendships (requester_id);
create index dm_channels_owner_idx on public.dm_channels (owner_id);
