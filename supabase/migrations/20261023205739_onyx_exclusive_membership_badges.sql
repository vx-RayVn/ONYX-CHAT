-- Exactly one early membership badge, based on the protected registration number.
create or replace function private.early_member_badge(p_number bigint) returns text
language sql immutable strict security invoker set search_path='' as $$
 select case when p_number between 1 and 100 then 'first-100'
 when p_number between 101 and 1000 then 'first-1000'
 when p_number between 1001 and 10000 then 'first-10000' end
$$;
revoke all on function private.early_member_badge(bigint) from public,anon,authenticated;

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

  v_earned := array_remove(array[private.early_member_badge(v_number)], null);
  if cardinality(v_earned) > 0 then
    insert into public.user_badges (user_id, badge) select new.id, unnest(v_earned);
    -- Exactly one membership tier is earned and shown.
    v_shown := v_earned[1:1];
    update public.profiles set badges = v_shown where id = new.id;
  end if;
  return new;
end;
$function$
;

create or replace function public.complete_guest_registration(p_username text) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid();v_profile public.profiles;v_number bigint;v_earned text[]:='{}';begin
 if me is null then raise exception 'not authenticated' using errcode='28000';end if;
 if private.is_platform_banned() then raise exception 'account suspended' using errcode='42501';end if;
 if not exists(select 1 from auth.users a where a.id=me and not a.is_anonymous and a.email_confirmed_at is not null and coalesce(length(a.encrypted_password),0)>0) then raise exception 'guest_email_verification_required' using errcode='42501';end if;
 select * into v_profile from public.profiles where id=me for update;
 if not found then raise exception 'profile missing' using errcode='P0002';end if;
 if not v_profile.is_guest then return;end if;
 if v_profile.country is null or not (v_profile.country=any(array['AC','AD','AE','AF','AG','AI','AL','AM','AO','AQ','AR','AS','AT','AU','AW','AX','AZ','BA','BB','BD','BE','BF','BG','BH','BI','BJ','BL','BM','BN','BO','BQ','BR','BS','BT','BV','BW','BY','BZ','CA','CC','CD','CF','CG','CH','CI','CK','CL','CM','CN','CO','CP','CQ','CR','CU','CV','CW','CX','CY','CZ','DE','DG','DJ','DK','DM','DO','DZ','EA','EC','EE','EG','EH','ER','ES','ET','FI','FJ','FK','FM','FO','FR','GA','GB','GD','GE','GF','GG','GH','GI','GL','GM','GN','GP','GQ','GR','GS','GT','GU','GW','GY','HK','HM','HN','HR','HT','HU','IC','ID','IE','IL','IM','IN','IO','IQ','IR','IS','IT','JE','JM','JO','JP','KE','KG','KH','KI','KM','KN','KP','KR','KW','KY','KZ','LA','LB','LC','LI','LK','LR','LS','LT','LU','LV','LY','MA','MC','MD','ME','MF','MG','MH','MK','ML','MM','MN','MO','MP','MQ','MR','MS','MT','MU','MV','MW','MX','MY','MZ','NA','NC','NE','NF','NG','NI','NL','NO','NP','NR','NU','NZ','OM','PA','PE','PF','PG','PH','PK','PL','PM','PN','PR','PS','PT','PW','PY','QA','RE','RO','RS','RU','RW','SA','SB','SC','SD','SE','SG','SH','SI','SJ','SK','SL','SM','SN','SO','SR','SS','ST','SV','SX','SY','SZ','TA','TC','TD','TF','TG','TH','TJ','TK','TL','TM','TN','TO','TR','TT','TV','TW','TZ','UA','UG','UM','US','UY','UZ','VA','VC','VE','VG','VI','VN','VU','WF','WS','XK','YE','YT','ZA','ZM','ZW'])) then raise exception 'country_required' using errcode='23514';end if;
 if not public.username_available(p_username) then raise exception 'username unavailable' using errcode='23505';end if;
 perform private.hit_rate_limit('guest_upgrade',6,interval '1 hour');
 v_number:=private.allocate_member_number();
 v_earned:=array_remove(array[private.early_member_badge(v_number)],null);
 insert into public.user_badges(user_id,badge)select me,unnest(v_earned) on conflict do nothing;
 update public.profiles set username=btrim(p_username),is_guest=false,member_number=v_number,badges=coalesce(v_earned[1:1],'{}') where id=me;
end $$;

-- Remove only ineligible membership tiers; preserve all other rewards and their timestamps.
delete from public.user_badges b using public.profiles p
where b.user_id=p.id and b.badge in ('first-100','first-1000','first-10000')
and b.badge is distinct from (case when p.is_guest then null else private.early_member_badge(p.member_number) end);

-- Preserve the order and selection of every remaining equipped badge.
update public.profiles p set badges=array(
 select b from unnest(p.badges) with ordinality as equipped(b,n)
 where b not in ('first-100','first-1000','first-10000')
 or b is not distinct from (case when p.is_guest then null else private.early_member_badge(p.member_number) end)
 order by n
)
where exists(select 1 from unnest(p.badges) b where b in ('first-100','first-1000','first-10000')
 and b is distinct from (case when p.is_guest then null else private.early_member_badge(p.member_number) end));
