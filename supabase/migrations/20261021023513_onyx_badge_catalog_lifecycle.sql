-- Retain global badge artwork and names when the editing administrator deletes their account.
-- The profile FK keeps ON DELETE CASCADE; detach the optional audit reference before that cascade.
alter table public.badge_catalog add column customized boolean not null default false;
update public.badge_catalog set customized=true where edited_by is not null;
create function private.badge_catalog_customized() returns trigger language plpgsql set search_path='' as $$
begin
 if new.name is distinct from old.name or new.description is distinct from old.description or new.image is distinct from old.image then new.customized:=true;end if;
 return new;
end $$;
create trigger badge_catalog_customized before update on public.badge_catalog for each row execute function private.badge_catalog_customized();
create function private.preserve_badge_catalog() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.badge_catalog set edited_by=null where edited_by=old.id;
 return old;
end $$;
create trigger preserve_badge_catalog before delete on public.profiles for each row execute function private.preserve_badge_catalog();
revoke all on function private.badge_catalog_customized(),private.preserve_badge_catalog() from public,anon,authenticated;
