-- Automatic listing is explicitly requested for new AND existing servers.
alter table public.server_directory alter column enabled set default true;
create function private.ensure_default_directory(p_server uuid,p_owner uuid) returns void language plpgsql security definer set search_path='' as $$
declare code text;
begin
 if not exists(select 1 from public.profiles p where p.id=p_owner and not p.is_guest) or exists(select 1 from public.platform_bans b where b.user_id=p_owner and b.lifted_at is null) then return;end if;
 select i.code into code from public.server_directory d join public.invites i on i.code=d.invite_code and i.server_id=d.server_id where d.server_id=p_server and i.expires_at is null and i.max_uses is null;
 if code is null then code:=replace(gen_random_uuid()::text,'-','');insert into public.invites(code,server_id,inviter_id) values(code,p_server,p_owner);end if;
 insert into public.server_directory(server_id,created_by,category,enabled,invite_code) values(p_server,p_owner,'general',true,code)
 on conflict(server_id) do update set enabled=true,invite_code=excluded.invite_code,created_by=excluded.created_by,updated_at=now();
end $$;
create function private.list_new_server() returns trigger language plpgsql security definer set search_path='' as $$begin perform private.ensure_default_directory(new.id,new.owner_id);return new;end$$;
revoke all on function private.ensure_default_directory(uuid,uuid),private.list_new_server() from public,anon,authenticated;
create trigger onyx_default_directory after insert on public.servers for each row execute function private.list_new_server();
do $$declare s record;begin for s in select id,owner_id from public.servers loop perform private.ensure_default_directory(s.id,s.owner_id);end loop;end$$;

-- One eligible dataset and one ordering shared by discovery and owner rank previews.
create function private.directory_entries(p_viewer uuid) returns table(id uuid,name text,icon text,icon_color text,banner jsonb,description text,verified boolean,is_official boolean,category text,code text,members bigint,promotion text,boost_level integer,priority integer)
language sql stable security definer set search_path='' as $$
 select s.id,s.name,s.icon,s.icon_color,s.banner,s.description,s.verified,s.is_official,d.category,i.code,
 (select count(*) from public.server_members m where m.server_id=s.id),promo.kind,coalesce(promo.level,0),case when promo.kind='top' then 4 else coalesce(promo.level,0) end
 from public.server_directory d join public.servers s on s.id=d.server_id join public.invites i on i.code=d.invite_code and i.server_id=s.id
 left join lateral(select p.kind,p.level from private.server_promotions p where p.server_id=s.id and p.user_id=s.owner_id and p.ends_at>now() order by(p.kind='top') desc,p.level desc limit 1) promo on true
 where d.enabled and i.expires_at is null and i.max_uses is null
 and not exists(select 1 from public.server_bans b where b.server_id=s.id and b.user_id=p_viewer)
 and not exists(select 1 from public.platform_bans b where b.user_id=s.owner_id and b.lifted_at is null)
$$;
revoke all on function private.directory_entries(uuid) from public,anon,authenticated;
create or replace function private.search_server_directory(p_query text,p_category text,p_offset integer) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform private.directory_session();
 if p_query is null or length(p_query)>100 or p_offset is null or p_offset<0 or p_offset>1000 or(p_category is not null and p_category<>all(array['general','gaming','music','creative','technology','learning'])) then raise exception 'invalid directory search' using errcode='23514';end if;
 with ranked as materialized(select e.*,row_number()over(order by priority desc,members desc,is_official desc,verified desc,lower(name),id) rank from private.directory_entries(auth.uid()) e),
 page as(select * from ranked where(p_category is null or category=p_category) and(p_query='' or strpos(lower(name||' '||coalesce(description,'')),lower(btrim(p_query)))>0) order by rank limit 25 offset p_offset)
 select coalesce(jsonb_agg(to_jsonb(p)-'priority' order by rank),'[]'::jsonb) into result from page p;
 return result;
end $$;

create function private.directory_placement(p_user uuid,p_server uuid) returns jsonb language sql stable security definer set search_path='' as $$
 with entries as materialized(select * from private.directory_entries(p_user)),
 current_rank as(select id,row_number()over(order by priority desc,members desc,is_official desc,verified desc,lower(name),id) rank from entries),
 target as(select s.id,s.name,s.is_official,s.verified,(select count(*) from public.server_members m where m.server_id=s.id) members from public.servers s where s.id=p_server and s.owner_id=p_user),
 choices(sku,level) as(values('boost',1),('super',2),('mega',3),('top',4)),
 projected as(select c.sku,e.id,e.name,e.is_official,e.verified,e.members,case when e.id=p_server then c.level else e.priority end priority from entries e cross join choices c
 union all select c.sku,t.id,t.name,t.is_official,t.verified,t.members,c.level from target t cross join choices c where not exists(select 1 from entries where id=p_server)),
 ranks as(select *,row_number()over(partition by sku order by priority desc,members desc,is_official desc,verified desc,lower(name),id) rank from projected)
 select jsonb_build_object('rank',(select rank from current_rank where id=p_server),'projections',coalesce((select jsonb_object_agg(sku,rank) from ranks where id=p_server),'{}'::jsonb),'listedCount',(select count(*) from entries),'rankCheckedAt',now())
$$;
revoke all on function private.directory_placement(uuid,uuid) from public,anon,authenticated;

create or replace function private.billing_status(p_user uuid,p_server uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if p_server is not null and not exists(select 1 from public.servers where id=p_server and owner_id=p_user) then raise exception 'server owner required' using errcode='42501';end if;
 return jsonb_build_object('legacy',exists(select 1 from private.billing_legacy_plus where user_id=p_user),'subscription',(select jsonb_build_object('state',state,'until',paid_until,'cancelAtEnd',cancel_at_end) from private.billing_subscriptions where user_id=p_user),
 'category',(select category from public.server_directory where server_id=p_server),'pendingActivation',(select count(*) from private.billing_orders where user_id=p_user and state='processing'),'listed',coalesce((select enabled from public.server_directory where server_id=p_server),false),'promotions',(select coalesce(jsonb_agg(jsonb_build_object('sku',sku,'kind',kind,'endsAt',ends_at)),'[]') from private.server_promotions where server_id=p_server and ends_at>now())) || case when p_server is null then '{}'::jsonb else private.directory_placement(p_user,p_server) end;
end $$;
