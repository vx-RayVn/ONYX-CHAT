-- ONYX: public invitation previews, voluntary server tags and editable official badges.
create table public.badge_catalog (
  id text primary key check (id in ('verified','founder','team','onyx-og','creator','bug-hunter','first-100','first-1000','first-10000')),
  name text not null check (char_length(btrim(name)) between 1 and 50),
  description text not null check (char_length(description) <= 300),
  image text check (image is null or (image ~ '^data:image/(png|webp);base64,' and octet_length(image) <= 180000)),
  edited_by uuid references public.profiles(id) on delete cascade,
  updated_at timestamptz not null default now()
);
alter table public.badge_catalog enable row level security;
grant select on public.badge_catalog to anon, authenticated;
grant update(name,description,image,edited_by,updated_at) on public.badge_catalog to authenticated;
create policy "badge catalog: read" on public.badge_catalog for select using (true);
create policy "badge catalog: admins" on public.badge_catalog for update to authenticated using (private.is_platform_admin()) with check (private.is_platform_admin());
create trigger block_suspended_writes before insert or update or delete on public.badge_catalog for each statement execute function private.block_suspended_writes();
insert into public.badge_catalog(id,name,description) values
 ('verified','Verified','Identity confirmed by the ONYX team'),('founder','Founder','Founder of ONYX'),
 ('team','ONYX Team','Official member of the ONYX team'),('onyx-og','ONYX OG','Found ONYX through the early videos'),
 ('creator','Creator','Content creator on ONYX'),('bug-hunter','Bug Hunter','Helped find and fix bugs'),
 ('first-100','First 100','One of the first 100 members'),('first-1000','First 1,000','One of the first 1,000 members'),
 ('first-10000','First 10,000','One of the first 10,000 members');

create or replace function private.grant_badge(p_user uuid,p_badge text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.badge_catalog where id=p_badge) then return false; end if;
 insert into public.user_badges(user_id,badge) values(p_user,p_badge) on conflict do nothing;
 if not found then return false; end if;
 update public.profiles set badges=badges||p_badge where id=p_user and not(p_badge=any(badges)) and cardinality(badges)<10;
 return true;
end $$;
update public.profiles set badges=array(select b from unnest(badges) b where b in (select id from public.badge_catalog));
delete from public.user_badges where badge not in (select id from public.badge_catalog);

create function private.plus_wall_default() returns trigger language plpgsql set search_path='' as $$
begin
 if old.plus_since is null and new.plus_since is not null then new.supporter_wall:=true; end if;
 return new;
end $$;
create trigger plus_wall_default before update of plus_since on public.profiles for each row execute function private.plus_wall_default();
revoke all on function private.plus_wall_default() from public,anon,authenticated;

create table public.server_tags (
 server_id uuid primary key references public.servers(id) on delete cascade,
 created_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
 label text not null check(char_length(btrim(label)) between 1 and 4 and label !~ '[[:space:][:cntrl:]]'),
 image text check(image is null or (image ~ '^data:image/(png|webp);base64,' and octet_length(image)<=180000)),
 enabled boolean not null default true,
 invite_code text references public.invites(code) on delete set null,
 updated_at timestamptz not null default now()
);
create index server_tags_created_by_idx on public.server_tags(created_by);
create index server_tags_invite_idx on public.server_tags(invite_code);
alter table public.server_tags enable row level security;
grant select on public.server_tags to authenticated;
grant insert(server_id,label,image,enabled,invite_code),update(label,image,enabled,invite_code,updated_at),delete on public.server_tags to authenticated;
create policy "server tags: read" on public.server_tags for select to authenticated using(enabled or private.is_server_member(server_id));
create policy "server tags: manage" on public.server_tags for all to authenticated using(private.has_server_permission(server_id,'manageBadges')) with check(private.has_server_permission(server_id,'manageBadges'));
create trigger block_suspended_writes before insert or update or delete on public.server_tags for each statement execute function private.block_suspended_writes();
create function private.server_tag_invite_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.invite_code is not null and not exists(select 1 from public.invites i where i.code=new.invite_code and i.server_id=new.server_id and i.expires_at is null and i.max_uses is null) then
  raise exception 'tag invite must be a permanent invite for this server' using errcode='23514';
 end if;
 return new;
end $$;
create trigger server_tag_invite_guard before insert or update on public.server_tags for each row execute function private.server_tag_invite_guard();
revoke all on function private.server_tag_invite_guard() from public,anon,authenticated;

create table public.profile_tags (
 user_id uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
 server_id uuid not null references public.server_tags(server_id) on delete cascade,
 foreign key(server_id,user_id) references public.server_members(server_id,user_id) on delete cascade
);
create index profile_tags_server_idx on public.profile_tags(server_id);
alter table public.profile_tags enable row level security;
grant select,delete on public.profile_tags to authenticated;
grant insert(user_id,server_id),update(server_id) on public.profile_tags to authenticated;
create policy "profile tags: read" on public.profile_tags for select to authenticated using(exists(select 1 from public.server_tags t where t.server_id=profile_tags.server_id and t.enabled));
create policy "profile tags: own" on public.profile_tags for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()) and exists(select 1 from public.server_tags t where t.server_id=profile_tags.server_id and t.enabled));
create trigger block_suspended_writes before insert or update or delete on public.profile_tags for each statement execute function private.block_suspended_writes();

-- Only deliberately shared, live invitation data, never channels, member identities or ban lists.
create function public.invite_preview(p_code text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('code',i.code,'server_id',s.id,'name',s.name,'icon',s.icon,'banner',s.banner,'description',s.description,
 'members',(select count(*) from public.server_members m where m.server_id=s.id),'created_at',s.created_at)
 from public.invites i join public.servers s on s.id=i.server_id
 where i.code=lower(btrim(p_code)) and length(p_code)<=100 and (i.expires_at is null or i.expires_at>now()) and (i.max_uses is null or i.uses<i.max_uses)
$$;
revoke all on function public.invite_preview(text) from public,anon,authenticated;
grant execute on function public.invite_preview(text) to anon,authenticated;
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  alter publication supabase_realtime add table public.badge_catalog,public.server_tags,public.profile_tags;
 end if;
end $$;
