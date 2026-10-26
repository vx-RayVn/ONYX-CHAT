-- ONYX – Moderation, Ergänzung für die Benachrichtigungen
--
-- Die Tabellen notification_settings und push_subscriptions kamen parallel
-- (Migrationen onyx_notification_settings / onyx_web_push) dazu.
-- 1. ONYX-weit gesperrte Konten schreiben auch dort nichts (derselbe
--    Statement-Trigger wie auf allen anderen Tabellen) – auch kein neues
--    Push-Abo über push_subscribe().
-- 2. Sperren löscht die Push-Abos des Kontos. Sonst bekäme ein gesperrtes
--    Konto weiter Benachrichtigungen mit Nachrichteninhalten aufs Gerät.
-- Beides nur, wenn die Tabellen existieren (die Migration bleibt so auch in
-- einem Projekt ohne Push lauffähig).

do $$
declare
  t text;
begin
  foreach t in array array['notification_settings', 'push_subscriptions'] loop
    if to_regclass('public.' || t) is not null
       and not exists (select 1 from pg_trigger g where g.tgrelid = ('public.' || t)::regclass and g.tgname = 'block_suspended_writes') then
      execute format(
        'create trigger block_suspended_writes before insert or update or delete on public.%I for each statement execute function private.block_suspended_writes()',
        t
      );
    end if;
  end loop;
end;
$$;

-- Wie in 20261019141838_onyx_moderation, beim Sperren zusätzlich: Push-Abos löschen.
create or replace function public.platform_moderate(p_admin uuid, p_target uuid, p_action text, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_ban public.platform_bans;
begin
  if p_admin is null or not exists (select 1 from private.platform_admins a where a.user_id = p_admin) then
    raise exception 'not a platform admin' using errcode = '42501';
  end if;
  if p_target is null or not exists (select 1 from public.profiles p where p.id = p_target) then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  if p_target = p_admin then
    raise exception 'admins cannot suspend themselves' using errcode = '22023';
  end if;
  if exists (select 1 from private.platform_admins a where a.user_id = p_target) then
    raise exception 'platform admins cannot be suspended' using errcode = '22023';
  end if;

  if p_action = 'check' then
    return jsonb_build_object('ok', true, 'suspended', exists (select 1 from public.platform_bans b where b.user_id = p_target and b.lifted_at is null));
  elsif p_action = 'ban' then
    select * into v_ban from public.platform_bans b where b.user_id = p_target and b.lifted_at is null;
    if not found then
      insert into public.platform_bans (user_id, reason, banned_by)
      values (p_target, nullif(btrim(coalesce(p_reason, '')), ''), p_admin)
      returning * into v_ban;
    end if;
    -- Alle Sitzungen beenden (die Refresh-Tokens hängen daran, on delete cascade).
    delete from auth.sessions s where s.user_id = p_target;
    delete from auth.refresh_tokens r where r.user_id = p_target::text;
    -- Keine Push-Benachrichtigungen mehr an die Geräte des Kontos.
    if to_regclass('public.push_subscriptions') is not null then
      execute 'delete from public.push_subscriptions where user_id = $1' using p_target;
    end if;
    -- Offene Tabs abmelden. Geht erst nach dem Commit raus; ein Fehler hier darf die Sperre nicht verhindern.
    begin
      perform realtime.send(jsonb_build_object('reason', v_ban.reason, 'at', v_ban.created_at), 'suspended', 'account:' || p_target::text, true);
    exception when others then
      raise warning 'onyx: realtime signal failed: %', sqlerrm;
    end;
  elsif p_action = 'unban' then
    update public.platform_bans b set lifted_at = now(), lifted_by = p_admin
    where b.user_id = p_target and b.lifted_at is null
    returning * into v_ban;
  else
    raise exception 'unknown action' using errcode = '22023';
  end if;
  return to_jsonb(v_ban);
end;
$$;

revoke execute on function public.platform_moderate(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.platform_moderate(uuid, uuid, text, text) to service_role;
