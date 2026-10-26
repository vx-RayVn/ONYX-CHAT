-- Verified identities; client writes stay limited to own visibility/removal.
alter table public.profile_connections drop constraint profile_connections_provider_check;
alter table public.profile_connections drop constraint profile_connections_external_id_check;
alter table public.profile_connections add constraint profile_connections_provider_check check(provider in ('steam','twitch','youtube','spotify','epic','xbox','riot'));
alter table public.profile_connections add constraint profile_connections_external_id_check check(char_length(external_id) between 1 and 128 and external_id !~ '[[:cntrl:]]' and (provider<>'steam' or external_id ~ '^[0-9]{17}$'));
alter table public.profile_connections add column display_name text check(char_length(display_name)<=100 and display_name !~ '[[:cntrl:]]');
alter table public.profile_connections add column profile_handle text check(char_length(profile_handle) between 1 and 128 and profile_handle !~ '[[:cntrl:]]');
create table private.social_challenges (
 user_id uuid not null references public.profiles(id) on delete cascade,
 provider text not null check(provider in ('steam','twitch','youtube','spotify','epic','xbox','riot')),
 state_hash text not null unique check(state_hash ~ '^[a-f0-9]{64}$'),binding_hash text not null check(binding_hash ~ '^[a-f0-9]{64}$'),
 code_verifier text check(code_verifier ~ '^[A-Za-z0-9_-]{43,128}$'),
 return_origin text not null check(return_origin in ('https://onyxchat.site','http://localhost:5173','http://127.0.0.1:5173')),
 created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '10 minutes',
 claimed_at timestamptz,receipt_hash text unique check(receipt_hash ~ '^[a-f0-9]{64}$'),external_id text,display_name text,profile_handle text,completed_at timestamptz,
 primary key(user_id,provider)
);
create index social_challenges_expiry_idx on private.social_challenges(expires_at);
alter table private.social_challenges enable row level security;
revoke all on private.social_challenges from public,anon,authenticated;
grant usage on schema private to service_role;
grant select,insert,update,delete on private.social_challenges to service_role;
-- Service-only APIs: Auth is checked by the Edge Function before it supplies p_user.
create function public.social_start(p_user uuid,p_provider text,p_state_hash text,p_binding_hash text,p_verifier text,p_origin text) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if p_user is null or not exists(select 1 from public.profiles where id=p_user) then raise exception 'unauthorized' using errcode='42501';end if;
 if exists(select 1 from public.platform_bans where user_id=p_user and lifted_at is null) then raise exception 'account suspended' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('social-start:'||p_user::text,0));
 if exists(select 1 from private.social_challenges where user_id=p_user and created_at>now()-interval '5 seconds') then raise exception 'rate limited';end if;
 delete from private.social_challenges where expires_at<now();
 insert into private.social_challenges(user_id,provider,state_hash,binding_hash,code_verifier,return_origin) values(p_user,p_provider,p_state_hash,p_binding_hash,p_verifier,p_origin)
 on conflict(user_id,provider) do update set state_hash=excluded.state_hash,binding_hash=excluded.binding_hash,code_verifier=excluded.code_verifier,
 return_origin=excluded.return_origin,created_at=now(),expires_at=now()+interval '10 minutes',claimed_at=null,receipt_hash=null,external_id=null,display_name=null,profile_handle=null,completed_at=null;
end $$;
create function public.social_claim(p_hash text,p_provider text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v private.social_challenges;
begin
 update private.social_challenges set claimed_at=now() where state_hash=p_hash and provider=p_provider and claimed_at is null and expires_at>now() returning * into v;
 if v.user_id is null then raise exception 'invalid state';end if;
 if exists(select 1 from public.platform_bans where user_id=v.user_id and lifted_at is null) then raise exception 'account suspended' using errcode='42501';end if;
 return jsonb_build_object('origin',v.return_origin,'verifier',v.code_verifier);
end $$;
create function public.social_verify(p_hash text,p_receipt text,p_external_id text,p_display_name text,p_handle text) returns void
language plpgsql security invoker set search_path='' as $$
begin
 update private.social_challenges set receipt_hash=p_receipt,external_id=p_external_id,display_name=p_display_name,profile_handle=p_handle,code_verifier=null
 where state_hash=p_hash and claimed_at is not null and receipt_hash is null and expires_at>now()
 and not exists(select 1 from public.platform_bans b where b.user_id=social_challenges.user_id and b.lifted_at is null);
 if not found then raise exception 'invalid state';end if;
end $$;
create function public.social_finish(p_user uuid,p_hash text,p_binding text,p_receipt text) returns text
language plpgsql security invoker set search_path='' as $$
declare v private.social_challenges;
begin
 select * into v from private.social_challenges where user_id=p_user and state_hash=p_hash and binding_hash=p_binding and receipt_hash=p_receipt and expires_at>now() for update;
 if v.external_id is null then raise exception 'invalid state';end if;
 if exists(select 1 from public.platform_bans where user_id=p_user and lifted_at is null) then raise exception 'account suspended' using errcode='42501';end if;
 if v.completed_at is not null then
  if exists(select 1 from public.profile_connections where user_id=p_user and provider=v.provider and external_id=v.external_id) then return v.provider;end if;
  raise exception 'invalid state';
 end if;
 insert into public.profile_connections(user_id,provider,external_id,display_name,profile_handle) values(p_user,v.provider,v.external_id,v.display_name,v.profile_handle)
 on conflict(user_id,provider) do update set external_id=excluded.external_id,display_name=excluded.display_name,profile_handle=excluded.profile_handle,
 is_visible=case when profile_connections.external_id=excluded.external_id then profile_connections.is_visible else false end,created_at=now();
 update private.social_challenges set completed_at=now() where user_id=p_user and provider=v.provider;
 return v.provider;
end $$;
create function public.social_disconnect(p_user uuid,p_provider text) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from public.platform_bans where user_id=p_user and lifted_at is null) then raise exception 'account suspended' using errcode='42501';end if;
 delete from private.social_challenges where user_id=p_user and provider=p_provider;
 delete from public.profile_connections where user_id=p_user and provider=p_provider;
end $$;
revoke all on function public.social_start(uuid,text,text,text,text,text),public.social_claim(text,text),public.social_verify(text,text,text,text,text),public.social_finish(uuid,text,text,text),public.social_disconnect(uuid,text) from public,anon,authenticated;
grant execute on function public.social_start(uuid,text,text,text,text,text),public.social_claim(text,text),public.social_verify(text,text,text,text,text),public.social_finish(uuid,text,text,text),public.social_disconnect(uuid,text) to service_role;
-- Retire the old unbound completion path; existing verified Steam links are retained.
revoke execute on function public.connection_start(text,text) from authenticated;
revoke execute on function public.connection_complete(text,text),public.connection_pending(text) from service_role;
