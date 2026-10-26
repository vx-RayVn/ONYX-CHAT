create table public.bug_reports (
 id uuid primary key default gen_random_uuid(),
 reporter_id uuid not null references public.profiles(id) on delete cascade,
 category text not null check(category in ('general','mobile','voice','security','account')),
 title text not null check(char_length(btrim(title)) between 8 and 120 and title !~ '[[:cntrl:]]'),
 description text not null check(char_length(btrim(description)) between 20 and 6000),
 environment text not null default '' check(char_length(environment)<=200 and environment !~ '[[:cntrl:]]'),
 status text not null default 'open' check(status in ('open','triaged','resolved')),
 reply text not null default '' check(char_length(reply)<=2000),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index bug_reports_reporter_created_idx on public.bug_reports(reporter_id,created_at desc,id desc);
create index bug_reports_status_created_idx on public.bug_reports(status,created_at desc,id desc);
alter table public.bug_reports enable row level security;
revoke all on public.bug_reports from public,anon,authenticated;
grant select on public.bug_reports to authenticated;
grant insert(id,reporter_id,category,title,description,environment) on public.bug_reports to authenticated;
grant update(status,reply) on public.bug_reports to authenticated;
grant all on public.bug_reports to service_role;
create policy "bug reports: reporter or team" on public.bug_reports for select to authenticated
 using(reporter_id=(select auth.uid()) or (select private.is_platform_admin()));
create policy "bug reports: own submission" on public.bug_reports for insert to authenticated
 with check(reporter_id=(select auth.uid()) and not (select private.is_platform_banned()));
create policy "bug reports: team updates" on public.bug_reports for update to authenticated
 using((select private.is_platform_admin()) and not (select private.is_platform_banned()))
 with check((select private.is_platform_admin()) and not (select private.is_platform_banned()));
create trigger block_suspended_writes before insert or update or delete on public.bug_reports for each statement execute function private.block_suspended_writes();

create function private.guard_bug_report() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='INSERT' then
  perform pg_advisory_xact_lock(hashtextextended('bug-report:'||new.reporter_id::text,0));
  if (select count(*) from public.bug_reports where reporter_id=new.reporter_id and created_at>now()-interval '1 hour')>=5 then raise exception 'bug report rate limited';end if;
 else new.updated_at:=now();end if;
 return new;
end $$;
revoke all on function private.guard_bug_report() from public,anon,authenticated;
create trigger guard_bug_report before insert or update on public.bug_reports for each row execute function private.guard_bug_report();

create function public.submit_bug_report(p_id uuid,p_category text,p_title text,p_description text,p_environment text default '') returns uuid
language plpgsql security invoker set search_path='' as $$
declare v_id uuid;
begin
 if auth.uid() is null or private.is_platform_banned() then raise exception 'not allowed' using errcode='42501';end if;
 if p_id is null then raise exception 'invalid report';end if;
 perform pg_advisory_xact_lock(hashtextextended('bug-report:'||auth.uid()::text,0));
 select id into v_id from public.bug_reports where id=p_id and reporter_id=auth.uid();
 if v_id is not null then return v_id;end if;
 insert into public.bug_reports(id,reporter_id,category,title,description,environment)
 values(p_id,auth.uid(),p_category,btrim(p_title),btrim(p_description),btrim(coalesce(p_environment,''))) on conflict(id) do nothing returning id into v_id;
 if v_id is null then raise exception 'invalid report';end if;
 return v_id;
end $$;
create function public.set_bug_report_status(p_id uuid,p_status text,p_reply text default '') returns void
language plpgsql security invoker set search_path='' as $$
begin
 if not private.is_platform_admin() or private.is_platform_banned() then raise exception 'not allowed' using errcode='42501';end if;
 update public.bug_reports set status=p_status,reply=coalesce(p_reply,'') where id=p_id;
 if not found then raise exception 'report unavailable';end if;
end $$;
revoke all on function public.submit_bug_report(uuid,text,text,text,text),public.set_bug_report_status(uuid,text,text) from public,anon;
grant execute on function public.submit_bug_report(uuid,text,text,text,text),public.set_bug_report_status(uuid,text,text) to authenticated;
