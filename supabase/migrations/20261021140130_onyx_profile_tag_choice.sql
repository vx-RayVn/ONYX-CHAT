-- The actor is derived from Auth; PostgREST upsert must not require UPDATE(user_id).
create function public.choose_server_tag(p_server_id uuid default null) returns uuid
language plpgsql security invoker set search_path='' as $$
declare v_user uuid:=auth.uid(); v_server uuid;
begin
 if v_user is null then raise exception 'permission denied' using errcode='42501';end if;
 if p_server_id is null then
  delete from public.profile_tags where user_id=v_user;
  return null;
 end if;
 insert into public.profile_tags(user_id,server_id) values(v_user,p_server_id)
 on conflict(user_id) do update set server_id=excluded.server_id returning server_id into v_server;
 return v_server;
end $$;
revoke all on function public.choose_server_tag(uuid) from public,anon;
grant execute on function public.choose_server_tag(uuid) to authenticated;
