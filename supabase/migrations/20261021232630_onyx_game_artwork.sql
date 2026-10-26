-- Icons share the activity's existing lifetime, RLS, ownership and deletion rules.
-- The cache identifier is not an authentication credential.
alter table public.game_activities
 add column artwork_png text check(artwork_png is null or (octet_length(artwork_png)<=43692 and artwork_png ~ '^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$')),
 add column artwork_hash text generated always as (md5(artwork_png)) stored;

create function private.clear_changed_game_artwork() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.game_key is distinct from old.game_key or new.source is distinct from old.source or new.device_id is distinct from old.device_id then new.artwork_png:=null;end if;
 return new;
end $$;
revoke all on function private.clear_changed_game_artwork() from public,anon,authenticated;
create trigger clear_changed_game_artwork before update on public.game_activities for each row execute function private.clear_changed_game_artwork();

create function public.activity_publish_artwork(p_hash text,p_title text default null,p_key text default null,p_started timestamptz default null,p_artwork text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_result jsonb;v_hash text;
begin
 -- The existing publisher authenticates, locks, checks bans/privacy and rate-limits first.
 v_result:=public.activity_publish(p_hash,p_title,p_key,p_started);
 if p_artwork is not null then
  update public.game_activities a set artwork_png=p_artwork
  from private.activity_devices d
  where d.token_hash=p_hash and a.user_id=d.user_id and a.device_id=d.id and a.source='desktop' and a.game_key=p_key;
 end if;
 select a.artwork_hash into v_hash from public.game_activities a join private.activity_devices d on d.id=a.device_id
 where d.token_hash=p_hash and a.source='desktop' and a.game_key=p_key;
 return v_result||jsonb_build_object('artwork_hash',v_hash);
end $$;
revoke all on function public.activity_publish_artwork(text,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.activity_publish_artwork(text,text,text,timestamptz,text) to service_role;
