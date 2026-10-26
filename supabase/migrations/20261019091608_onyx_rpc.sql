-- ONYX Phase 1 – RPC-Funktionen
--
-- Für Abläufe, die mehrere Tabellen auf einmal ändern oder Daten brauchen, die
-- man vorher nicht sehen darf (z. B. einer Einladung folgen). Jede Funktion
-- prüft selbst, wer aufruft (auth.uid()).

/* ------------------------------------------------------------------ */
/* Registrierung                                                        */
/* ------------------------------------------------------------------ */

create function public.username_available(p_username text) returns boolean
language sql stable security definer set search_path = ''
as $$ select not exists (select 1 from public.profiles p where lower(p.username) = lower(btrim(p_username))) $$;

/* ------------------------------------------------------------------ */
/* Server                                                               */
/* ------------------------------------------------------------------ */

/**
 * Legt einen Server mit Rollen, Kategorien, Kanälen und Begrüßungsnachricht in
 * einem Schritt an. Der Client schickt die Struktur mit seinen UUIDs (so wie er
 * sie schon optimistisch anzeigt); Inhaber ist immer, wer aufruft.
 */
create function public.create_server(p jsonb) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  v_server uuid;
  v_system uuid := nullif(p->>'systemChannelId', '')::uuid;
begin
  if me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if (select count(*) from public.servers s where s.owner_id = me) >= 100 then
    raise exception 'server limit reached' using errcode = '23514';
  end if;
  if jsonb_array_length(coalesce(p->'roles', '[]')) > 50
     or jsonb_array_length(coalesce(p->'categories', '[]')) > 50
     or jsonb_array_length(coalesce(p->'channels', '[]')) > 200 then
    raise exception 'template too large' using errcode = '23514';
  end if;
  if (select count(*) from jsonb_array_elements(coalesce(p->'roles', '[]')) x where coalesce((x->>'isDefault')::boolean, false)) <> 1 then
    raise exception 'exactly one @everyone role required' using errcode = '23514';
  end if;

  insert into public.servers (id, name, icon, icon_color, description, owner_id)
  values (coalesce(nullif(p->>'id', '')::uuid, gen_random_uuid()), btrim(p->>'name'), p->>'icon', coalesce(p->>'iconColor', '#10b981'), p->>'description', me)
  returning id into v_server;

  insert into public.roles (id, server_id, name, color, hoist, position, permissions, is_default)
  select coalesce(nullif(x->>'id', '')::uuid, gen_random_uuid()), v_server, x->>'name', x->>'color',
    coalesce((x->>'hoist')::boolean, false), coalesce((x->>'position')::int, 0),
    array(select jsonb_array_elements_text(coalesce(x->'permissions', '[]')))::public.permission[],
    coalesce((x->>'isDefault')::boolean, false)
  from jsonb_array_elements(coalesce(p->'roles', '[]')) x;

  insert into public.server_members (server_id, user_id) values (v_server, me);
  insert into public.member_roles (server_id, user_id, role_id)
  select v_server, me, (x #>> '{}')::uuid from jsonb_array_elements(coalesce(p->'memberRoleIds', '[]')) x;

  insert into public.categories (id, server_id, name, position)
  select coalesce(nullif(x->>'id', '')::uuid, gen_random_uuid()), v_server, x->>'name', coalesce((x->>'position')::int, 0)
  from jsonb_array_elements(coalesce(p->'categories', '[]')) x;

  insert into public.channels (id, server_id, category_id, name, type, topic, position)
  select coalesce(nullif(x->>'id', '')::uuid, gen_random_uuid()), v_server, nullif(x->>'categoryId', '')::uuid, x->>'name',
    coalesce(x->>'type', 'text')::public.channel_type, x->>'topic', coalesce((x->>'position')::int, 0)
  from jsonb_array_elements(coalesce(p->'channels', '[]')) x;

  if v_system is not null then
    update public.servers set system_channel_id = v_system where id = v_server;
    insert into public.messages (id, channel_id, author_id, type)
    values (coalesce(nullif(p->>'joinMessageId', '')::uuid, gen_random_uuid()), v_system, me, 'join');
  end if;
  return v_server;
end;
$$;

/** Folgt einer Einladung. Gibt die Server-ID zurück, oder null, wenn der Code ungültig/abgelaufen/aufgebraucht ist. */
create function public.join_server_by_invite(p_code text) returns uuid
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
  select * into inv from public.invites i where i.code = lower(btrim(p_code)) for update;
  if not found
     or (inv.expires_at is not null and inv.expires_at <= now())
     or (inv.max_uses is not null and inv.uses >= inv.max_uses) then
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

/**
 * Ersetzt alle Überschreibungen eines Kanals oder einer Kategorie durch die
 * übergebene Liste ([{type, id, allow, deny}]). Läuft mit den Rechten der
 * aufrufenden Person – die RLS-Regeln (manageRoles) gelten also unverändert.
 */
create function public.replace_overwrites(p_server uuid, p_channel uuid, p_category uuid, p_list jsonb) returns void
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
  insert into public.permission_overwrites (server_id, channel_id, category_id, target_type, target_id, allow, deny)
  select p_server, p_channel, p_category, (x->>'type')::public.overwrite_target, (x->>'id')::uuid,
    array(select jsonb_array_elements_text(coalesce(x->'allow', '[]')))::public.permission[],
    array(select jsonb_array_elements_text(coalesce(x->'deny', '[]')))::public.permission[]
  from jsonb_array_elements(coalesce(p_list, '[]')) x
  on conflict (channel_id, category_id, target_type, target_id) do update set allow = excluded.allow, deny = excluded.deny;
end;
$$;

/* ------------------------------------------------------------------ */
/* Direktnachrichten                                                    */
/* ------------------------------------------------------------------ */

/**
 * Öffnet die 1:1-DM mit p_user (legt sie bei Bedarf an) und gibt ihre ID zurück.
 * Erlaubt unter Freunden oder bei einem gemeinsamen Server, nie bei Blockierung.
 */
create function public.open_dm(p_user uuid, p_id uuid default null) returns uuid
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
    if public.is_blocked_between(me, p_user) then
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

/** Gruppen-DM mit bis zu 9 Freunden. */
create function public.create_group_dm(p_id uuid, p_users uuid[]) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  v_others uuid[];
  v_id uuid;
begin
  if me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  v_others := array(select distinct u from unnest(p_users) u where u is not null and u <> me);
  if cardinality(v_others) < 1 or cardinality(v_others) > 9 then
    raise exception 'a group has 2 to 10 members' using errcode = '23514';
  end if;
  if exists (
    select 1 from unnest(v_others) u
    where not exists (
      select 1 from public.friendships f
      where f.status = 'accepted' and ((f.requester_id = me and f.addressee_id = u) or (f.requester_id = u and f.addressee_id = me))
    )
  ) then
    raise exception 'group members must be friends' using errcode = '42501';
  end if;
  insert into public.dm_channels (id, type, owner_id) values (coalesce(p_id, gen_random_uuid()), 'group', me) returning id into v_id;
  insert into public.dm_participants (dm_id, user_id) values (v_id, me);
  insert into public.dm_participants (dm_id, user_id) select v_id, u from unnest(v_others) u;
  return v_id;
end;
$$;

/* ------------------------------------------------------------------ */
/* Freunde                                                              */
/* ------------------------------------------------------------------ */

/**
 * Freundschaftsanfrage per Benutzername. Ergebnis: {status, user_id?, display_name?}
 * mit status = sent | accepted | not_found | self | already_friends | already_sent | unavailable.
 */
create function public.friend_request(p_username text) returns jsonb
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
  if public.is_blocked_between(me, v_target.id) then
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

create function public.friend_accept(p_user uuid) returns void
language sql security definer set search_path = ''
as $$
  update public.friendships set status = 'accepted', accepted_at = now()
  where requester_id = p_user and addressee_id = auth.uid() and status = 'pending'
$$;

/** Entfernt Freundschaft oder Anfrage (in beide Richtungen) und hebt eine eigene Blockierung auf. */
create function public.friend_remove(p_user uuid) returns void
language sql security definer set search_path = ''
as $$
  delete from public.friendships
  where (requester_id = auth.uid() and addressee_id = p_user) or (requester_id = p_user and addressee_id = auth.uid());
  delete from public.blocks where blocker_id = auth.uid() and blocked_id = p_user;
$$;

create function public.user_block(p_user uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or p_user is null or p_user = auth.uid() then
    raise exception 'invalid user' using errcode = '22023';
  end if;
  delete from public.friendships
  where (requester_id = auth.uid() and addressee_id = p_user) or (requester_id = p_user and addressee_id = auth.uid());
  insert into public.blocks (blocker_id, blocked_id) values (auth.uid(), p_user) on conflict do nothing;
end;
$$;

/* ------------------------------------------------------------------ */
/* Nachrichten laden                                                    */
/* ------------------------------------------------------------------ */

/**
 * Die letzten p_limit Nachrichten jedes sichtbaren Textkanals und jeder eigenen
 * DM, inklusive Reaktionen – ein Aufruf beim Start. Läuft mit den Rechten der
 * aufrufenden Person, RLS filtert also wie bei jeder anderen Abfrage.
 */
create function public.recent_messages(p_limit integer default 50)
returns table (
  id uuid, channel_id uuid, dm_id uuid, author_id uuid, type public.message_type, content text, created_at timestamptz,
  edited_at timestamptz, reply_to_id uuid, reply_mention boolean, attachments jsonb, embeds jsonb, pinned boolean, reactions jsonb
)
language sql stable security invoker set search_path = ''
as $$
  with lim as (select least(greatest(coalesce(p_limit, 50), 1), 100) as n)
  select m.id, m.channel_id, m.dm_id, m.author_id, m.type, m.content, m.created_at, m.edited_at, m.reply_to_id, m.reply_mention,
    m.attachments, m.embeds, m.pinned,
    coalesce((select jsonb_agg(jsonb_build_object('emoji', r.emoji, 'user_id', r.user_id) order by r.created_at) from public.reactions r where r.message_id = m.id), '[]')
  from public.channels c
  cross join lim
  cross join lateral (select * from public.messages x where x.channel_id = c.id order by x.created_at desc limit lim.n) m
  where c.type <> 'voice'
  union all
  select m.id, m.channel_id, m.dm_id, m.author_id, m.type, m.content, m.created_at, m.edited_at, m.reply_to_id, m.reply_mention,
    m.attachments, m.embeds, m.pinned,
    coalesce((select jsonb_agg(jsonb_build_object('emoji', r.emoji, 'user_id', r.user_id) order by r.created_at) from public.reactions r where r.message_id = m.id), '[]')
  from public.dm_participants p
  cross join lim
  cross join lateral (select * from public.messages x where x.dm_id = p.dm_id order by x.created_at desc limit lim.n) m
  where p.user_id = (select auth.uid())
$$;

/* ------------------------------------------------------------------ */
/* Ausführungsrechte                                                    */
/* ------------------------------------------------------------------ */
-- Standardmäßig dürfen alle (auch anon) jede Funktion aufrufen. Hier gilt:
-- nur angemeldete Nutzer, interne Funktionen gar nicht über die API.

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke execute on function public._scope_permissions(uuid, uuid, uuid, boolean, uuid) from authenticated;
revoke execute on function public.is_blocked_between(uuid, uuid) from authenticated;
revoke execute on function public.handle_new_user() from authenticated;
grant execute on function public.username_available(text) to anon;

/* ------------------------------------------------------------------ */
/* Realtime                                                             */
/* ------------------------------------------------------------------ */
-- Neue/bearbeitete Nachrichten, Reaktionen, Freundschaften und Änderungen an der
-- Serverstruktur kommen live. Realtime wendet dabei dieselben RLS-Regeln an.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.messages, public.reactions, public.friendships, public.blocks, public.dm_participants, public.dm_channels,
      public.servers, public.server_members, public.member_roles, public.roles, public.categories, public.channels,
      public.permission_overwrites, public.invites, public.server_badges, public.member_badges;
  end if;
end;
$$;
