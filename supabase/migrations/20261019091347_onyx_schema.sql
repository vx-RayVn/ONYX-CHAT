-- ONYX Phase 1 – Datenmodell
--
-- Spiegelt src/types.ts. IDs sind UUIDs (der Client erzeugt sie selbst, damit
-- optimistische Einträge sofort ihre endgültige ID haben), Zeiten sind
-- timestamptz (die App rechnet in Epoch-Millisekunden).
--
-- Bilder sind in Phase 1 noch verkleinerte Data-URLs mit Größenlimit; Phase 2
-- ersetzt sie durch Supabase Storage.

/* ------------------------------------------------------------------ */
/* Typen                                                                */
/* ------------------------------------------------------------------ */

create type public.permission as enum (
  'administrator',
  'viewChannel',
  'manageServer',
  'manageChannels',
  'manageRoles',
  'manageBadges',
  'kickMembers',
  'banMembers',
  'createInvites',
  'sendMessages',
  'readHistory',
  'attachFiles',
  'sendVoiceMessages',
  'addReactions',
  'mentionEveryone',
  'manageMessages',
  'connect',
  'speak',
  'video',
  'muteMembers'
);

create type public.channel_type as enum ('text', 'voice', 'announcement');
create type public.message_type as enum ('default', 'join', 'pin', 'call');
create type public.presence_status as enum ('online', 'idle', 'dnd', 'offline');
create type public.overwrite_target as enum ('role', 'member');
create type public.dm_type as enum ('dm', 'group');

/** Nur eingebettete Bilder (data:image/…) – keine fremden URLs, die Besucher verfolgen könnten. */
create function public.is_inline_image(p text) returns boolean
language sql immutable set search_path = ''
as $$ select p is null or p like 'data:image/%' $$;

create function public.is_inline_image_source(p jsonb) returns boolean
language sql immutable set search_path = ''
as $$
  select p is null
    or p->>'kind' is distinct from 'image'
    or (public.is_inline_image(p->>'src') and public.is_inline_image(p->>'poster'))
$$;

/* ------------------------------------------------------------------ */
/* Profile                                                              */
/* ------------------------------------------------------------------ */

create sequence public.member_number_seq;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  display_name text not null,
  avatar jsonb,
  avatar_color text not null default '#64748b',
  banner jsonb,
  bio text,
  pronouns text,
  status public.presence_status not null default 'online',
  custom_status jsonb,
  -- Angezeigte offizielle Abzeichen (Reihenfolge = Anzeige); nur verdiente, siehe user_badges.
  badges text[] not null default '{}',
  profile_colors text[],
  avatar_decoration text,
  profile_frame text,
  profile_effect text,
  name_style jsonb,
  border_line jsonb,
  member_number bigint not null unique default nextval('public.member_number_seq'),
  country text,
  plus_since timestamptz,
  supporter_wall boolean not null default false,
  created_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-z0-9_.]{2,32}$'),
  constraint profiles_display_name_length check (char_length(btrim(display_name)) between 1 and 32),
  constraint profiles_bio_length check (bio is null or char_length(bio) <= 300),
  constraint profiles_pronouns_length check (pronouns is null or char_length(pronouns) <= 40),
  constraint profiles_country_format check (country is null or country ~ '^[A-Z]{2}$'),
  constraint profiles_badges_count check (cardinality(badges) <= 10),
  constraint profiles_avatar_inline check (public.is_inline_image_source(avatar)),
  constraint profiles_banner_inline check (public.is_inline_image_source(banner)),
  constraint profiles_avatar_size check (avatar is null or octet_length(avatar::text) <= 400000),
  constraint profiles_banner_size check (banner is null or octet_length(banner::text) <= 700000),
  constraint profiles_supporter_wall_plus check (not supporter_wall or plus_since is not null)
);

alter sequence public.member_number_seq owned by public.profiles.member_number;
create unique index profiles_username_key on public.profiles (lower(username));

-- Verdiente offizielle Abzeichen. Werden nur serverseitig vergeben (kein Client-Schreibrecht).
create table public.user_badges (
  user_id uuid not null references public.profiles (id) on delete cascade,
  badge text not null,
  earned_at timestamptz not null default now(),
  primary key (user_id, badge)
);

/* ------------------------------------------------------------------ */
/* Server, Rollen, Mitglieder                                           */
/* ------------------------------------------------------------------ */

create table public.servers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  icon text,
  icon_color text not null default '#10b981',
  banner jsonb,
  description text,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  verified boolean not null default false,
  system_channel_id uuid,
  created_at timestamptz not null default now(),
  constraint servers_name_length check (char_length(btrim(name)) between 1 and 100),
  constraint servers_description_length check (description is null or char_length(description) <= 300),
  constraint servers_icon_inline check (public.is_inline_image(icon)),
  constraint servers_icon_size check (icon is null or octet_length(icon) <= 400000),
  constraint servers_banner_inline check (public.is_inline_image_source(banner)),
  constraint servers_banner_size check (banner is null or octet_length(banner::text) <= 700000)
);

create index servers_owner_idx on public.servers (owner_id);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers (id) on delete cascade,
  name text not null,
  color text,
  hoist boolean not null default false,
  position integer not null default 0,
  permissions public.permission[] not null default '{}',
  -- Die implizite Rolle @everyone (genau eine pro Server).
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  constraint roles_name_length check (char_length(btrim(name)) between 1 and 100),
  unique (id, server_id)
);

create unique index roles_one_default_per_server on public.roles (server_id) where is_default;
create index roles_server_idx on public.roles (server_id);

create table public.server_members (
  server_id uuid not null references public.servers (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  nickname text,
  joined_at timestamptz not null default now(),
  primary key (server_id, user_id),
  constraint server_members_nickname_length check (nickname is null or char_length(btrim(nickname)) between 1 and 32)
);

create index server_members_user_idx on public.server_members (user_id);

-- Rollen eines Mitglieds (ohne @everyone, die gilt immer).
create table public.member_roles (
  server_id uuid not null,
  user_id uuid not null,
  role_id uuid not null,
  primary key (server_id, user_id, role_id),
  foreign key (server_id, user_id) references public.server_members (server_id, user_id) on delete cascade,
  foreign key (role_id, server_id) references public.roles (id, server_id) on delete cascade
);

create index member_roles_role_idx on public.member_roles (role_id);

/* ------------------------------------------------------------------ */
/* Kategorien, Kanäle, Berechtigungs-Überschreibungen                   */
/* ------------------------------------------------------------------ */

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers (id) on delete cascade,
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  constraint categories_name_length check (char_length(btrim(name)) between 1 and 100),
  unique (id, server_id)
);

create index categories_server_idx on public.categories (server_id);

create table public.channels (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers (id) on delete cascade,
  category_id uuid,
  name text not null,
  type public.channel_type not null default 'text',
  topic text,
  position integer not null default 0,
  slowmode integer,
  age_restricted boolean not null default false,
  user_limit integer,
  created_at timestamptz not null default now(),
  constraint channels_name_length check (char_length(btrim(name)) between 1 and 100),
  constraint channels_topic_length check (topic is null or char_length(topic) <= 1024),
  constraint channels_slowmode_range check (slowmode is null or slowmode between 0 and 21600),
  constraint channels_user_limit_range check (user_limit is null or user_limit between 0 and 99),
  unique (id, server_id),
  foreign key (category_id, server_id) references public.categories (id, server_id) on delete set null (category_id)
);

create index channels_server_idx on public.channels (server_id);

alter table public.servers
  add constraint servers_system_channel_fk foreign key (system_channel_id, id) references public.channels (id, server_id) on delete set null (system_channel_id);

-- Wie Channel.overwrites / Category.overwrites: entweder ein Kanal oder eine Kategorie.
create table public.permission_overwrites (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers (id) on delete cascade,
  channel_id uuid,
  category_id uuid,
  target_type public.overwrite_target not null,
  -- Rollen-ID oder Nutzer-ID
  target_id uuid not null,
  allow public.permission[] not null default '{}',
  deny public.permission[] not null default '{}',
  constraint overwrites_one_scope check ((channel_id is null) <> (category_id is null)),
  constraint overwrites_unique_target unique nulls not distinct (channel_id, category_id, target_type, target_id),
  foreign key (channel_id, server_id) references public.channels (id, server_id) on delete cascade,
  foreign key (category_id, server_id) references public.categories (id, server_id) on delete cascade
);

create index overwrites_channel_idx on public.permission_overwrites (channel_id) where channel_id is not null;
create index overwrites_category_idx on public.permission_overwrites (category_id) where category_id is not null;
create index overwrites_server_idx on public.permission_overwrites (server_id);

create table public.invites (
  code text primary key,
  server_id uuid not null references public.servers (id) on delete cascade,
  channel_id uuid,
  inviter_id uuid references public.profiles (id) on delete set null,
  uses integer not null default 0,
  max_uses integer,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invites_code_format check (code ~ '^[a-z0-9-]{4,32}$'),
  constraint invites_max_uses_positive check (max_uses is null or max_uses > 0),
  foreign key (channel_id, server_id) references public.channels (id, server_id) on delete set null (channel_id)
);

create index invites_server_idx on public.invites (server_id);

/* ------------------------------------------------------------------ */
/* Server-Abzeichen                                                     */
/* ------------------------------------------------------------------ */

create table public.server_badges (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers (id) on delete cascade,
  name text not null,
  image text not null,
  description text,
  created_at timestamptz not null default now(),
  constraint server_badges_name_length check (char_length(btrim(name)) between 1 and 32),
  constraint server_badges_description_length check (description is null or char_length(description) <= 120),
  constraint server_badges_image_inline check (image like 'data:image/%'),
  constraint server_badges_image_size check (octet_length(image) <= 150000),
  unique (id, server_id)
);

create index server_badges_server_idx on public.server_badges (server_id);

create table public.member_badges (
  server_id uuid not null,
  user_id uuid not null,
  badge_id uuid not null,
  awarded_at timestamptz not null default now(),
  primary key (server_id, user_id, badge_id),
  foreign key (server_id, user_id) references public.server_members (server_id, user_id) on delete cascade,
  foreign key (badge_id, server_id) references public.server_badges (id, server_id) on delete cascade
);

/* ------------------------------------------------------------------ */
/* Direktnachrichten                                                    */
/* ------------------------------------------------------------------ */

create table public.dm_channels (
  id uuid primary key default gen_random_uuid(),
  type public.dm_type not null,
  name text,
  icon text,
  owner_id uuid references public.profiles (id) on delete set null,
  -- Für 1:1-DMs: "<kleinere-uuid>:<größere-uuid>", damit es pro Paar nur eine gibt.
  dm_key text unique,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint dm_channels_key check ((type = 'dm') = (dm_key is not null)),
  constraint dm_channels_name_length check (name is null or char_length(btrim(name)) between 1 and 100),
  constraint dm_channels_icon_inline check (public.is_inline_image(icon)),
  constraint dm_channels_icon_size check (icon is null or octet_length(icon) <= 400000)
);

create table public.dm_participants (
  dm_id uuid not null references public.dm_channels (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- "DM schließen" gilt nur für diese Person.
  hidden boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (dm_id, user_id)
);

create index dm_participants_user_idx on public.dm_participants (user_id);

/* ------------------------------------------------------------------ */
/* Nachrichten und Reaktionen                                           */
/* ------------------------------------------------------------------ */

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  -- Genau eins von beiden: Serverkanal oder DM/Gruppe.
  channel_id uuid references public.channels (id) on delete cascade,
  dm_id uuid references public.dm_channels (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  type public.message_type not null default 'default',
  content text not null default '',
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  reply_to_id uuid,
  reply_mention boolean not null default false,
  attachments jsonb not null default '[]',
  embeds jsonb not null default '[]',
  pinned boolean not null default false,
  constraint messages_one_target check ((channel_id is null) <> (dm_id is null)),
  constraint messages_content_length check (char_length(content) <= 4000),
  constraint messages_attachments_array check (jsonb_typeof(attachments) = 'array'),
  constraint messages_embeds_array check (jsonb_typeof(embeds) = 'array'),
  -- Phase 1: Dateien und Sprachnachrichten brauchen Storage (Phase 2). Diese Regel fällt dann weg.
  constraint messages_no_attachments_yet check (jsonb_array_length(attachments) = 0)
);

create index messages_channel_created_idx on public.messages (channel_id, created_at desc) where channel_id is not null;
create index messages_dm_created_idx on public.messages (dm_id, created_at desc) where dm_id is not null;
create index messages_author_idx on public.messages (author_id);

create table public.reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null,
  -- Vom Trigger aus der Nachricht übernommen (für RLS und Realtime-Filter).
  channel_id uuid,
  dm_id uuid,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji),
  constraint reactions_emoji_length check (char_length(emoji) between 1 and 100)
);

create index reactions_channel_idx on public.reactions (channel_id) where channel_id is not null;
create index reactions_dm_idx on public.reactions (dm_id) where dm_id is not null;
create index reactions_user_idx on public.reactions (user_id);

/* ------------------------------------------------------------------ */
/* Freundschaften und Blockierungen                                     */
/* ------------------------------------------------------------------ */

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  constraint friendships_status check (status in ('pending', 'accepted')),
  constraint friendships_not_self check (requester_id <> addressee_id)
);

create unique index friendships_pair_key on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index friendships_addressee_idx on public.friendships (addressee_id);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);

create index blocks_blocked_idx on public.blocks (blocked_id);

/* ------------------------------------------------------------------ */
/* Trigger                                                              */
/* ------------------------------------------------------------------ */

-- Neues Konto → Profil mit Benutzername aus der Registrierung, Mitgliedsnummer und "First N"-Abzeichen.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_username text := regexp_replace(lower(coalesce(new.raw_user_meta_data->>'username', '')), '[^a-z0-9_.]', '', 'g');
  v_display text := btrim(coalesce(new.raw_user_meta_data->>'display_name', ''));
  v_country text := upper(coalesce(new.raw_user_meta_data->>'country', ''));
  v_colors constant text[] := array['#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#ef4444', '#14b8a6', '#64748b'];
  v_number bigint;
  v_earned text[] := '{}';
  v_shown text[] := '{}';
begin
  v_username := left(v_username, 32);
  if char_length(v_username) < 2 then
    v_username := 'user' || substr(replace(new.id::text, '-', ''), 1, 6);
  end if;
  -- Falls der Name inzwischen vergeben ist (gleichzeitige Registrierung): eindeutig machen.
  if exists (select 1 from public.profiles p where lower(p.username) = v_username) then
    v_username := left(v_username, 27) || '_' || substr(replace(new.id::text, '-', ''), 1, 4);
  end if;
  v_display := left(coalesce(nullif(v_display, ''), v_username), 32);
  if v_country !~ '^[A-Z]{2}$' then
    v_country := null;
  end if;

  insert into public.profiles (id, username, display_name, country, avatar_color)
  values (new.id, v_username, v_display, v_country, v_colors[1 + floor(random() * array_length(v_colors, 1))::int])
  returning member_number into v_number;

  if v_number <= 100 then v_earned := v_earned || 'first-100'::text; end if;
  if v_number <= 1000 then v_earned := v_earned || 'first-1000'::text; end if;
  if v_number <= 10000 then v_earned := v_earned || 'first-10000'::text; end if;
  if cardinality(v_earned) > 0 then
    insert into public.user_badges (user_id, badge) select new.id, unnest(v_earned);
    -- Angezeigt wird nur das seltenste.
    v_shown := v_earned[1:1];
    update public.profiles set badges = v_shown where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Angezeigte Abzeichen müssen verdient sein.
create function public.profiles_check_badges() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.badges is distinct from old.badges
     and exists (
       select 1 from unnest(new.badges) b
       where not exists (select 1 from public.user_badges ub where ub.user_id = new.id and ub.badge = b)
     ) then
    raise exception 'badge not earned' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_check_badges
  before update of badges on public.profiles
  for each row execute function public.profiles_check_badges();

-- @everyone bleibt @everyone: nicht umbenennen, nicht umwandeln.
create function public.roles_guard() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if old.is_default and (new.name is distinct from old.name or not new.is_default) then
    raise exception 'the @everyone role cannot be renamed' using errcode = '42501';
  end if;
  if new.is_default and not old.is_default then
    raise exception 'only one @everyone role per server' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger roles_guard before update on public.roles for each row execute function public.roles_guard();

-- Gelöschte Rolle → ihre Überschreibungen verschwinden mit.
create function public.roles_drop_overwrites() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.permission_overwrites o where o.target_type = 'role' and o.target_id = old.id;
  return old;
end;
$$;

create trigger roles_drop_overwrites after delete on public.roles for each row execute function public.roles_drop_overwrites();

-- Mitglied entfernt → Mitglieds-Überschreibungen dieses Servers verschwinden mit.
create function public.members_drop_overwrites() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.permission_overwrites o where o.server_id = old.server_id and o.target_type = 'member' and o.target_id = old.user_id;
  return old;
end;
$$;

create trigger members_drop_overwrites after delete on public.server_members for each row execute function public.members_drop_overwrites();

-- @everyone wird nie als Mitgliederrolle gespeichert.
create function public.member_roles_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.roles r where r.id = new.role_id and r.is_default) then
    raise exception 'the @everyone role is implicit' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger member_roles_guard before insert on public.member_roles for each row execute function public.member_roles_guard();

-- Höchstens 24 Server-Abzeichen pro Server (wie SERVER_BADGE_LIMIT im Client).
create function public.server_badges_limit() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select count(*) from public.server_badges b where b.server_id = new.server_id) >= 24 then
    raise exception 'server badge limit reached' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger server_badges_limit before insert on public.server_badges for each row execute function public.server_badges_limit();

-- Nachrichten: Zeitstempel setzt der Server (kein Zurückdatieren).
create function public.messages_before_insert() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.created_at := now();
  new.edited_at := null;
  new.pinned := false;
  return new;
end;
$$;

create trigger messages_before_insert before insert on public.messages for each row execute function public.messages_before_insert();

-- Neue DM-Nachricht → Gespräch nach oben und für alle Teilnehmer wieder einblenden.
create function public.messages_touch_dm() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.dm_channels set last_activity_at = new.created_at where id = new.dm_id;
  update public.dm_participants set hidden = false where dm_id = new.dm_id and hidden;
  return null;
end;
$$;

create trigger messages_touch_dm after insert on public.messages for each row when (new.dm_id is not null) execute function public.messages_touch_dm();

-- Reaktionen erben Kanal bzw. DM ihrer Nachricht.
create function public.reactions_fill_scope() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  select m.channel_id, m.dm_id into new.channel_id, new.dm_id from public.messages m where m.id = new.message_id;
  new.created_at := now();
  return new;
end;
$$;

create trigger reactions_fill_scope before insert on public.reactions for each row execute function public.reactions_fill_scope();
