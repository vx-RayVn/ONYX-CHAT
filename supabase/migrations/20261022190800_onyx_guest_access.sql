-- Guests have their own native Auth identity; membership and messages survive registration.
alter table public.profiles add column is_guest boolean not null default false;
alter table public.profiles alter column member_number drop not null;
create function private.is_guest(p_user uuid default auth.uid()) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users a left join public.profiles p on p.id=a.id where a.id=p_user and (a.is_anonymous or coalesce(p.is_guest,false)))
$$;
revoke all on function private.is_guest(uuid) from public,anon;
grant execute on function private.is_guest(uuid) to authenticated,service_role;
create function private.require_registered() returns void language plpgsql stable security definer set search_path='' as $$
begin if private.is_guest(auth.uid()) then raise exception 'registration_required' using errcode='42501';end if;end $$;
revoke all on function private.require_registered() from public,anon;
grant execute on function private.require_registered() to authenticated,service_role;
CREATE OR REPLACE FUNCTION private.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_username text := regexp_replace(lower(coalesce(new.raw_user_meta_data->>'username', '')), '[^a-z0-9_.]', '', 'g');
  v_display text := btrim(coalesce(new.raw_user_meta_data->>'display_name', ''));
  v_country text := upper(coalesce(new.raw_user_meta_data->>'country', ''));
  v_colors constant text[] := array['#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#ef4444', '#14b8a6', '#64748b'];
  v_number bigint;
  v_earned text[] := '{}';
  v_shown text[] := '{}';
begin
  if coalesce(new.is_anonymous,false) then
    insert into public.profiles(id,username,display_name,avatar_color,member_number,is_guest)
    values(new.id,'guest.'||left(md5(new.id::text),26),left(coalesce(nullif(v_display,''),'Guest'),32),v_colors[1+floor(random()*array_length(v_colors,1))::int],null,true);
    return new;
  end if;
  if v_username like 'guest.%' then raise exception 'reserved username' using errcode='23514';end if;
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
$function$
;
CREATE OR REPLACE FUNCTION private._scope_permissions_registered(p_server uuid, p_channel uuid, p_category uuid, p_voice boolean, p_user uuid)
 RETURNS permission[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  all_perms constant public.permission[] := enum_range(null::public.permission);
  v_owner uuid;
  v_everyone uuid;
  v_roles uuid[];
  base public.permission[];
  ow record;
  eff_allow public.permission[];
  eff_deny public.permission[];
  e_allow public.permission[] := '{}';
  e_deny public.permission[] := '{}';
  r_allow public.permission[] := '{}';
  r_deny public.permission[] := '{}';
  m_allow public.permission[] := '{}';
  m_deny public.permission[] := '{}';
  v public.permission[];
begin
  if p_user is null then
    return '{}';
  end if;
  select s.owner_id into v_owner from public.servers s where s.id = p_server;
  if not found then
    return '{}';
  end if;
  if v_owner = p_user then
    return all_perms;
  end if;
  if not exists (select 1 from public.server_members m where m.server_id = p_server and m.user_id = p_user) then
    return '{}';
  end if;

  select r.id into v_everyone from public.roles r where r.server_id = p_server and r.is_default;
  select coalesce(array_agg(mr.role_id), '{}') into v_roles
    from public.member_roles mr join public.roles r on r.id = mr.role_id
    where mr.server_id = p_server and mr.user_id = p_user and not r.is_default;
  select coalesce(array_agg(distinct p), '{}') into base
    from public.roles r cross join lateral unnest(r.permissions) p
    where r.server_id = p_server and (r.is_default or r.id = any (v_roles));

  if 'administrator' = any (base) then
    return all_perms;
  end if;
  if p_channel is null and p_category is null then
    return base;
  end if;

  -- Pro Ziel (Rolle oder Mitglied): Kanal-Eintrag (ca/cd) und Kategorie-Eintrag (ka/kd).
  for ow in
    select o.target_type, o.target_id,
      coalesce(max(o.allow) filter (where o.channel_id is not null), '{}') as ca,
      coalesce(max(o.deny) filter (where o.channel_id is not null), '{}') as cd,
      coalesce(max(o.allow) filter (where o.category_id is not null), '{}') as ka,
      coalesce(max(o.deny) filter (where o.category_id is not null), '{}') as kd
    from public.permission_overwrites o
    where (o.channel_id = p_channel or (p_category is not null and o.category_id = p_category))
      and ((o.target_type = 'role' and (o.target_id = v_everyone or o.target_id = any (v_roles)))
        or (o.target_type = 'member' and o.target_id = p_user))
    group by o.target_type, o.target_id
  loop
    -- Kanal zuerst (Verweigern vor Erlauben), sonst Kategorie.
    eff_deny := private._perm_union(ow.cd, private._perm_minus(ow.kd, ow.ca));
    eff_allow := private._perm_union(private._perm_minus(ow.ca, ow.cd), private._perm_minus(private._perm_minus(ow.ka, ow.kd), ow.cd));
    if ow.target_type = 'member' then
      m_allow := eff_allow;
      m_deny := eff_deny;
    elsif ow.target_id = v_everyone then
      e_allow := eff_allow;
      e_deny := eff_deny;
    else
      r_allow := private._perm_union(r_allow, eff_allow);
      r_deny := private._perm_union(r_deny, eff_deny);
    end if;
  end loop;

  v := private._perm_union(private._perm_minus(base, e_deny), e_allow);
  v := private._perm_union(private._perm_minus(v, r_deny), r_allow);
  v := private._perm_union(private._perm_minus(v, m_deny), m_allow);

  if not ('viewChannel' = any (v)) then
    return '{}';
  end if;
  if not ('sendMessages' = any (v)) then
    v := private._perm_minus(v, array['attachFiles', 'sendVoiceMessages', 'mentionEveryone']::public.permission[]);
  end if;
  if p_voice and not ('connect' = any (v)) then
    v := private._perm_minus(v, array['speak', 'video']::public.permission[]);
  end if;
  return v;
end;
$function$
;
revoke all on function private._scope_permissions_registered(uuid,uuid,uuid,boolean,uuid) from public,anon,authenticated;
create or replace function private._scope_permissions(p_server uuid,p_channel uuid,p_category uuid,p_voice boolean,p_user uuid) returns public.permission[] language sql stable security definer set search_path='' as $$
 select case when private.is_guest(p_user) then array(select p from unnest(private._scope_permissions_registered(p_server,p_channel,p_category,p_voice,p_user)) p where p=any(array['viewChannel','readHistory','sendMessages','connect','speak','video','screenShare']::public.permission[])) else private._scope_permissions_registered(p_server,p_channel,p_category,p_voice,p_user) end
$$;
-- All public RPCs enforce the boundary themselves, including clients outside PostgREST.
CREATE OR REPLACE FUNCTION public.friend_accept(p_user uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ select private.require_registered();
  update public.friendships set status = 'accepted', accepted_at = now()
  where requester_id = p_user and addressee_id = auth.uid() and status = 'pending'
$function$
;
CREATE OR REPLACE FUNCTION public.admin_set_report_status(p_report uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.require_registered();
  if not private.is_platform_admin() then
    raise exception 'not a platform admin' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('open', 'resolved', 'dismissed') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  update public.reports r
  set status = p_status,
      handled_by = case when p_status = 'open' then null else auth.uid() end,
      handled_at = case when p_status = 'open' then null else now() end
  where r.id = p_report;
  if not found then
    raise exception 'report not found' using errcode = 'P0002';
  end if;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.admin_delete_reported_message(p_report uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_message uuid;
  v_attachments jsonb;
begin
  perform private.require_registered();
  if not private.is_platform_admin() then
    raise exception 'not a platform admin' using errcode = '42501';
  end if;
  select r.message_id into v_message from public.reports r where r.id = p_report and r.kind = 'message';
  if v_message is null then
    raise exception 'report not found' using errcode = 'P0002';
  end if;
  delete from public.messages m where m.id = v_message returning m.attachments into v_attachments;
  update public.reports r set message_deleted_at = now() where r.message_id = v_message and r.message_deleted_at is null;
  return jsonb_build_object('deleted', v_attachments is not null, 'attachments', coalesce(v_attachments, '[]'::jsonb));
end;
$function$
;
CREATE OR REPLACE FUNCTION public.create_server(p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid := auth.uid();
  v_server uuid;
  v_system uuid := nullif(p->>'systemChannelId', '')::uuid;
begin
  perform private.require_registered();
  if me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if (select count(*) from public.servers s where s.owner_id = me) >= 100 then
    raise exception 'server limit reached' using errcode = '23514';
  end if;
  if jsonb_array_length(coalesce(p->'roles', '[]')) > 50
     or jsonb_array_length(coalesce(p->'categories', '[]')) > 50
     or jsonb_array_length(coalesce(p->'channels', '[]')) > 200 then
    raise exception 'template too large' using errcode = '23514';
  end if;
  if (select count(*) from jsonb_array_elements(coalesce(p->'roles', '[]')) x where coalesce((x->>'isDefault')::boolean, false)) <> 1 then
    raise exception 'exactly one @everyone role required' using errcode = '23514';
  end if;

  insert into public.servers (id, name, icon, icon_color, description, owner_id)
  values (coalesce(nullif(p->>'id', '')::uuid, gen_random_uuid()), btrim(p->>'name'), p->>'icon', coalesce(p->>'iconColor', '#10b981'), p->>'description', me)
  returning id into v_server;

  insert into public.roles (id, server_id, name, color, hoist, position, permissions, is_default)
  select coalesce(nullif(x->>'id', '')::uuid, gen_random_uuid()), v_server, x->>'name', x->>'color',
    coalesce((x->>'hoist')::boolean, false), coalesce((x->>'position')::int, 0),
    array(select jsonb_array_elements_text(coalesce(x->'permissions', '[]')))::public.permission[],
    coalesce((x->>'isDefault')::boolean, false)
  from jsonb_array_elements(coalesce(p->'roles', '[]')) x;

  insert into public.server_members (server_id, user_id) values (v_server, me);
  insert into public.member_roles (server_id, user_id, role_id)
  select v_server, me, (x #>> '{}')::uuid from jsonb_array_elements(coalesce(p->'memberRoleIds', '[]')) x;

  insert into public.categories (id, server_id, name, position)
  select coalesce(nullif(x->>'id', '')::uuid, gen_random_uuid()), v_server, x->>'name', coalesce((x->>'position')::int, 0)
  from jsonb_array_elements(coalesce(p->'categories', '[]')) x;

  insert into public.channels (id, server_id, category_id, name, type, topic, position)
  select coalesce(nullif(x->>'id', '')::uuid, gen_random_uuid()), v_server, nullif(x->>'categoryId', '')::uuid, x->>'name',
    coalesce(x->>'type', 'text')::public.channel_type, x->>'topic', coalesce((x->>'position')::int, 0)
  from jsonb_array_elements(coalesce(p->'channels', '[]')) x;

  if v_system is not null then
    update public.servers set system_channel_id = v_system where id = v_server;
    insert into public.messages (id, channel_id, author_id, type)
    values (coalesce(nullif(p->>'joinMessageId', '')::uuid, gen_random_uuid()), v_system, me, 'join');
  end if;
  return v_server;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.create_group_dm(p_id uuid, p_users uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid := auth.uid();
  v_others uuid[];
  v_id uuid;
begin
  perform private.require_registered();
  if me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  v_others := array(select distinct u from unnest(p_users) u where u is not null and u <> me);
  if cardinality(v_others) < 1 or cardinality(v_others) > 9 then
    raise exception 'a group has 2 to 10 members' using errcode = '23514';
  end if;
  if exists (
    select 1 from unnest(v_others) u
    where not exists (
      select 1 from public.friendships f
      where f.status = 'accepted' and ((f.requester_id = me and f.addressee_id = u) or (f.requester_id = u and f.addressee_id = me))
    )
  ) then
    raise exception 'group members must be friends' using errcode = '42501';
  end if;
  insert into public.dm_channels (id, type, owner_id) values (coalesce(p_id, gen_random_uuid()), 'group', me) returning id into v_id;
  insert into public.dm_participants (dm_id, user_id) values (v_id, me);
  insert into public.dm_participants (dm_id, user_id) select v_id, u from unnest(v_others) u;
  return v_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.replace_overwrites(p_server uuid, p_channel uuid, p_category uuid, p_list jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  perform private.require_registered();
  if (p_channel is null) = (p_category is null) then
    raise exception 'pass either a channel or a category' using errcode = '22023';
  end if;

  delete from public.permission_overwrites o
  where (case when p_channel is not null then o.channel_id = p_channel else o.category_id = p_category end)
    and not exists (
      select 1 from jsonb_array_elements(coalesce(p_list, '[]')) x
      where x->>'type' = o.target_type::text and (x->>'id')::uuid = o.target_id
    );

  with l as (
    select (x->>'type')::public.overwrite_target as target_type, (x->>'id')::uuid as target_id,
      array(select jsonb_array_elements_text(coalesce(x->'allow', '[]')))::public.permission[] as allow,
      array(select jsonb_array_elements_text(coalesce(x->'deny', '[]')))::public.permission[] as deny
    from jsonb_array_elements(coalesce(p_list, '[]')) x
  )
  update public.permission_overwrites o set allow = l.allow, deny = l.deny
  from l
  where (case when p_channel is not null then o.channel_id = p_channel else o.category_id = p_category end)
    and l.target_type = o.target_type and l.target_id = o.target_id
    and (o.allow is distinct from l.allow or o.deny is distinct from l.deny);

  with l as (
    select (x->>'type')::public.overwrite_target as target_type, (x->>'id')::uuid as target_id,
      array(select jsonb_array_elements_text(coalesce(x->'allow', '[]')))::public.permission[] as allow,
      array(select jsonb_array_elements_text(coalesce(x->'deny', '[]')))::public.permission[] as deny
    from jsonb_array_elements(coalesce(p_list, '[]')) x
  )
  insert into public.permission_overwrites (server_id, channel_id, category_id, target_type, target_id, allow, deny)
  select p_server, p_channel, p_category, l.target_type, l.target_id, l.allow, l.deny
  from l
  where not exists (
    select 1 from public.permission_overwrites o
    where (case when p_channel is not null then o.channel_id = p_channel else o.category_id = p_category end)
      and o.target_type = l.target_type and o.target_id = l.target_id
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.set_bug_report_status(p_id uuid, p_status text, p_reply text DEFAULT ''::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  perform private.require_registered();
 if not private.is_platform_admin() or private.is_platform_banned() then raise exception 'not allowed' using errcode='42501';end if;
 update public.bug_reports set status=p_status,reply=coalesce(p_reply,'') where id=p_id;
 if not found then raise exception 'report unavailable';end if;
end $function$
;
CREATE OR REPLACE FUNCTION public.push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_lang text, p_preview boolean, p_sound boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := auth.uid();
begin
  perform private.require_registered();
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  perform private.hit_rate_limit('push_subscribe', 30, interval '1 hour');
  delete from public.push_subscriptions s where s.endpoint = p_endpoint and s.user_id <> v_user;
  -- Höchstens 20 Geräte: das am längsten unbenutzte fällt weg.
  delete from public.push_subscriptions s
    where s.id in (
      select x.id from public.push_subscriptions x
      where x.user_id = v_user and x.endpoint <> p_endpoint
      order by coalesce(x.last_used_at, x.created_at) desc
      offset 19
    );
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, lang, preview, sound)
  values (v_user, p_endpoint, p_p256dh, p_auth, coalesce(p_lang, 'en'), coalesce(p_preview, true), coalesce(p_sound, true))
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh, auth = excluded.auth, lang = excluded.lang, preview = excluded.preview, sound = excluded.sound;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.choose_server_tag(p_server_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_user uuid:=auth.uid(); v_server uuid;
begin
  perform private.require_registered();
 if v_user is null then raise exception 'permission denied' using errcode='42501';end if;
 if p_server_id is null then
  delete from public.profile_tags where user_id=v_user;
  return null;
 end if;
 insert into public.profile_tags(user_id,server_id) values(v_user,p_server_id)
 on conflict(user_id) do update set server_id=excluded.server_id returning server_id into v_server;
 return v_server;
end $function$
;
CREATE OR REPLACE FUNCTION public.call_decline(p_call uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid := auth.uid();
begin
  perform private.require_registered();
  if me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  update public.calls c set declined = array_append(c.declined, me), updated_at = now()
  where c.id = p_call and c.ended_at is null and private.is_dm_participant(c.dm_id) and not (me = any (c.declined));
end;
$function$
;
CREATE OR REPLACE FUNCTION public.call_start(p_dm uuid, p_video boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid := auth.uid();
  v_call public.calls;
  v_id uuid;
begin
  perform private.require_registered();
  if me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if private.is_platform_banned() then
    raise exception 'account suspended' using errcode = '42501';
  end if;
  if not private.is_dm_participant(p_dm) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if not private.can_send_dm(p_dm) then
    raise exception 'blocked' using errcode = '42501';
  end if;
  -- Gleichzeitige Starts in derselben DM nacheinander.
  perform 1 from public.dm_channels d where d.id = p_dm for update;
  select * into v_call from public.calls c where c.dm_id = p_dm and c.ended_at is null;
  if found then
    -- Liegengeblieben (niemand verbunden, Webhook verloren)? Dann gilt er als beendet.
    if v_call.updated_at < now() - interval '90 seconds' and not exists (select 1 from public.voice_states vs where vs.dm_id = p_dm) then
      update public.calls set ended_at = v_call.updated_at where id = v_call.id;
    else
      return jsonb_build_object('id', v_call.id, 'started', false);
    end if;
  end if;
  perform private.hit_rate_limit('call', 10, interval '5 minutes');
  v_id := gen_random_uuid();
  insert into public.messages (id, dm_id, author_id, type, content) values (v_id, p_dm, me, 'call', '');
  insert into public.calls (id, dm_id, started_by, video) values (v_id, p_dm, me, coalesce(p_video, false));
  return jsonb_build_object('id', v_id, 'started', true);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.voice_moderate(p_target uuid, p_action text, p_dest uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid := auth.uid();
  vs public.voice_states;
  c public.channels;
  dest public.channels;
  v public.permission[];
  t public.permission[];
  v_need public.permission;
  v_mute boolean;
  v_deaf boolean;
begin
  perform private.require_registered();
  if me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if private.is_platform_banned() then
    raise exception 'account suspended' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('mute', 'unmute', 'deafen', 'undeafen', 'disconnect', 'move') then
    raise exception 'unknown action' using errcode = '22023';
  end if;
  select * into vs from public.voice_states s where s.user_id = p_target;
  if not found or vs.channel_id is null then
    raise exception 'not in a voice channel' using errcode = 'P0002';
  end if;
  select * into c from public.channels ch where ch.id = vs.channel_id;
  v := private._scope_permissions(c.server_id, c.id, c.category_id, true, me);
  v_need := case
    when p_action in ('mute', 'unmute') then 'muteMembers'
    when p_action in ('deafen', 'undeafen') then 'deafenMembers'
    else 'moveMembers'
  end;
  if not (v_need = any (v)) then
    raise exception 'missing permission: %', v_need using errcode = '42501';
  end if;
  if p_target <> me and private.top_role_position(c.server_id, p_target) >= private.top_role_position(c.server_id, me) then
    raise exception 'target is not below you' using errcode = '42501';
  end if;
  perform private.hit_rate_limit('voice_moderate', 60, interval '1 minute');

  if p_action = 'move' then
    select * into dest from public.channels ch where ch.id = p_dest;
    if not found or dest.type <> 'voice' or dest.server_id <> c.server_id or dest.id = c.id then
      raise exception 'invalid destination' using errcode = '22023';
    end if;
    if not ('connect' = any (private._scope_permissions(dest.server_id, dest.id, dest.category_id, true, me))) then
      raise exception 'missing permission: connect' using errcode = '42501';
    end if;
    if not ('connect' = any (private._scope_permissions(dest.server_id, dest.id, dest.category_id, true, p_target))) then
      raise exception 'target cannot connect there' using errcode = '42501';
    end if;
    insert into private.voice_moves (user_id, channel_id) values (p_target, dest.id)
    on conflict (user_id) do update set channel_id = excluded.channel_id, created_at = now();
  end if;

  if p_action in ('mute', 'unmute', 'deafen', 'undeafen') then
    insert into private.voice_member_flags as f (server_id, user_id, mute, deaf)
    values (c.server_id, p_target, p_action = 'mute', p_action = 'deafen')
    on conflict (server_id, user_id) do update set
      mute = case when p_action in ('mute', 'unmute') then p_action = 'mute' else f.mute end,
      deaf = case when p_action in ('deafen', 'undeafen') then p_action = 'deafen' else f.deaf end,
      updated_at = now()
    returning f.mute, f.deaf into v_mute, v_deaf;
    update public.voice_states s set server_mute = v_mute, server_deaf = v_deaf where s.user_id = p_target;
  else
    select f.mute, f.deaf into v_mute, v_deaf from private.voice_member_flags f where f.server_id = c.server_id and f.user_id = p_target;
  end if;

  t := private._scope_permissions(c.server_id, c.id, c.category_id, true, p_target);
  return jsonb_build_object(
    'room', vs.room,
    'server_id', c.server_id,
    'channel_id', c.id,
    'dest_channel_id', p_dest,
    'server_mute', coalesce(v_mute, false),
    'server_deaf', coalesce(v_deaf, false),
    'can_speak', 'speak' = any (t) and not coalesce(v_mute, false),
    'can_video', 'video' = any (t),
    'can_screen', 'screenShare' = any (t)
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.discord_import_gate(p_kind text)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.require_registered();select private.discord_import_gate(p_kind)$function$
;
CREATE OR REPLACE FUNCTION public.redeem_code(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid := auth.uid();
  v_code text := private.normalize_code(p_code);
  v_promo private.promo_codes;
  v_prev public.code_redemptions;
  r jsonb;
begin
  perform private.require_registered();
  if me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if (select count(*) from private.rate_events e where e.user_id = me and e.kind = 'code_fail' and e.at > now() - interval '10 minutes') >= 10 then
    raise exception 'rate limited: code_fail' using errcode = 'P0001';
  end if;
  select * into v_promo from private.promo_codes c
  where c.code = v_code and c.active and (c.starts_at is null or now() >= c.starts_at) and (c.ends_at is null or now() <= c.ends_at);
  if not found then
    insert into private.rate_events (user_id, kind) values (me, 'code_fail');
    return jsonb_build_object('status', 'invalid');
  end if;
  select * into v_prev from public.code_redemptions x where x.user_id = me and x.code = v_code;
  if found then
    return jsonb_build_object('status', 'redeemed', 'code', v_code, 'at', v_prev.redeemed_at, 'rewards', v_prev.rewards);
  end if;
  if v_promo.max_redemptions is not null and (select count(*) from public.code_redemptions x where x.code = v_code) >= v_promo.max_redemptions then
    return jsonb_build_object('status', 'invalid');
  end if;
  insert into public.code_redemptions (user_id, code, rewards) values (me, v_code, v_promo.rewards);
  for r in select * from jsonb_array_elements(v_promo.rewards) loop
    if r->>'kind' = 'badge' then
      perform private.grant_badge(me, r->>'id');
    end if;
  end loop;
  return jsonb_build_object('status', 'success', 'code', v_code, 'title', v_promo.title, 'description', v_promo.description, 'rewards', v_promo.rewards);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.plus_demo_purchase()
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_since timestamptz;
begin
  perform private.require_registered();
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  update public.profiles set plus_since = coalesce(plus_since, now()) where id = auth.uid() returning plus_since into v_since;
  perform private.grant_badge(auth.uid(), 'supporter');
  return v_since;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.plus_demo_reset()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.require_registered();
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  delete from public.user_badges where user_id = auth.uid() and badge = 'supporter';
  update public.profiles set plus_since = null, supporter_wall = false, badges = array_remove(badges, 'supporter') where id = auth.uid();
end;
$function$
;
CREATE OR REPLACE FUNCTION public.bot_revoke(p_bot uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.require_registered();
 if auth.uid() is null or private.is_platform_banned() or not exists(select 1 from public.bot_apps where id=p_bot and owner_id=auth.uid()) then raise exception 'unauthorized' using errcode='42501'; end if;
 delete from private.bot_credentials where bot_id=p_bot;delete from private.bot_devices where bot_id=p_bot;
end $function$
;
CREATE OR REPLACE FUNCTION public.bot_pair_approve(p_code text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_bot uuid;v_name text;
begin
  perform private.require_registered();
 if auth.uid() is null or private.is_platform_banned() then raise exception 'unauthorized' using errcode='42501'; end if;
 select d.bot_id,b.name into v_bot,v_name from private.bot_devices d join public.bot_apps b on b.id=d.bot_id where d.user_code=upper(btrim(p_code)) and d.expires_at>now() and b.owner_id=auth.uid() for update of d;
 if v_bot is null then raise exception 'pairing code unavailable' using errcode='42501'; end if;
 update private.bot_devices set approved=true where user_code=upper(btrim(p_code));
 return v_name;
end $function$
;
CREATE OR REPLACE FUNCTION public.bot_dispatch(p_bot uuid, p_channel uuid, p_command text, p_args text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.channels;event_id bigint;
begin
  perform private.require_registered();
 if auth.uid() is null or private.is_platform_banned() then raise exception 'unauthorized' using errcode='42501'; end if;
 select * into c from public.channels where id=p_channel and type='text';
 if c.id is null or not private.has_channel_permission(c.id,'viewChannel') or not private.has_channel_permission(c.id,'sendMessages') then raise exception 'channel forbidden' using errcode='42501'; end if;
 if char_length(p_args)>2000 or not exists(select 1 from public.bot_installs i join public.bot_apps b on b.id=i.bot_id where i.bot_id=p_bot and i.server_id=c.server_id and c.id=any(i.channel_ids) and exists(select 1 from jsonb_array_elements(b.commands) x where x->>'name'=p_command) and not exists(select 1 from public.platform_bans x where x.user_id=b.owner_id and x.lifted_at is null)) then raise exception 'command unavailable' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,273));
 if(select count(*) from private.bot_events where user_id=auth.uid() and created_at>now()-interval '1 minute')>=30 then raise exception 'rate limited' using errcode='P0001'; end if;
 insert into private.bot_events(bot_id,server_id,channel_id,user_id,command,args) values(p_bot,c.server_id,c.id,auth.uid(),p_command,coalesce(p_args,'')) returning id into event_id;
 return event_id;
end $function$
;
CREATE OR REPLACE FUNCTION public.save_server_tag(p_server_id uuid, p_label text, p_image text DEFAULT NULL::text, p_enabled boolean DEFAULT true)
 RETURNS server_tags
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_code text; v_tag public.server_tags;
begin
  perform private.require_registered();
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
end $function$
;
CREATE OR REPLACE FUNCTION public.submit_bug_report(p_id uuid, p_category text, p_title text, p_description text, p_environment text DEFAULT ''::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_id uuid;
begin
  perform private.require_registered();
 if auth.uid() is null or private.is_platform_banned() then raise exception 'not allowed' using errcode='42501';end if;
 if p_id is null then raise exception 'invalid report';end if;
 perform pg_advisory_xact_lock(hashtextextended('bug-report:'||auth.uid()::text,0));
 select id into v_id from public.bug_reports where id=p_id and reporter_id=auth.uid();
 if v_id is not null then return v_id;end if;
 insert into public.bug_reports(id,reporter_id,category,title,description,environment)
 values(p_id,auth.uid(),p_category,btrim(p_title),btrim(p_description),btrim(coalesce(p_environment,''))) on conflict(id) do nothing returning id into v_id;
 if v_id is null then raise exception 'invalid report';end if;
 return v_id;
end $function$
;
CREATE OR REPLACE FUNCTION public.import_discord_server(p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_server uuid:=(p->>'id')::uuid;v_owner uuid;v_count integer;
begin
  perform private.require_registered();
 if auth.uid() is null or private.is_platform_banned() then raise exception 'not allowed' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('discord-import-create:'||auth.uid()::text,0));
 select owner_id into v_owner from public.servers where id=v_server;
 if v_owner=auth.uid() then return v_server;end if;
 perform private.discord_import_gate('commit');
 if jsonb_typeof(p)<>'object' or pg_column_size(p)>750000 or jsonb_array_length(coalesce(p->'overwrites','[]'))>5000 then raise exception 'template too large';end if;
 v_server:=public.create_server(p||jsonb_build_object('memberRoleIds','[]'::jsonb,'systemChannelId',null));
 -- All channel/role/category UUIDs are new. Existing FK and RLS rules bind every write to this server.
 update public.servers set description=left(coalesce(p->>'description',''),1000) where id=v_server;
 update public.channels c set slowmode=coalesce((x->>'slowmode')::integer,0),age_restricted=coalesce((x->>'ageRestricted')::boolean,false),user_limit=coalesce((x->>'userLimit')::integer,0)
 from jsonb_array_elements(p->'channels') x where c.server_id=v_server and c.id=(x->>'id')::uuid;
 if exists(select 1 from jsonb_array_elements(coalesce(p->'overwrites','[]')) x where not exists(select 1 from public.roles r where r.server_id=v_server and r.id=(x->>'roleId')::uuid) or not exists(select 1 from public.channels c where c.server_id=v_server and c.id=(x->>'channelId')::uuid)) then raise exception 'invalid import permission scope' using errcode='42501';end if;
 insert into public.permission_overwrites(server_id,channel_id,target_type,target_id,allow,deny)
 select v_server,(x->>'channelId')::uuid,'role',(x->>'roleId')::uuid,
 array(select jsonb_array_elements_text(coalesce(x->'allow','[]')))::public.permission[],array(select jsonb_array_elements_text(coalesce(x->'deny','[]')))::public.permission[]
 from jsonb_array_elements(coalesce(p->'overwrites','[]')) x;
 return v_server;
end $function$
;
CREATE OR REPLACE FUNCTION public.open_dm(p_user uuid, p_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid := auth.uid();
  v_key text;
  v_id uuid;
begin
  perform private.require_registered();
  if me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_user is null or p_user = me or not exists (select 1 from public.profiles p where p.id = p_user) then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  if private.is_guest(p_user) then raise exception 'guest_direct_messages_unavailable' using errcode='42501';end if;
  v_key := least(me, p_user)::text || ':' || greatest(me, p_user)::text;
  select d.id into v_id from public.dm_channels d where d.dm_key = v_key;
  if v_id is null then
    if private.is_blocked_between(me, p_user) then
      raise exception 'blocked' using errcode = '42501';
    end if;
    if not exists (
         select 1 from public.friendships f
         where f.status = 'accepted' and least(f.requester_id, f.addressee_id) = least(me, p_user) and greatest(f.requester_id, f.addressee_id) = greatest(me, p_user)
       )
       and not exists (
         select 1 from public.server_members a join public.server_members b on b.server_id = a.server_id
         where a.user_id = me and b.user_id = p_user
       ) then
      raise exception 'you need to be friends or share a server' using errcode = '42501';
    end if;
    insert into public.dm_channels (id, type, dm_key) values (coalesce(p_id, gen_random_uuid()), 'dm', v_key)
    on conflict (dm_key) do nothing
    returning id into v_id;
    if v_id is null then
      select d.id into v_id from public.dm_channels d where d.dm_key = v_key;
    else
      -- Für die andere Seite erscheint die DM erst mit der ersten Nachricht.
      insert into public.dm_participants (dm_id, user_id, hidden) values (v_id, me, false), (v_id, p_user, true);
    end if;
  end if;
  update public.dm_participants set hidden = false where dm_id = v_id and user_id = me;
  return v_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.friend_request(p_username text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid := auth.uid();
  v_target public.profiles;
  v_friendship public.friendships;
  v_status text;
begin
  perform private.require_registered();
  if me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  perform private.hit_rate_limit('friend_request', 30, interval '1 hour');
  select * into v_target from public.profiles p where lower(p.username) = lower(ltrim(btrim(p_username), '@'));
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if private.is_guest(v_target.id) then return jsonb_build_object('status','unavailable');end if;
  if v_target.id = me then
    return jsonb_build_object('status', 'self');
  end if;
  if private.is_blocked_between(me, v_target.id) then
    return jsonb_build_object('status', 'unavailable', 'user_id', v_target.id, 'display_name', v_target.display_name);
  end if;
  select * into v_friendship from public.friendships f
  where least(f.requester_id, f.addressee_id) = least(me, v_target.id) and greatest(f.requester_id, f.addressee_id) = greatest(me, v_target.id);
  if not found then
    insert into public.friendships (requester_id, addressee_id) values (me, v_target.id);
    v_status := 'sent';
  elsif v_friendship.status = 'accepted' then
    v_status := 'already_friends';
  elsif v_friendship.requester_id = me then
    v_status := 'already_sent';
  else
    update public.friendships set status = 'accepted', accepted_at = now() where id = v_friendship.id;
    v_status := 'accepted';
  end if;
  return jsonb_build_object('status', v_status, 'user_id', v_target.id, 'display_name', v_target.display_name);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.transfer_server_ownership(p_server uuid, p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid := auth.uid();
begin
  perform private.require_registered();
  if private.is_guest(p_user) then raise exception 'registered owner required' using errcode='42501';end if;
  if me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  perform 1 from public.servers s where s.id = p_server and s.owner_id = me for update;
  if not found then
    raise exception 'only the owner can transfer a server' using errcode = '42501';
  end if;
  if p_user is null or p_user = me then
    raise exception 'invalid user' using errcode = '22023';
  end if;
  if not exists (select 1 from public.server_members m where m.server_id = p_server and m.user_id = p_user) then
    raise exception 'the new owner must be a member' using errcode = '42501';
  end if;
  -- Gleiches Limit wie create_server().
  if (select count(*) from public.servers s where s.owner_id = p_user) >= 100 then
    raise exception 'server limit reached' using errcode = '23514';
  end if;
  update public.servers set owner_id = p_user where id = p_server;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.grant_badge(p_user uuid, p_badge text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if private.is_guest(p_user) then return false;end if;
 if not exists(select 1 from public.badge_catalog where id=p_badge) then return false; end if;
 insert into public.user_badges(user_id,badge) values(p_user,p_badge) on conflict do nothing;
 if not found then return false; end if;
 update public.profiles set badges=badges||p_badge where id=p_user and not(p_badge=any(badges)) and cardinality(badges)<10;
 return true;
end $function$
;
CREATE OR REPLACE FUNCTION public.join_server_by_invite(p_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid := auth.uid();
  inv public.invites;
  v_system uuid;
begin
  if me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if (select count(*) from private.rate_events e where e.user_id = me and e.kind = 'invite_fail' and e.at > now() - interval '10 minutes') >= 10 then
    raise exception 'rate limited: invite_fail' using errcode = 'P0001';
  end if;
  select * into inv from public.invites i where i.code = lower(btrim(p_code)) for update;
  if not found
     or (inv.expires_at is not null and inv.expires_at <= now())
     or (inv.max_uses is not null and inv.uses >= inv.max_uses) then
    insert into private.rate_events (user_id, kind) values (me, 'invite_fail');
    return null;
  end if;
  if exists (select 1 from public.server_bans b where b.server_id = inv.server_id and b.user_id = me) then
    raise exception 'banned from this server' using errcode = '42501';
  end if;
  if exists (select 1 from public.server_members m where m.server_id = inv.server_id and m.user_id = me) then
    return inv.server_id;
  end if;
  if (select count(*) from public.server_members m where m.user_id = me) >= 200 then
    raise exception 'server limit reached' using errcode = '23514';
  end if;

  insert into public.server_members (server_id, user_id) values (inv.server_id, me);
  update public.invites set uses = uses + 1 where code = inv.code;
  select s.system_channel_id into v_system from public.servers s where s.id = inv.server_id;
  if v_system is not null then
    insert into public.messages (channel_id, author_id, type) values (v_system, me, 'join');
  end if;
  if inv.inviter_id is not null and inv.inviter_id <> me and not private.is_guest(me) then
    insert into private.invite_joins (inviter_id, joiner_id) values (inv.inviter_id, me) on conflict do nothing;
    if found and (select count(*) from private.invite_joins j where j.inviter_id = inv.inviter_id) >= 25 then
      perform private.grant_badge(inv.inviter_id, 'community-builder');
    end if;
  end if;
  return inv.server_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.voice_join_check(p_target uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid := auth.uid();
  c public.channels;
  d public.dm_channels;
  v public.permission[];
  v_mute boolean;
  v_deaf boolean;
  v_ticket boolean;
  v_current text;
begin
  if me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if private.is_platform_banned() then
    raise exception 'account suspended' using errcode = '42501';
  end if;
  perform private.hit_rate_limit('voice_join', 30, interval '1 minute');
  select vs.room into v_current from public.voice_states vs where vs.user_id = me;

  select * into c from public.channels ch where ch.id = p_target;
  if found then
    if c.type <> 'voice' then
      raise exception 'not a voice channel' using errcode = '22023';
    end if;
    v := private._scope_permissions(c.server_id, c.id, c.category_id, true, me);
    if not ('connect' = any (v)) then
      raise exception 'missing permission: connect' using errcode = '42501';
    end if;
    select f.mute, f.deaf into v_mute, v_deaf from private.voice_member_flags f where f.server_id = c.server_id and f.user_id = me;
    delete from private.voice_moves mv where mv.user_id = me and mv.channel_id = c.id and mv.created_at > now() - interval '2 minutes'
      returning true into v_ticket;
    return jsonb_build_object(
      'kind', 'channel',
      'room', 'channel:' || c.id,
      'server_id', c.server_id,
      'channel_id', c.id,
      'user_limit', nullif(c.user_limit, 0),
      -- "Mitglieder verschieben" darf (wie bei Discord) auch in volle Kanäle; ebenso, wer gerade verschoben wurde.
      'bypass_limit', 'moveMembers' = any (v) or coalesce(v_ticket, false),
      'can_speak', 'speak' = any (v) and not coalesce(v_mute, false),
      'can_video', 'video' = any (v),
      'can_screen', 'screenShare' = any (v),
      'server_mute', coalesce(v_mute, false),
      'server_deaf', coalesce(v_deaf, false),
      'current_room', v_current
    );
  end if;

  perform private.require_registered();
  select * into d from public.dm_channels dm where dm.id = p_target;
  if not found or not private.is_dm_participant(p_target) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if not private.can_send_dm(p_target) then
    raise exception 'blocked' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'kind', 'dm',
    'room', 'dm:' || d.id,
    'dm_id', d.id,
    'user_limit', null,
    'bypass_limit', true,
    'can_speak', true,
    'can_video', true,
    'can_screen', true,
    'server_mute', false,
    'server_deaf', false,
    'current_room', v_current
  );
end;
$function$
;
create or replace function public.username_available(p_username text) returns boolean language sql stable security definer set search_path='' as $$
 select btrim(p_username) ~ '^[a-z0-9_.]{2,32}$' and btrim(p_username) not like 'guest.%' and not exists(select 1 from public.profiles p where lower(p.username)=lower(btrim(p_username)))
$$;
create or replace function public.account_session_check(p_user uuid,p_session uuid,p_aal text) returns boolean language sql stable security invoker set search_path='' as $$
 select p_session is not null and private.account_session_state(p_user,p_session,p_aal)='ready' and not private.is_guest(p_user)
$$;
create or replace function public.check_account_request() returns void language plpgsql security invoker set search_path='' as $$
declare v_state text;v_path text:=current_setting('request.path',true);begin
 if auth.jwt()->>'role'='authenticated' then
  v_state:=private.own_session_state();
  if v_state='mfa_required' then raise sqlstate 'PT403' using message='mfa_required';end if;
  if v_state<>'ready' then raise sqlstate 'PT401' using message='session_expired';end if;
  if private.is_guest(auth.uid()) and v_path like '/rpc/%' and split_part(v_path,'/',3)<>all(array['invite_preview','account_status','recent_messages','username_available','voice_server_activity','ensure_official_server','join_server_by_invite','report_message','report_user','user_block','friend_remove','voice_join_check','voice_set_self','complete_guest_registration','check_account_request']) then
   raise sqlstate 'PT403' using message='registration_required';
  end if;
 end if;
end $$;
-- Restrictive write policies supplement existing ownership/channel policies.
do $$declare v_table text;v_op text;v_allowed boolean;begin
 for v_table in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity loop
  foreach v_op in array array['insert','update','delete'] loop
   v_allowed:=v_table=any(array['messages','read_states','blocks','reports']) or (v_table='profiles' and v_op='update') or (v_table='server_members' and v_op='delete');
   if not v_allowed then
    execute format('create policy "onyx: registered %s" on public.%I as restrictive for %s to authenticated %s',v_op,v_table,v_op,case when v_op='insert' then 'with check (not (select private.is_guest()))' when v_op='delete' then 'using (not (select private.is_guest()))' else 'using (not (select private.is_guest())) with check (not (select private.is_guest()))' end);
   end if;
  end loop;
 end loop;
end $$;
create function private.guest_profile_guard() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if current_user='authenticated' then
  if new.is_guest is distinct from old.is_guest then raise exception 'protected guest status' using errcode='42501';end if;
  if private.is_guest(auth.uid()) and (to_jsonb(new)-'status') is distinct from (to_jsonb(old)-'status') then raise exception 'registration_required' using errcode='42501';end if;
  if private.is_guest(auth.uid()) and new.status not in ('online','idle','offline') then raise exception 'registration_required' using errcode='42501';end if;
  if new.username like 'guest.%' and new.username is distinct from old.username then raise exception 'reserved username' using errcode='23514';end if;
 end if;return new;
end $$;
revoke all on function private.guest_profile_guard() from public,anon,authenticated;
create trigger guest_profile_guard before update on public.profiles for each row execute function private.guest_profile_guard();
create function private.guest_message_guard() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if current_user='authenticated' and private.is_guest(auth.uid()) and (new.dm_id is not null or new.type<>'default' or jsonb_array_length(new.attachments)>0 or new.pinned) then raise exception 'registration_required' using errcode='42501';end if;
 return new;
end $$;
revoke all on function private.guest_message_guard() from public,anon,authenticated;
create trigger guest_message_guard before insert or update on public.messages for each row execute function private.guest_message_guard();
create policy "onyx: no guest friendships" on public.friendships as restrictive for all to authenticated
 using(not private.is_guest(requester_id) and not private.is_guest(addressee_id)) with check(not private.is_guest(requester_id) and not private.is_guest(addressee_id));
create policy "onyx: registered upload" on storage.objects as restrictive for insert to authenticated with check(not (select private.is_guest()));
create policy "onyx: registered media update" on storage.objects as restrictive for update to authenticated using(not (select private.is_guest())) with check(not (select private.is_guest()));
create policy "onyx: registered media delete" on storage.objects as restrictive for delete to authenticated using(not (select private.is_guest()));
create function private.allocate_member_number() returns bigint language sql volatile security definer set search_path='' as $$select nextval('public.member_number_seq')$$;
revoke all on function private.allocate_member_number() from public,anon,authenticated;
create function public.complete_guest_registration(p_username text) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid();v_profile public.profiles;v_number bigint;v_earned text[]:='{}';begin
 if me is null then raise exception 'not authenticated' using errcode='28000';end if;
 if private.is_platform_banned() then raise exception 'account suspended' using errcode='42501';end if;
 if not exists(select 1 from auth.users a where a.id=me and not a.is_anonymous and a.email_confirmed_at is not null and coalesce(length(a.encrypted_password),0)>0) then raise exception 'guest_email_verification_required' using errcode='42501';end if;
 select * into v_profile from public.profiles where id=me for update;
 if not found then raise exception 'profile missing' using errcode='P0002';end if;
 if not v_profile.is_guest then return;end if;
 if not public.username_available(p_username) then raise exception 'username unavailable' using errcode='23505';end if;
 perform private.hit_rate_limit('guest_upgrade',6,interval '1 hour');
 v_number:=private.allocate_member_number();
 if v_number<=100 then v_earned:=v_earned||'first-100'::text;end if;
 if v_number<=1000 then v_earned:=v_earned||'first-1000'::text;end if;
 if v_number<=10000 then v_earned:=v_earned||'first-10000'::text;end if;
 insert into public.user_badges(user_id,badge)select me,unnest(v_earned) on conflict do nothing;
 update public.profiles set username=btrim(p_username),is_guest=false,member_number=v_number,badges=coalesce(v_earned[1:1],'{}') where id=me;
end $$;
revoke all on function public.complete_guest_registration(text) from public,anon;
grant execute on function public.complete_guest_registration(text) to authenticated;
notify pgrst,'reload schema';
