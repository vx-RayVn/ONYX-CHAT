-- ONYX Phase 5 – Codes, ONYX Plus (Demo) und Abzeichen auf dem Server
--
-- • Codes stehen im nicht veröffentlichten Schema "private" – niemand kann sie
--   auflisten; einlösen nur über redeem_code() (mit Limit gegen Durchprobieren).
-- • ONYX Plus bleibt ein klar gekennzeichneter Demo-Kauf OHNE Zahlung, wird aber
--   vom Server gesetzt (plus_since ist für Clients schreibgeschützt).
-- • Event-Abzeichen: eine Nachricht während des Event-Zeitraums.
-- • Ziel-Abzeichen: "Regular" (500 Nachrichten), "Community Builder"
--   (25 Personen über eigene Einladungen).

/* ------------------------------------------------------------------ */
/* Abzeichen vergeben                                                   */
/* ------------------------------------------------------------------ */

/** Vergibt ein Abzeichen und zeigt es im Profil (max. 10). true, wenn es neu ist. */
create function private.grant_badge(p_user uuid, p_badge text) returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.user_badges (user_id, badge) values (p_user, p_badge) on conflict do nothing;
  if not found then
    return false;
  end if;
  update public.profiles set badges = badges || p_badge
  where id = p_user and not (p_badge = any (badges)) and cardinality(badges) < 10;
  return true;
end;
$$;

-- Live-Benachrichtigung über neu verdiente Abzeichen (die App filtert auf das eigene Konto).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.user_badges;
  end if;
end;
$$;

/* ------------------------------------------------------------------ */
/* Codes                                                                */
/* ------------------------------------------------------------------ */

create table private.promo_codes (
  code text primary key,
  title text not null,
  description text not null,
  rewards jsonb not null,
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  max_redemptions integer
);

revoke all on table private.promo_codes from public, anon, authenticated;

-- Titel und Beschreibung sind die englischen Texte; die App übersetzt sie.
insert into private.promo_codes (code, title, description, rewards)
values ('ONYX-ORIGIN', 'ONYX OG', 'A free thank-you for everyone who found ONYX through our first videos and the launch phase.', '[{"kind":"badge","id":"onyx-og"}]')
on conflict (code) do nothing;

create table public.code_redemptions (
  user_id uuid not null references public.profiles (id) on delete cascade,
  code text not null,
  redeemed_at timestamptz not null default now(),
  rewards jsonb not null,
  primary key (user_id, code)
);

alter table public.code_redemptions enable row level security;
revoke all on table public.code_redemptions from anon, authenticated;
grant select on public.code_redemptions to authenticated;
create policy "code_redemptions: eigene sehen" on public.code_redemptions for select to authenticated using (user_id = (select auth.uid()));

/** Wie normalizeCode() in src/data/codes.ts. */
create function private.normalize_code(p text) returns text
language sql immutable set search_path = ''
as $$
  select regexp_replace(regexp_replace(regexp_replace(regexp_replace(upper(btrim(coalesce(p, ''))), '[\s_]+', '-', 'g'), '[^A-Z0-9-]', '', 'g'), '-+', '-', 'g'), '^-|-$', '', 'g')
$$;

/**
 * Löst einen Code ein. Ergebnis wie RedeemResult in der App:
 * {status: 'success', code, title, description, rewards} | {status: 'invalid'} | {status: 'redeemed', code, at, rewards}
 */
create function public.redeem_code(p_code text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  v_code text := private.normalize_code(p_code);
  v_promo private.promo_codes;
  v_prev public.code_redemptions;
  r jsonb;
begin
  if me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if (select count(*) from private.rate_events e where e.user_id = me and e.kind = 'code_fail' and e.at > now() - interval '10 minutes') >= 10 then
    raise exception 'rate limited: code_fail' using errcode = 'P0001';
  end if;
  select * into v_promo from private.promo_codes c
  where c.code = v_code and c.active and (c.starts_at is null or now() >= c.starts_at) and (c.ends_at is null or now() <= c.ends_at);
  if not found then
    insert into private.rate_events (user_id, kind) values (me, 'code_fail');
    return jsonb_build_object('status', 'invalid');
  end if;
  select * into v_prev from public.code_redemptions x where x.user_id = me and x.code = v_code;
  if found then
    return jsonb_build_object('status', 'redeemed', 'code', v_code, 'at', v_prev.redeemed_at, 'rewards', v_prev.rewards);
  end if;
  if v_promo.max_redemptions is not null and (select count(*) from public.code_redemptions x where x.code = v_code) >= v_promo.max_redemptions then
    return jsonb_build_object('status', 'invalid');
  end if;
  insert into public.code_redemptions (user_id, code, rewards) values (me, v_code, v_promo.rewards);
  for r in select * from jsonb_array_elements(v_promo.rewards) loop
    if r->>'kind' = 'badge' then
      perform private.grant_badge(me, r->>'id');
    end if;
  end loop;
  return jsonb_build_object('status', 'success', 'code', v_code, 'title', v_promo.title, 'description', v_promo.description, 'rewards', v_promo.rewards);
end;
$$;

/* ------------------------------------------------------------------ */
/* ONYX Plus – Demo ohne Zahlung                                        */
/* ------------------------------------------------------------------ */

/** Demo-Kauf: setzt den Plus-Status serverseitig. Es wird NICHTS bezahlt. */
create function public.plus_demo_purchase() returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare
  v_since timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  update public.profiles set plus_since = coalesce(plus_since, now()) where id = auth.uid() returning plus_since into v_since;
  perform private.grant_badge(auth.uid(), 'supporter');
  return v_since;
end;
$$;

/** Macht den Demo-Kauf rückgängig (zum erneuten Ausprobieren). */
create function public.plus_demo_reset() returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  delete from public.user_badges where user_id = auth.uid() and badge = 'supporter';
  update public.profiles set plus_since = null, supporter_wall = false, badges = array_remove(badges, 'supporter') where id = auth.uid();
end;
$$;

/* ------------------------------------------------------------------ */
/* Event- und Ziel-Abzeichen                                            */
/* ------------------------------------------------------------------ */

-- Zeiträume wie EVENTS in src/data/cosmetics.ts (ganztägig, deutsche Zeit).
create table private.badge_events (
  badge text primary key,
  starts_at timestamptz not null,
  ends_at timestamptz not null
);

revoke all on table private.badge_events from public, anon, authenticated;

insert into private.badge_events (badge, starts_at, ends_at) values
  ('halloween-2026', '2026-10-15 00:00:00 Europe/Berlin', '2026-11-02 23:59:59 Europe/Berlin'),
  ('winter-2026', '2026-12-01 00:00:00 Europe/Berlin', '2027-01-06 23:59:59 Europe/Berlin'),
  ('summer-2027', '2027-06-21 00:00:00 Europe/Berlin', '2027-08-31 23:59:59 Europe/Berlin')
on conflict (badge) do nothing;

create table private.user_stats (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  messages integer not null default 0
);

create table private.invite_joins (
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  joiner_id uuid not null references public.profiles (id) on delete cascade,
  primary key (inviter_id, joiner_id)
);

create index invite_joins_joiner_idx on private.invite_joins (joiner_id);
revoke all on table private.user_stats, private.invite_joins from public, anon, authenticated;

/** Nach jeder eigenen Nachricht: Event-Abzeichen und "Regular" (500 Nachrichten). */
create function private.messages_award_badges() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_count integer;
  e record;
begin
  if new.type <> 'default' or new.author_id is null then
    return null;
  end if;
  for e in select b.badge from private.badge_events b where now() between b.starts_at and b.ends_at loop
    perform private.grant_badge(new.author_id, e.badge);
  end loop;
  insert into private.user_stats (user_id, messages) values (new.author_id, 1)
  on conflict (user_id) do update set messages = private.user_stats.messages + 1
  returning messages into v_count;
  if v_count >= 500 then
    perform private.grant_badge(new.author_id, 'regular');
  end if;
  return null;
end;
$$;

create trigger messages_award_badges after insert on public.messages for each row execute function private.messages_award_badges();

-- Einladungen: wer über die Einladung einer Person beitritt, zählt für ihr "Community Builder"-Abzeichen.
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
  if inv.inviter_id is not null and inv.inviter_id <> me then
    insert into private.invite_joins (inviter_id, joiner_id) values (inv.inviter_id, me) on conflict do nothing;
    if found and (select count(*) from private.invite_joins j where j.inviter_id = inv.inviter_id) >= 25 then
      perform private.grant_badge(inv.inviter_id, 'community-builder');
    end if;
  end if;
  return inv.server_id;
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
revoke execute on function private.grant_badge(uuid, text) from authenticated;

revoke execute on function public.redeem_code(text), public.plus_demo_purchase(), public.plus_demo_reset() from public, anon;
grant execute on function public.redeem_code(text), public.plus_demo_purchase(), public.plus_demo_reset() to authenticated;
