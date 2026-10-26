-- Explicit opt-in only: existing servers are not published by this migration.
create table public.server_directory (
 server_id uuid primary key references public.servers(id) on delete cascade,
 created_by uuid not null references public.profiles(id) on delete cascade,
 category text not null check(category in ('general','gaming','music','creative','technology','learning')),
 enabled boolean not null default false,
 invite_code text references public.invites(code) on delete set null,
 updated_at timestamptz not null default now()
);
create index server_directory_creator_idx on public.server_directory(created_by);
create index server_directory_invite_idx on public.server_directory(invite_code);
create index server_directory_category_idx on public.server_directory(category,server_id) where enabled;
alter table public.server_directory enable row level security;
revoke all on public.server_directory from public,anon,authenticated;
grant select on public.server_directory to authenticated;
create policy "directory: owner settings" on public.server_directory for select to authenticated
 using(exists(select 1 from public.servers s where s.id=server_id and s.owner_id=(select auth.uid())));
create policy "onyx: verified account session" on public.server_directory as restrictive for all to authenticated
 using((select private.own_session_state())='ready') with check((select private.own_session_state())='ready');
create policy "directory: registered accounts" on public.server_directory as restrictive for all to authenticated
 using(not (select private.is_guest())) with check(not (select private.is_guest()));
create trigger block_suspended_writes before insert or update or delete on public.server_directory for each statement execute function private.block_suspended_writes();

create function private.directory_session() returns void language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or private.own_session_state()<>'ready' or private.is_platform_banned() then raise exception 'account session required' using errcode='42501';end if;
 perform private.require_registered();
end $$;
revoke all on function private.directory_session() from public,anon,authenticated;

create function private.save_server_directory(p_server uuid,p_enabled boolean,p_category text) returns void language plpgsql security definer set search_path='' as $$
declare code text;
begin
 perform private.directory_session();
 -- Lock ownership before publishing; ownership transfer cannot race publication.
 perform 1 from public.servers where id=p_server and owner_id=auth.uid() for update;
 if not found then raise exception 'server owner required' using errcode='42501';end if;
 if p_category is null or p_category<>all(array['general','gaming','music','creative','technology','learning']) or p_enabled is null then raise exception 'invalid directory settings' using errcode='23514';end if;
 perform private.hit_rate_limit('directory_settings',20,interval '1 minute');
 select i.code into code from public.server_directory d join public.invites i on i.code=d.invite_code and i.server_id=d.server_id
 where d.server_id=p_server and i.expires_at is null and i.max_uses is null;
 if p_enabled and code is null then
  code:=replace(gen_random_uuid()::text,'-','');
  insert into public.invites(code,server_id,inviter_id) values(code,p_server,auth.uid());
 end if;
 insert into public.server_directory(server_id,created_by,category,enabled,invite_code) values(p_server,auth.uid(),p_category,p_enabled,code)
 on conflict(server_id) do update set category=excluded.category,enabled=excluded.enabled,invite_code=excluded.invite_code,created_by=excluded.created_by,updated_at=now();
end $$;
revoke all on function private.save_server_directory(uuid,boolean,text) from public,anon;
grant execute on function private.save_server_directory(uuid,boolean,text) to authenticated;
create function public.save_server_directory(p_server uuid,p_enabled boolean,p_category text) returns void language sql security invoker set search_path='' as $$select private.save_server_directory(p_server,p_enabled,p_category)$$;
revoke all on function public.save_server_directory(uuid,boolean,text) from public,anon;
grant execute on function public.save_server_directory(uuid,boolean,text) to authenticated;

create function private.search_server_directory(p_query text,p_category text,p_offset integer) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform private.directory_session();
 if p_query is null or length(p_query)>100 or p_offset is null or p_offset<0 or p_offset>1000 or (p_category is not null and p_category<>all(array['general','gaming','music','creative','technology','learning'])) then raise exception 'invalid directory search' using errcode='23514';end if;
 with page as materialized (
  select s.id,s.name,s.icon,s.icon_color,s.banner,s.description,s.verified,s.is_official,d.category,i.code
  from public.server_directory d join public.servers s on s.id=d.server_id join public.invites i on i.code=d.invite_code and i.server_id=s.id
  where d.enabled and (p_category is null or d.category=p_category) and i.expires_at is null and i.max_uses is null
   and (p_query='' or strpos(lower(s.name||' '||coalesce(s.description,'')),lower(btrim(p_query)))>0)
   and not exists(select 1 from public.server_bans b where b.server_id=s.id and b.user_id=auth.uid())
   and not exists(select 1 from public.platform_bans b where b.user_id=s.owner_id and b.lifted_at is null)
  order by s.is_official desc,s.verified desc,lower(s.name),s.id limit 25 offset p_offset
 ) select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('members',(select count(*) from public.server_members m where m.server_id=p.id))), '[]'::jsonb) into result from page p;
 return result;
end $$;
revoke all on function private.search_server_directory(text,text,integer) from public,anon;
grant execute on function private.search_server_directory(text,text,integer) to authenticated;
create function public.search_server_directory(p_query text default '',p_category text default null,p_offset integer default 0) returns jsonb language sql stable security invoker set search_path='' as $$select private.search_server_directory(p_query,p_category,p_offset)$$;
revoke all on function public.search_server_directory(text,text,integer) from public,anon;
grant execute on function public.search_server_directory(text,text,integer) to authenticated;
