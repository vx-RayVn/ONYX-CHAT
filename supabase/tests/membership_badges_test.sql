-- Transaction-only Auth/profile fixtures. No sign-in, mail or persistent account.
begin;
create temp table early_sequence_baseline as select last_value,is_called from public.member_number_seq;
-- Boundary fixtures deliberately reuse numbers belonging to real members.
-- Remove only this constraint inside the rolled-back transaction; real rows,
-- their numbers and the real sequence are never changed. ROLLBACK restores it.
alter table public.profiles drop constraint profiles_member_number_key;
create temp table early_results(name text,ok boolean);
create function pg_temp.early_check(p_name text,p_ok boolean) returns void language sql as $$
 insert into early_results values(p_name,coalesce(p_ok,false))
$$;

select pg_temp.early_check('Tier boundary '||coalesce(n::text,'null'),private.early_member_badge(n) is not distinct from expected)
from (values(null::bigint,null::text),(-1,null),(0,null),(1,'first-100'),(100,'first-100'),(101,'first-1000'),(1000,'first-1000'),(1001,'first-10000'),(10000,'first-10000'),(10001,null),(9223372036854775807,null)) t(n,expected);
select pg_temp.early_check('Helper is not executable by anon',not has_function_privilege('anon','private.early_member_badge(bigint)','execute'));
select pg_temp.early_check('Helper is not executable by clients',not has_function_privilege('authenticated','private.early_member_badge(bigint)','execute'));
select pg_temp.early_check('Users cannot insert earned badges',not has_table_privilege('authenticated','public.user_badges','insert'));

-- Isolate the non-transactional member allocator for guest conversion.
create or replace function private.allocate_member_number() returns bigint language sql volatile security definer set search_path='' as $$select current_setting('onyx.test_member_number')::bigint$$;
do $$declare r record;v_id uuid;v_guest uuid;v_i int:=0;v_expected text[];v_actual text[];begin
 for r in select * from(values(1,'first-100'),(100,'first-100'),(101,'first-1000'),(1000,'first-1000'),(1001,'first-10000'),(10000,'first-10000'),(10001,null)) t(n,badge) loop
  v_i:=v_i+1;v_id:=('22222222-2222-4222-8222-'||lpad(v_i::text,12,'0'))::uuid;
  v_guest:=('22222222-2222-4222-9222-'||lpad(v_i::text,12,'0'))::uuid;
  v_expected:=case when r.badge is null then '{}'::text[] else array[r.badge] end;
  -- Native registration uses the profile default; keep it off the real sequence.
  execute format('alter table public.profiles alter column member_number set default %s',r.n);
  insert into auth.users(id,email,aud,role,raw_user_meta_data)
  values(v_id,'zz-early-register-'||v_i||'@onyx.invalid','authenticated','authenticated',jsonb_build_object('username','zz_early_register_'||v_i,'country','DE'));
  select coalesce(array_agg(badge order by badge),'{}'::text[]) into v_actual from public.user_badges where user_id=v_id and badge in('first-100','first-1000','first-10000');
  perform pg_temp.early_check('Registration earned tier '||r.n,v_actual=v_expected);
  perform pg_temp.early_check('Registration shown tier '||r.n,(select badges=v_expected and member_number=r.n from public.profiles where id=v_id));
  insert into auth.users(id,aud,role,is_anonymous,raw_user_meta_data)values(v_guest,'authenticated','authenticated',true,'{"display_name":"Early badge fixture"}');
  perform pg_temp.early_check('Guest has no tier '||r.n,not exists(select 1 from public.user_badges where user_id=v_guest) and (select member_number is null from public.profiles where id=v_guest));
  update auth.users set is_anonymous=false,email='zz-early-upgrade-'||v_i||'@onyx.invalid',email_confirmed_at=now(),encrypted_password='synthetic-test-only-not-a-password-hash' where id=v_guest;
  perform set_config('onyx.test_member_number',r.n::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_guest,'role','authenticated','is_anonymous',false)::text,true);
  set local role authenticated;
  perform public.complete_guest_registration('zz_early_upgrade_'||v_i,'DE');
  reset role;
  perform set_config('request.jwt.claims','',true);
  select coalesce(array_agg(badge order by badge),'{}'::text[]) into v_actual from public.user_badges where user_id=v_guest and badge in('first-100','first-1000','first-10000');
  perform pg_temp.early_check('Upgrade earned tier '||r.n,v_actual=v_expected);
  perform pg_temp.early_check('Upgrade shown tier and identity '||r.n,(select badges=v_expected and member_number=r.n and not is_guest and country='DE' from public.profiles where id=v_guest));
 end loop;
end $$;
alter table public.profiles alter column member_number set default nextval('public.member_number_seq');

-- Simulate an old profile with all tiers equipped between unrelated badges.
insert into public.user_badges(user_id,badge,earned_at) values
 ('22222222-2222-4222-8222-000000000001','first-1000','2026-01-01'),
 ('22222222-2222-4222-8222-000000000001','first-10000','2026-01-01'),
 ('22222222-2222-4222-8222-000000000001','creator','2026-01-02'),
 ('22222222-2222-4222-8222-000000000001','verified','2026-01-03');
update public.profiles set badges=array['creator','first-10000','first-100','verified','first-1000'] where id='22222222-2222-4222-8222-000000000001';
create temp table early_earned_before as select * from public.user_badges where user_id='22222222-2222-4222-8222-000000000001';

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


select pg_temp.early_check('Old extra tiers removed',not exists(select 1 from public.user_badges where user_id='22222222-2222-4222-8222-000000000001' and badge in('first-1000','first-10000')));
select pg_temp.early_check('Other equipped rewards retain their exact order',(select badges=array['creator','first-100','verified'] from public.profiles where id='22222222-2222-4222-8222-000000000001'));
select pg_temp.early_check('Remaining rewards and timestamps preserved',not exists(select 1 from early_earned_before b where b.badge not in('first-1000','first-10000') and not exists(select 1 from public.user_badges a where a.user_id=b.user_id and a.badge=b.badge and a.earned_at=b.earned_at)));
select pg_temp.early_check('No profile retains multiple early tiers',not exists(select 1 from public.user_badges where badge in('first-100','first-1000','first-10000') group by user_id having count(*)>1));
select pg_temp.early_check('Real member sequence untouched',s.last_value=b.last_value and s.is_called=b.is_called) from public.member_number_seq s cross join early_sequence_baseline b;
select count(*) total,count(*) filter(where ok) passed,jsonb_agg(name) filter(where not ok) failed from early_results;
rollback;
