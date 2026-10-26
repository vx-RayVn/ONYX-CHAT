-- Verified Steam identities. Browser clients can only hide/show or disconnect them.
create table public.profile_connections (
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider = 'steam'),
  external_id text not null check (external_id ~ '^[0-9]{17}$'),
  is_visible boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, provider),
  unique (provider, external_id)
);
alter table public.profile_connections enable row level security;
revoke all on public.profile_connections from public, anon, authenticated;
grant select, delete on public.profile_connections to authenticated;
grant update(is_visible) on public.profile_connections to authenticated;
grant all on public.profile_connections to service_role;
create policy "connections: own or explicitly visible" on public.profile_connections for select to authenticated
  using (user_id = (select auth.uid()) or is_visible);
create policy "connections: own visibility" on public.profile_connections for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "connections: own disconnect" on public.profile_connections for delete to authenticated
  using (user_id = (select auth.uid()));
create trigger block_suspended_writes before insert or update or delete on public.profile_connections
  for each statement execute function private.block_suspended_writes();

create table private.connection_challenges (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  state_hash text not null unique check (state_hash ~ '^[a-f0-9]{64}$'),
  return_origin text not null check (return_origin in ('https://onyxchat.site', 'http://localhost:5173', 'http://127.0.0.1:5173')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes'
);
alter table private.connection_challenges enable row level security;
revoke all on private.connection_challenges from public, anon, authenticated;

-- Deliberately a narrow API: it never accepts a user id or an arbitrary redirect URL.
create function public.connection_start(p_hash text, p_origin text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  if private.is_platform_banned() then raise exception 'account suspended' using errcode = '42501'; end if;
  if exists (select 1 from private.connection_challenges where user_id = v_user and created_at > now() - interval '5 seconds') then
    raise exception 'rate limited';
  end if;
  insert into private.connection_challenges(user_id, state_hash, return_origin) values (v_user, p_hash, p_origin)
    on conflict (user_id) do update set state_hash = excluded.state_hash, return_origin = excluded.return_origin,
      created_at = now(), expires_at = now() + interval '10 minutes';
end;
$$;
revoke all on function public.connection_start(text, text) from public, anon, authenticated;
grant execute on function public.connection_start(text, text) to authenticated;

-- Only the Edge Function may consume a challenge after verifying Steam's signature.
create function public.connection_complete(p_hash text, p_external_id text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_origin text;
begin
  delete from private.connection_challenges where state_hash = p_hash and expires_at > now()
    returning user_id, return_origin into v_user, v_origin;
  if v_user is null then raise exception 'invalid state'; end if;
  if exists (select 1 from public.platform_bans where user_id = v_user and lifted_at is null) then
    raise exception 'account suspended' using errcode = '42501';
  end if;
  insert into public.profile_connections(user_id, provider, external_id) values(v_user, 'steam', p_external_id)
    on conflict (user_id, provider) do update set external_id = excluded.external_id, is_visible = false, created_at = now();
  return v_origin;
end;
$$;
revoke all on function public.connection_complete(text, text) from public, anon, authenticated;
grant execute on function public.connection_complete(text, text) to service_role;
