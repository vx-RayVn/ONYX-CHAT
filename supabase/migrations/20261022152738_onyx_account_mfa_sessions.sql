-- Optional MFA becomes mandatory for accounts with a verified factor.
create function private.account_session_state(p_user uuid,p_session uuid,p_aal text) returns text
language plpgsql stable security definer set search_path='' as $$
begin
 if p_user is null then return 'session_expired';end if;
 if p_session is not null and not exists(select 1 from auth.sessions where id=p_session and user_id=p_user and (not_after is null or not_after>now())) then return 'session_expired';end if;
 if coalesce(p_aal,'aal1')<>'aal2' and exists(select 1 from auth.mfa_factors where user_id=p_user and status='verified') then return 'mfa_required';end if;
 return 'ready';
end $$;
revoke all on function private.account_session_state(uuid,uuid,text) from public,anon,authenticated;
create function private.own_session_state() returns text language sql stable security definer set search_path='' as $$
 select private.account_session_state(auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid,auth.jwt()->>'aal')
$$;
revoke all on function private.own_session_state() from public,anon;
grant execute on function private.own_session_state() to authenticated;
-- All existing ownership and channel policies still apply in addition to this gate.
do $$declare v_table text;begin
 for v_table in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity loop
  execute format('create policy "onyx: verified account session" on public.%I as restrictive for all to authenticated using ((select private.own_session_state())=''ready'') with check ((select private.own_session_state())=''ready'')',v_table);
 end loop;
end $$;
create policy "onyx: verified account session" on storage.objects as restrictive for all to authenticated
 using ((select private.own_session_state())='ready') with check ((select private.own_session_state())='ready');
create policy "onyx: verified account session" on realtime.messages as restrictive for all to authenticated
 using ((select private.own_session_state())='ready') with check ((select private.own_session_state())='ready');
-- The Data API hook also protects SECURITY DEFINER RPCs, which bypass table RLS.
create function public.check_account_request() returns void language plpgsql security invoker set search_path='' as $$
declare v_state text;begin
 if auth.jwt()->>'role'='authenticated' then
  v_state:=private.own_session_state();
  if v_state='mfa_required' then raise sqlstate 'PT403' using message='mfa_required';end if;
  if v_state<>'ready' then raise sqlstate 'PT401' using message='session_expired';end if;
 end if;
end $$;
revoke all on function public.check_account_request() from public;
grant execute on function public.check_account_request() to anon,authenticated,service_role;
alter role authenticator set pgrst.db_pre_request='public.check_account_request';
notify pgrst,'reload config';
-- Service-role functions must explicitly check the caller before using privileged APIs.
create function public.account_session_check(p_user uuid,p_session uuid,p_aal text) returns boolean
language sql stable security invoker set search_path='' as $$select p_session is not null and private.account_session_state(p_user,p_session,p_aal)='ready'$$;
revoke all on function public.account_session_check(uuid,uuid,text) from public,anon,authenticated;
grant execute on function private.account_session_state(uuid,uuid,text) to service_role;
grant execute on function public.account_session_check(uuid,uuid,text) to service_role;
