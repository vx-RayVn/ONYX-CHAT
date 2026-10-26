-- ONYX Phase 3 – Prüfungen auf dem Server
--
-- 1. Rollen-Hierarchie wie bei Discord: Rollen bearbeiten, vergeben und entziehen
--    nur unterhalb der eigenen höchsten Rolle; Mitglieder kicken oder umbenennen
--    nur, wenn deren höchste Rolle niedriger ist; nie mehr Rechte vergeben, als
--    man selbst hat. Der Inhaber steht über allen.
-- 2. Slowmode und Flood-Schutz beim Senden.
-- 3. Rate-Limits für Einladungscodes und Freundschaftsanfragen.

/* ------------------------------------------------------------------ */
/* Hierarchie                                                           */
/* ------------------------------------------------------------------ */

/** Position der höchsten Rolle (Inhaber: höher als alles, nur @everyone: 0, kein Mitglied: -1). */
create function private.top_role_position(p_server uuid, p_user uuid) returns integer
language sql stable security definer set search_path = ''
as $$
  select case
    when (select s.owner_id from public.servers s where s.id = p_server) = p_user then 2147483647
    when not exists (select 1 from public.server_members m where m.server_id = p_server and m.user_id = p_user) then -1
    else coalesce((
      select max(r.position) from public.member_roles mr join public.roles r on r.id = mr.role_id
      where mr.server_id = p_server and mr.user_id = p_user and not r.is_default
    ), 0)
  end
$$;

create function private.my_top_role(p_server uuid) returns integer
language sql stable security definer set search_path = ''
as $$ select private.top_role_position(p_server, auth.uid()) $$;

/** Liegt die Rolle unter der eigenen höchsten Rolle? (@everyone gilt immer als darunter.) */
create function private.role_below_me(p_role uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select r.is_default or r.position < private.my_top_role(r.server_id)
  from public.roles r where r.id = p_role
$$;

/** Steht ein Mitglied unter mir? */
create function private.member_below_me(p_server uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select private.top_role_position(p_server, p_user) < private.my_top_role(p_server) $$;

/** Überschreibungen dürfen nur Rollen unter mir oder Mitglieder unter mir (oder mich) betreffen. */
create function private.can_target_overwrite(p_server uuid, p_type public.overwrite_target, p_target uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select case p_type
    when 'role' then coalesce((select private.role_below_me(r.id) from public.roles r where r.id = p_target and r.server_id = p_server), false)
    else p_target = auth.uid() or private.member_below_me(p_server, p_target)
  end
$$;

-- Rollen
alter policy "roles: anlegen mit Rollen verwalten" on public.roles
  with check (
    not is_default and private.has_server_permission(server_id, 'manageRoles')
    and position < private.my_top_role(server_id)
    and permissions <@ private.server_permissions(server_id)
  );
alter policy "roles: ändern mit Rollen verwalten" on public.roles
  using (private.has_server_permission(server_id, 'manageRoles') and (is_default or position < private.my_top_role(server_id)))
  with check (
    private.has_server_permission(server_id, 'manageRoles')
    and (is_default or position < private.my_top_role(server_id))
    and permissions <@ private.server_permissions(server_id)
  );
alter policy "roles: löschen mit Rollen verwalten" on public.roles
  using (not is_default and private.has_server_permission(server_id, 'manageRoles') and position < private.my_top_role(server_id));

-- Rollen vergeben / entziehen
alter policy "member_roles: vergeben mit Rollen verwalten" on public.member_roles
  with check (private.has_server_permission(server_id, 'manageRoles') and private.role_below_me(role_id));
alter policy "member_roles: entziehen mit Rollen verwalten" on public.member_roles
  using (private.has_server_permission(server_id, 'manageRoles') and private.role_below_me(role_id));

-- Kicken und fremde Spitznamen
alter policy "members: verlassen oder kicken" on public.server_members
  using (
    user_id <> private.server_owner_id(server_id)
    and (user_id = (select auth.uid()) or (private.has_server_permission(server_id, 'kickMembers') and private.member_below_me(server_id, user_id)))
  );
alter policy "members: Spitzname ändern" on public.server_members
  using (user_id = (select auth.uid()) or (private.has_server_permission(server_id, 'manageServer') and private.member_below_me(server_id, user_id)))
  with check (user_id = (select auth.uid()) or (private.has_server_permission(server_id, 'manageServer') and private.member_below_me(server_id, user_id)));

-- Überschreibungen: nur eigene Rechte erlauben, nur Ziele unter mir
alter policy "overwrites: anlegen" on public.permission_overwrites
  with check (
    private.can_target_overwrite(server_id, target_type, target_id)
    and (
      (channel_id is not null and private.has_channel_permission(channel_id, 'manageRoles') and allow <@ private.channel_permissions(channel_id))
      or (category_id is not null and private.has_category_permission(category_id, 'manageRoles') and allow <@ private.category_permissions(category_id))
    )
  );
alter policy "overwrites: ändern" on public.permission_overwrites
  using (
    private.can_target_overwrite(server_id, target_type, target_id)
    and ((channel_id is not null and private.has_channel_permission(channel_id, 'manageRoles'))
      or (category_id is not null and private.has_category_permission(category_id, 'manageRoles')))
  )
  with check (
    private.can_target_overwrite(server_id, target_type, target_id)
    and (
      (channel_id is not null and private.has_channel_permission(channel_id, 'manageRoles') and allow <@ private.channel_permissions(channel_id))
      or (category_id is not null and private.has_category_permission(category_id, 'manageRoles') and allow <@ private.category_permissions(category_id))
    )
  );
alter policy "overwrites: löschen" on public.permission_overwrites
  using (
    private.can_target_overwrite(server_id, target_type, target_id)
    and ((channel_id is not null and private.has_channel_permission(channel_id, 'manageRoles'))
      or (category_id is not null and private.has_category_permission(category_id, 'manageRoles')))
  );

/**
 * replace_overwrites ändert jetzt nur, was sich wirklich unterscheidet: Einträge
 * für Rollen über einem selbst bleiben unangetastet, statt den ganzen Aufruf
 * scheitern zu lassen.
 */
create or replace function public.replace_overwrites(p_server uuid, p_channel uuid, p_category uuid, p_list jsonb) returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  if (p_channel is null) = (p_category is null) then
    raise exception 'pass either a channel or a category' using errcode = '22023';
  end if;

  delete from public.permission_overwrites o
  where (case when p_channel is not null then o.channel_id = p_channel else o.category_id = p_category end)
    and not exists (
      select 1 from jsonb_array_elements(coalesce(p_list, '[]')) x
      where x->>'type' = o.target_type::text and (x->>'id')::uuid = o.target_id
    );

  with l as (
    select (x->>'type')::public.overwrite_target as target_type, (x->>'id')::uuid as target_id,
      array(select jsonb_array_elements_text(coalesce(x->'allow', '[]')))::public.permission[] as allow,
      array(select jsonb_array_elements_text(coalesce(x->'deny', '[]')))::public.permission[] as deny
    from jsonb_array_elements(coalesce(p_list, '[]')) x
  )
  update public.permission_overwrites o set allow = l.allow, deny = l.deny
  from l
  where (case when p_channel is not null then o.channel_id = p_channel else o.category_id = p_category end)
    and l.target_type = o.target_type and l.target_id = o.target_id
    and (o.allow is distinct from l.allow or o.deny is distinct from l.deny);

  with l as (
    select (x->>'type')::public.overwrite_target as target_type, (x->>'id')::uuid as target_id,
      array(select jsonb_array_elements_text(coalesce(x->'allow', '[]')))::public.permission[] as allow,
      array(select jsonb_array_elements_text(coalesce(x->'deny', '[]')))::public.permission[] as deny
    from jsonb_array_elements(coalesce(p_list, '[]')) x
  )
  insert into public.permission_overwrites (server_id, channel_id, category_id, target_type, target_id, allow, deny)
  select p_server, p_channel, p_category, l.target_type, l.target_id, l.allow, l.deny
  from l
  where not exists (
    select 1 from public.permission_overwrites o
    where (case when p_channel is not null then o.channel_id = p_channel else o.category_id = p_category end)
      and o.target_type = l.target_type and o.target_id = l.target_id
  );
end;
$$;

/* ------------------------------------------------------------------ */
/* Slowmode und Flood-Schutz                                            */
/* ------------------------------------------------------------------ */

create index messages_author_created_idx on public.messages (author_id, created_at desc);
drop index if exists public.messages_author_idx;

create function private.messages_rate_limit() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_slow integer;
begin
  if new.type <> 'default' or new.author_id is null then
    return new;
  end if;
  -- Flood-Schutz: höchstens 15 Nachrichten in 10 Sekunden.
  if (select count(*) from public.messages m where m.author_id = new.author_id and m.created_at > now() - interval '10 seconds') >= 15 then
    raise exception 'rate limited: too many messages' using errcode = 'P0001';
  end if;
  if new.channel_id is not null then
    select c.slowmode into v_slow from public.channels c where c.id = new.channel_id;
    if coalesce(v_slow, 0) > 0
       and not private.has_channel_permission(new.channel_id, 'manageMessages')
       and not private.has_channel_permission(new.channel_id, 'manageChannels')
       and exists (
         select 1 from public.messages m
         where m.channel_id = new.channel_id and m.author_id = new.author_id and m.type = 'default'
           and m.created_at > now() - make_interval(secs => v_slow)
       ) then
      raise exception 'slowmode active' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger messages_rate_limit before insert on public.messages for each row execute function private.messages_rate_limit();

/* ------------------------------------------------------------------ */
/* Rate-Limits für Einladungen und Freundschaftsanfragen                */
/* ------------------------------------------------------------------ */

create table private.rate_events (
  user_id uuid not null,
  kind text not null,
  at timestamptz not null default now()
);

create index rate_events_lookup_idx on private.rate_events (user_id, kind, at desc);
revoke all on table private.rate_events from public, anon, authenticated;

/** Zählt ein Ereignis und wirft einen Fehler, wenn das Limit im Zeitfenster erreicht ist. */
create function private.hit_rate_limit(p_kind text, p_limit integer, p_window interval) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from private.rate_events where at < now() - interval '1 day';
  if (select count(*) from private.rate_events e where e.user_id = auth.uid() and e.kind = p_kind and e.at > now() - p_window) >= p_limit then
    raise exception 'rate limited: %', p_kind using errcode = 'P0001';
  end if;
  insert into private.rate_events (user_id, kind) values (auth.uid(), p_kind);
end;
$$;

-- Einladungen: höchstens 10 ungültige Codes in 10 Minuten (gegen Durchprobieren).
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
  return inv.server_id;
end;
$$;

-- Freundschaftsanfragen: höchstens 30 pro Stunde.
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
  perform private.hit_rate_limit('friend_request', 30, interval '1 hour');
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
/* Ausführungsrechte                                                    */
/* ------------------------------------------------------------------ */

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;
revoke execute on function private._scope_permissions(uuid, uuid, uuid, boolean, uuid) from authenticated;
revoke execute on function private.is_blocked_between(uuid, uuid) from authenticated;
revoke execute on function private.handle_new_user() from authenticated;
revoke execute on function private.hit_rate_limit(text, integer, interval) from authenticated;
