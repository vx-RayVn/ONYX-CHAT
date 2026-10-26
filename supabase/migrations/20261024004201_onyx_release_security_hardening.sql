-- Release audit: serialize per-account sliding quotas and close retired demo APIs.
create or replace function private.hit_rate_limit(p_kind text,p_limit integer,p_window interval)
returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid();
begin
 if me is null then raise exception 'not authenticated' using errcode='28000';end if;
 if p_kind is null or p_kind='' or p_limit is null or p_limit<1 or p_window is null or p_window<=interval '0' then raise exception 'invalid rate policy' using errcode='22023';end if;
 -- The check and INSERT share a transaction lock, including concurrent HTTP calls.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('onyx:rate:'||me::text||':'||p_kind,0));
 -- Never scan/delete every other account's quota log on the request path.
 delete from private.rate_events where user_id=me and kind=p_kind and at<now()-greatest(p_window,interval '1 day');
 if (select count(*) from private.rate_events where user_id=me and kind=p_kind and at>now()-p_window)>=p_limit then
  raise exception 'rate limited: %',p_kind using errcode='P0001';
 end if;
 insert into private.rate_events(user_id,kind)values(me,p_kind);
end $$;

-- Maintenance is indexed and periodic, rather than repeated by every request.
create index if not exists rate_events_expiry_idx on private.rate_events(at);
create function private.cleanup_rate_events()returns bigint language plpgsql security definer set search_path='' as $$
declare removed bigint;
begin
 delete from private.rate_events where at<now()-interval '1 day';
 get diagnostics removed=row_count;
 return removed;
end $$;
revoke all on function private.cleanup_rate_events()from public,anon,authenticated,service_role;
do $$begin
 if exists(select 1 from pg_extension where extname='pg_cron')then
  perform cron.schedule('onyx_rate_events_cleanup','*/10 * * * *','select private.cleanup_rate_events()');
 end if;
end $$;

-- These were already hidden in cloud UI; they must not grant/reset Plus via RPC.
create or replace function public.plus_demo_purchase()returns timestamptz language plpgsql security invoker set search_path='' as $$
begin raise exception 'plus_purchases_unavailable' using errcode='0A000';end $$;
create or replace function public.plus_demo_reset()returns void language plpgsql security invoker set search_path='' as $$
begin raise exception 'plus_purchases_unavailable' using errcode='0A000';end $$;
revoke all on function public.plus_demo_purchase(),public.plus_demo_reset()from public,anon,authenticated;

-- Cover the full composite FK, including ownership/tag checks and member removal.
create index if not exists profile_tags_server_user_idx on public.profile_tags(server_id,user_id);
