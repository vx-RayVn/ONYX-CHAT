-- Save a server's one shared tag independently of the client's cached read state.
-- SECURITY INVOKER retains column grants, RLS and suspended-account guards.
create function public.save_server_tag(p_server_id uuid,p_label text,p_image text default null,p_enabled boolean default true)
returns public.server_tags language plpgsql security invoker set search_path='' as $$
declare v_code text; v_tag public.server_tags;
begin
 if auth.uid() is null or not private.has_server_permission(p_server_id,'manageBadges') then
  raise exception 'permission denied' using errcode='42501';
 end if;
 -- Concurrent saves from two tabs must share one invitation and one configuration.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('onyx:server-tag:'||p_server_id::text,0));
 select invite_code into v_code from public.server_tags where server_id=p_server_id;
 if v_code is null then
  v_code:=replace(pg_catalog.gen_random_uuid()::text,'-','');
  insert into public.invites(code,server_id,channel_id,inviter_id,max_uses,expires_at)
  values(v_code,p_server_id,null,auth.uid(),null,null);
 end if;
 insert into public.server_tags(server_id,label,image,enabled,invite_code)
 values(p_server_id,p_label,p_image,p_enabled,v_code)
 on conflict(server_id) do update set label=excluded.label,image=excluded.image,enabled=excluded.enabled,
  invite_code=excluded.invite_code,updated_at=now()
 returning * into v_tag;
 return v_tag;
end $$;
revoke all on function public.save_server_tag(uuid,text,text,boolean) from public,anon;
grant execute on function public.save_server_tag(uuid,text,text,boolean) to authenticated;
