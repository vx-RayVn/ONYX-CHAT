-- Native Auth hook: age/country admission and private, bounded IP creation quotas.
-- Bind public.before_onyx_signup in Authentication > Hooks AFTER uploading the new frontend.
create table private.signup_policy (
 singleton boolean primary key default true check(singleton),
 salt text not null default encode(extensions.gen_random_bytes(32),'hex'),
 guest_per_hour integer not null default 10 check(guest_per_hour between 1 and 1000),
 registered_per_hour integer not null default 20 check(registered_per_hour between 1 and 1000),
 total_per_day integer not null default 60 check(total_per_day between 1 and 10000)
);
insert into private.signup_policy(singleton)values(true);
create table private.signup_windows (
 fingerprint text not null check(fingerprint~'^[0-9a-f]{64}$'),
 window_kind text not null check(window_kind in ('guest_hour','registered_hour','day')),
 window_start timestamptz not null,
 attempts integer not null check(attempts>0),
 primary key(fingerprint,window_kind,window_start)
);
create index signup_windows_expiry_idx on private.signup_windows(window_start);
revoke all on private.signup_policy,private.signup_windows from public,anon,authenticated;
alter table private.signup_policy enable row level security;
alter table private.signup_windows enable row level security;
grant usage on schema private,extensions to supabase_auth_admin;
grant select on private.signup_policy to supabase_auth_admin;
grant select,insert,update,delete on private.signup_windows to supabase_auth_admin;
create policy "Auth reads signup policy" on private.signup_policy for select to supabase_auth_admin using(true);
create policy "Auth counts signups" on private.signup_windows for all to supabase_auth_admin using(true)with check(true);

create function public.before_onyx_signup(event jsonb)returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 v_meta jsonb:=event#>'{user,user_metadata}'; v_dob date; v_raw text:=v_meta->>'date_of_birth';
 v_guest boolean:=coalesce((event#>>'{user,is_anonymous}')::boolean,false);
 v_country text:=v_meta->>'country';v_ip inet;v_now timestamptz:=clock_timestamp();v_hash text;
 v_config private.signup_policy;v_kind text;v_limit integer;v_count integer;
begin
 if v_raw is null or v_raw!~'^\d{4}-\d{2}-\d{2}$' then return jsonb_build_object('error',jsonb_build_object('http_code',400,'message','date_required'));end if;
 begin v_dob:=v_raw::date;exception when invalid_datetime_format or datetime_field_overflow then return jsonb_build_object('error',jsonb_build_object('http_code',400,'message','date_invalid'));end;
 if v_dob<date '1900-01-01' or v_dob>(v_now at time zone 'UTC')::date then return jsonb_build_object('error',jsonb_build_object('http_code',400,'message','date_invalid'));end if;
 if v_dob>((v_now at time zone 'UTC')::date-interval '16 years')::date then return jsonb_build_object('error',jsonb_build_object('http_code',400,'message','minimum_age'));end if;
 if not v_guest and (v_country is null or not(v_country=any(array['AC','AD','AE','AF','AG','AI','AL','AM','AO','AQ','AR','AS','AT','AU','AW','AX','AZ','BA','BB','BD','BE','BF','BG','BH','BI','BJ','BL','BM','BN','BO','BQ','BR','BS','BT','BV','BW','BY','BZ','CA','CC','CD','CF','CG','CH','CI','CK','CL','CM','CN','CO','CP','CQ','CR','CU','CV','CW','CX','CY','CZ','DE','DG','DJ','DK','DM','DO','DZ','EA','EC','EE','EG','EH','ER','ES','ET','FI','FJ','FK','FM','FO','FR','GA','GB','GD','GE','GF','GG','GH','GI','GL','GM','GN','GP','GQ','GR','GS','GT','GU','GW','GY','HK','HM','HN','HR','HT','HU','IC','ID','IE','IL','IM','IN','IO','IQ','IR','IS','IT','JE','JM','JO','JP','KE','KG','KH','KI','KM','KN','KP','KR','KW','KY','KZ','LA','LB','LC','LI','LK','LR','LS','LT','LU','LV','LY','MA','MC','MD','ME','MF','MG','MH','MK','ML','MM','MN','MO','MP','MQ','MR','MS','MT','MU','MV','MW','MX','MY','MZ','NA','NC','NE','NF','NG','NI','NL','NO','NP','NR','NU','NZ','OM','PA','PE','PF','PG','PH','PK','PL','PM','PN','PR','PS','PT','PW','PY','QA','RE','RO','RS','RU','RW','SA','SB','SC','SD','SE','SG','SH','SI','SJ','SK','SL','SM','SN','SO','SR','SS','ST','SV','SX','SY','SZ','TA','TC','TD','TF','TG','TH','TJ','TK','TL','TM','TN','TO','TR','TT','TV','TW','TZ','UA','UG','UM','US','UY','UZ','VA','VC','VE','VG','VI','VN','VU','WF','WS','XK','YE','YT','ZA','ZM','ZW']))) then return jsonb_build_object('error',jsonb_build_object('http_code',400,'message','country_required'));end if;
 -- The IP comes only from Supabase Auth's hook envelope, never client metadata.
 begin v_ip:=(event#>>'{metadata,ip_address}')::inet;exception when invalid_text_representation then v_ip:=null;end;
 if v_ip is null then return jsonb_build_object('error',jsonb_build_object('http_code',400,'message','signup_request_invalid'));end if;
 select * into strict v_config from private.signup_policy where singleton;
 v_hash:=encode(extensions.hmac(host(v_ip)||':'||to_char(v_now at time zone 'UTC','YYYY-MM-DD'),v_config.salt,'sha256'),'hex');
 delete from private.signup_windows where window_start<v_now-interval '48 hours';
 v_kind:=case when v_guest then 'guest_hour' else 'registered_hour' end;
 v_limit:=case when v_guest then v_config.guest_per_hour else v_config.registered_per_hour end;
 insert into private.signup_windows(fingerprint,window_kind,window_start,attempts)
 values(v_hash,v_kind,date_trunc('hour',v_now at time zone 'UTC')at time zone 'UTC',1)
 on conflict(fingerprint,window_kind,window_start)do update set attempts=least(private.signup_windows.attempts+1,10001) returning attempts into v_count;
 if v_count>v_limit then return jsonb_build_object('error',jsonb_build_object('http_code',429,'message','signup_rate_limited'));end if;
 insert into private.signup_windows(fingerprint,window_kind,window_start,attempts)
 values(v_hash,'day',date_trunc('day',v_now at time zone 'UTC')at time zone 'UTC',1)
 on conflict(fingerprint,window_kind,window_start)do update set attempts=least(private.signup_windows.attempts+1,10001) returning attempts into v_count;
 if v_count>v_config.total_per_day then return jsonb_build_object('error',jsonb_build_object('http_code',429,'message','signup_rate_limited'));end if;
 return '{}'::jsonb;
end $$;
revoke all on function public.before_onyx_signup(jsonb) from public,anon,authenticated;
grant execute on function public.before_onyx_signup(jsonb)to supabase_auth_admin;
-- Native Auth evaluates the hook before INSERT. Do not retain the submitted birthday in auth.users.
create function private.remove_signup_birthday()returns trigger language plpgsql security invoker set search_path='' as $$
begin new.raw_user_meta_data:=coalesce(new.raw_user_meta_data,'{}'::jsonb)-'date_of_birth';return new;end $$;
revoke all on function private.remove_signup_birthday()from public,anon,authenticated;
create trigger onyx_erase_signup_birthday before insert on auth.users for each row execute function private.remove_signup_birthday();

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
 if v_number<=100 then v_earned:=v_earned||'first-100'::text;end if;
 if v_number<=1000 then v_earned:=v_earned||'first-1000'::text;end if;
 if v_number<=10000 then v_earned:=v_earned||'first-10000'::text;end if;
 insert into public.user_badges(user_id,badge)select me,unnest(v_earned) on conflict do nothing;
 update public.profiles set username=btrim(p_username),is_guest=false,member_number=v_number,badges=coalesce(v_earned[1:1],'{}') where id=me;
end $$;
create function public.complete_guest_registration(p_username text,p_country text)returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid()is null or private.own_session_state()<>'ready' then raise exception 'session_expired' using errcode='42501';end if;
 if not(p_country=any(array['AC','AD','AE','AF','AG','AI','AL','AM','AO','AQ','AR','AS','AT','AU','AW','AX','AZ','BA','BB','BD','BE','BF','BG','BH','BI','BJ','BL','BM','BN','BO','BQ','BR','BS','BT','BV','BW','BY','BZ','CA','CC','CD','CF','CG','CH','CI','CK','CL','CM','CN','CO','CP','CQ','CR','CU','CV','CW','CX','CY','CZ','DE','DG','DJ','DK','DM','DO','DZ','EA','EC','EE','EG','EH','ER','ES','ET','FI','FJ','FK','FM','FO','FR','GA','GB','GD','GE','GF','GG','GH','GI','GL','GM','GN','GP','GQ','GR','GS','GT','GU','GW','GY','HK','HM','HN','HR','HT','HU','IC','ID','IE','IL','IM','IN','IO','IQ','IR','IS','IT','JE','JM','JO','JP','KE','KG','KH','KI','KM','KN','KP','KR','KW','KY','KZ','LA','LB','LC','LI','LK','LR','LS','LT','LU','LV','LY','MA','MC','MD','ME','MF','MG','MH','MK','ML','MM','MN','MO','MP','MQ','MR','MS','MT','MU','MV','MW','MX','MY','MZ','NA','NC','NE','NF','NG','NI','NL','NO','NP','NR','NU','NZ','OM','PA','PE','PF','PG','PH','PK','PL','PM','PN','PR','PS','PT','PW','PY','QA','RE','RO','RS','RU','RW','SA','SB','SC','SD','SE','SG','SH','SI','SJ','SK','SL','SM','SN','SO','SR','SS','ST','SV','SX','SY','SZ','TA','TC','TD','TF','TG','TH','TJ','TK','TL','TM','TN','TO','TR','TT','TV','TW','TZ','UA','UG','UM','US','UY','UZ','VA','VC','VE','VG','VI','VN','VU','WF','WS','XK','YE','YT','ZA','ZM','ZW']))or p_country is null then raise exception 'country_required' using errcode='23514';end if;
 -- A failed/unauthorized upgrade rolls this change back along with the original function.
 update public.profiles set country=p_country where id=auth.uid() and is_guest;
 perform public.complete_guest_registration(p_username);
end $$;
revoke all on function public.complete_guest_registration(text,text)from public,anon;
grant execute on function public.complete_guest_registration(text,text)to authenticated;
