-- ONYX – Web-Push: Benachrichtigungen, wenn kein ONYX-Tab offen ist
--
-- Ablauf: neue Nachricht → Trigger → pg_net → Edge Function „push“ → dieselben
-- Regeln wie in der App (src/lib/notifyRules.ts) → verschlüsselter Push
-- (RFC 8291/8292) an jedes Gerät, das Push eingeschaltet hat.
--
-- push_subscriptions: ein Abo pro Browser, nur die eigenen Zeilen sichtbar.
-- private.push_config: VAPID-Schlüsselpaar und Dispatch-Geheimnis. Die Edge
-- Function erzeugt das Schlüsselpaar beim ersten Aufruf selbst und legt es hier
-- ab – der private Schlüssel verlässt den Server nie. Die Funktionen
-- push_config/push_prepare/push_cleanup darf nur service_role ausführen.

create extension if not exists pg_net with schema extensions;

/* ------------------------------------------------------------------ */
/* Abos pro Gerät                                                       */
/* ------------------------------------------------------------------ */

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  -- Sprache und Vorlieben dieses Geräts für den Text im Hinweis
  lang text not null default 'en',
  preview boolean not null default true,
  sound boolean not null default true,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  constraint push_subscriptions_endpoint check (endpoint ~ '^https://' and char_length(endpoint) <= 1024),
  constraint push_subscriptions_keys check (p256dh ~ '^[A-Za-z0-9_-]{80,100}={0,2}$' and auth ~ '^[A-Za-z0-9_-]{16,32}={0,2}$'),
  constraint push_subscriptions_lang check (lang ~ '^[a-z]{2}(-[A-Z]{2})?$')
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from anon, authenticated;
-- Anlegen nur über push_subscribe(); ändern dürfen Nutzer nur Sprache und Vorlieben.
grant select, delete on public.push_subscriptions to authenticated;
grant update (lang, preview, sound) on public.push_subscriptions to authenticated;

create policy "push_subscriptions: nur eigene" on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

/** Push auf diesem Gerät einschalten. Ein Browser gehört dem Konto, das dort gerade angemeldet ist. */
create function public.push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_lang text, p_preview boolean, p_sound boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  perform private.hit_rate_limit('push_subscribe', 30, interval '1 hour');
  delete from public.push_subscriptions s where s.endpoint = p_endpoint and s.user_id <> v_user;
  -- Höchstens 20 Geräte: das am längsten unbenutzte fällt weg.
  delete from public.push_subscriptions s
    where s.id in (
      select x.id from public.push_subscriptions x
      where x.user_id = v_user and x.endpoint <> p_endpoint
      order by coalesce(x.last_used_at, x.created_at) desc
      offset 19
    );
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, lang, preview, sound)
  values (v_user, p_endpoint, p_p256dh, p_auth, coalesce(p_lang, 'en'), coalesce(p_preview, true), coalesce(p_sound, true))
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh, auth = excluded.auth, lang = excluded.lang, preview = excluded.preview, sound = excluded.sound;
end;
$$;

revoke all on function public.push_subscribe(text, text, text, text, boolean, boolean) from public, anon;
grant execute on function public.push_subscribe(text, text, text, text, boolean, boolean) to authenticated;

/* ------------------------------------------------------------------ */
/* Schlüssel und Geheimnis (nur Server)                                 */
/* ------------------------------------------------------------------ */

create table private.push_config (
  id boolean primary key default true check (id),
  vapid_public text not null,
  vapid_private jsonb not null,
  dispatch_url text not null,
  dispatch_secret text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  created_at timestamptz not null default now()
);

alter table private.push_config enable row level security;
revoke all on table private.push_config from public, anon, authenticated;

/** Edge Function: Konfiguration lesen bzw. beim ersten Mal anlegen (gleichzeitige Aufrufe: der erste gewinnt). */
create function public.push_config(p_init jsonb default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if p_init is not null then
    insert into private.push_config (vapid_public, vapid_private, dispatch_url)
    values (p_init->>'public', p_init->'private', p_init->>'url')
    on conflict (id) do nothing;
  end if;
  return (select jsonb_build_object('public', c.vapid_public, 'private', c.vapid_private, 'secret', c.dispatch_secret) from private.push_config c);
end;
$$;

/* ------------------------------------------------------------------ */
/* Was die Edge Function für eine Nachricht braucht                     */
/* ------------------------------------------------------------------ */

/** Nachricht, Ort, Namen und alle Empfänger mit Push-Abo samt allem, was die Regeln brauchen. */
create function public.push_prepare(p_message uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  m public.messages;
  v_server uuid;
  v_category uuid;
  v_voice boolean;
  v_place jsonb;
  v_author jsonb;
  v_reply_author uuid;
  v_everyone boolean := false;
  v_names jsonb;
  v_candidates jsonb;
begin
  select * into m from public.messages where id = p_message;
  if not found or m.author_id is null then
    return null;
  end if;
  if m.reply_to_id is not null then
    select r.author_id into v_reply_author from public.messages r where r.id = m.reply_to_id;
  end if;

  if m.channel_id is not null then
    select c.server_id, c.category_id, c.type = 'voice', jsonb_build_object('server', s.name, 'channel', c.name)
      into v_server, v_category, v_voice, v_place
      from public.channels c join public.servers s on s.id = c.server_id where c.id = m.channel_id;
    v_everyone := 'mentionEveryone' = any (private._scope_permissions(v_server, m.channel_id, v_category, v_voice, m.author_id));
    select jsonb_build_object('name', coalesce(sm.nickname, p.display_name), 'avatar', p.avatar)
      into v_author from public.profiles p left join public.server_members sm on sm.server_id = v_server and sm.user_id = p.id
      where p.id = m.author_id;

    select coalesce(jsonb_agg(x), '[]') into v_candidates from (
      select u.user_id,
        p.status,
        'viewChannel' = any (private._scope_permissions(v_server, m.channel_id, v_category, v_voice, u.user_id)) as can_view,
        exists (select 1 from public.blocks b where b.blocker_id = u.user_id and b.blocked_id = m.author_id) as blocked,
        coalesce((select jsonb_agg(mr.role_id) from public.member_roles mr where mr.server_id = v_server and mr.user_id = u.user_id), '[]') as roles,
        coalesce((select jsonb_object_agg(n.scope_id, to_jsonb(n) - 'user_id' - 'scope_id' - 'updated_at') from public.notification_settings n
          where n.user_id = u.user_id and n.scope_id in (v_server, m.channel_id, u.user_id)), '{}') as prefs,
        (select jsonb_agg(jsonb_build_object('endpoint', ps.endpoint, 'p256dh', ps.p256dh, 'auth', ps.auth, 'lang', ps.lang, 'preview', ps.preview, 'sound', ps.sound))
          from public.push_subscriptions ps where ps.user_id = u.user_id) as subscriptions
      from (select distinct sm.user_id from public.server_members sm join public.push_subscriptions ps on ps.user_id = sm.user_id
            where sm.server_id = v_server and sm.user_id <> m.author_id) u
      join public.profiles p on p.id = u.user_id
    ) x;
  else
    select jsonb_build_object('type', d.type, 'name', d.name, 'participants',
        (select jsonb_agg(jsonb_build_object('id', pp.id, 'name', pp.display_name)) from public.dm_participants dp join public.profiles pp on pp.id = dp.user_id where dp.dm_id = d.id))
      into v_place from public.dm_channels d where d.id = m.dm_id;
    select jsonb_build_object('name', p.display_name, 'avatar', p.avatar) into v_author from public.profiles p where p.id = m.author_id;

    select coalesce(jsonb_agg(x), '[]') into v_candidates from (
      select u.user_id,
        p.status,
        true as can_view,
        exists (select 1 from public.blocks b where b.blocker_id = u.user_id and b.blocked_id = m.author_id) as blocked,
        '[]'::jsonb as roles,
        coalesce((select jsonb_object_agg(n.scope_id, to_jsonb(n) - 'user_id' - 'scope_id' - 'updated_at') from public.notification_settings n
          where n.user_id = u.user_id and n.scope_id in (m.dm_id, u.user_id)), '{}') as prefs,
        (select jsonb_agg(jsonb_build_object('endpoint', ps.endpoint, 'p256dh', ps.p256dh, 'auth', ps.auth, 'lang', ps.lang, 'preview', ps.preview, 'sound', ps.sound))
          from public.push_subscriptions ps where ps.user_id = u.user_id) as subscriptions
      from (select distinct dp.user_id from public.dm_participants dp join public.push_subscriptions ps on ps.user_id = dp.user_id
            where dp.dm_id = m.dm_id and dp.user_id <> m.author_id) u
      join public.profiles p on p.id = u.user_id
    ) x;
  end if;

  -- Namen für <@id> und <@&id> im Text (Kanalnamen bleiben weg: sie könnten privat sein).
  select jsonb_build_object(
    'users', coalesce((select jsonb_object_agg(p.id, coalesce(sm.nickname, p.display_name)) from public.profiles p
      left join public.server_members sm on sm.server_id = v_server and sm.user_id = p.id
      where p.id::text in (select (regexp_matches(m.content, '<@([0-9a-f-]{36})>', 'g'))[1])), '{}'),
    'roles', coalesce((select jsonb_object_agg(r.id, r.name) from public.roles r
      where r.server_id = v_server and r.id::text in (select (regexp_matches(m.content, '<@&([0-9a-f-]{36})>', 'g'))[1])), '{}')
  ) into v_names;

  return jsonb_build_object(
    'message', jsonb_build_object('id', m.id, 'type', m.type, 'author_id', m.author_id, 'content', m.content, 'reply_mention', m.reply_mention,
      'reply_to_author_id', v_reply_author, 'attachments', m.attachments, 'created_at', m.created_at, 'channel_id', m.channel_id, 'dm_id', m.dm_id,
      'server_id', v_server),
    'author', v_author,
    'place', v_place,
    'names', v_names,
    'author_can_mention_everyone', v_everyone,
    'candidates', v_candidates
  );
end;
$$;

/** Abgelaufene Abos löschen, benutzte markieren. */
create function public.push_cleanup(p_gone text[], p_used text[]) returns void
language sql security definer set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = any (p_gone);
  update public.push_subscriptions set last_used_at = now() where endpoint = any (p_used);
$$;

revoke all on function public.push_config(jsonb) from public, anon, authenticated;
revoke all on function public.push_prepare(uuid) from public, anon, authenticated;
revoke all on function public.push_cleanup(text[], text[]) from public, anon, authenticated;
grant execute on function public.push_config(jsonb) to service_role;
grant execute on function public.push_prepare(uuid) to service_role;
grant execute on function public.push_cleanup(text[], text[]) to service_role;

/* ------------------------------------------------------------------ */
/* Neue Nachricht → Edge Function                                       */
/* ------------------------------------------------------------------ */

create function private.messages_push_dispatch() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  -- Systemnachrichten (Beitritt, Anheften, Anruf) lösen nie einen Hinweis aus.
  if new.type <> 'default' or new.author_id is null then
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

create trigger messages_push_dispatch after insert on public.messages
  for each row execute function private.messages_push_dispatch();

revoke all on function private.messages_push_dispatch() from public, anon, authenticated;
