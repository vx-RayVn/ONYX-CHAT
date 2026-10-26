-- ONYX – Tests für Moderation (Migrationen 20261019141838_onyx_moderation und 20261019233312_onyx_moderation_push)
--
-- Läuft komplett in EINER Transaktion und wird am Ende zurückgerollt: es
-- bleiben keine Konten, Server, Sperren oder Meldungen übrig. Testkonten sind
-- erfundene Zeilen in auth.users (…@onyx.invalid), die nie committet werden.
-- Lucas Konto wird nur gelesen (Admin-Sicht), nie gesperrt. Das Realtime-
-- Signal der Test-Sperre geht nie raus (es wird erst nach einem Commit gesendet).
--
-- Ausgabe: eine Zeile pro Prüfung (ok = true/false). Ausführen im SQL-Editor
-- oder per MCP execute_sql.
--
-- Sequenzen sind nicht transaktional: die Mitgliedsnummern, die die Testkonten
-- verbrauchen, setzt der Schluss wieder zurück (setval).

begin;

create temp table t_res (n serial primary key, name text, ok boolean, detail text) on commit drop;
grant all on t_res to authenticated, anon, service_role;
grant usage on sequence t_res_n_seq to authenticated, anon, service_role;

/**
 * Führt p_sql als p_user (Rolle p_role) aus.
 * p_expect: 'ok' = kein Fehler | '=wert' = Ergebnis muss wert sein | sonst: Fehlertext muss das enthalten.
 */
create function pg_temp.t(p_name text, p_user uuid, p_sql text, p_expect text, p_role text default 'authenticated') returns void
language plpgsql as $$
declare
  v text;
begin
  begin
    perform set_config('request.jwt.claims', case when p_user is null then '' else json_build_object('sub', p_user, 'role', p_role)::text end, true);
    execute format('set local role %I', p_role);
    execute p_sql into v;
    reset role;
    perform set_config('request.jwt.claims', '', true);
    insert into t_res (name, ok, detail)
    values (p_name, p_expect = 'ok' or (p_expect like '=%' and v is not distinct from substr(p_expect, 2)), 'result: ' || coalesce(v, 'null'));
  exception when others then
    insert into t_res (name, ok, detail)
    values (p_name, p_expect <> 'ok' and p_expect not like '=%' and sqlerrm ilike '%' || p_expect || '%', 'error: ' || sqlerrm);
  end;
end;
$$;

/* ------------------------------------------------------------------ */
/* Testdaten                                                            */
/* ------------------------------------------------------------------ */

-- a0 Inhaber, a1 Mod M (Rang 2, bannen), a2 Mod L (Rang 1, bannen), a3 X und a4 W ohne Rolle,
-- a5 Y (Rang 3, über M), a6 Z (kein Mitglied), a7 B (wird ONYX-weit gesperrt), a8 zweiter Admin.
insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000a0', 'zz-owner@onyx.invalid', 'authenticated', 'authenticated', '{"username":"zz_owner"}'),
  ('00000000-0000-4000-8000-0000000000a1', 'zz-mod@onyx.invalid', 'authenticated', 'authenticated', '{"username":"zz_mod"}'),
  ('00000000-0000-4000-8000-0000000000a2', 'zz-low@onyx.invalid', 'authenticated', 'authenticated', '{"username":"zz_low"}'),
  ('00000000-0000-4000-8000-0000000000a3', 'zz-x@onyx.invalid', 'authenticated', 'authenticated', '{"username":"zz_x"}'),
  ('00000000-0000-4000-8000-0000000000a4', 'zz-w@onyx.invalid', 'authenticated', 'authenticated', '{"username":"zz_w"}'),
  ('00000000-0000-4000-8000-0000000000a5', 'zz-y@onyx.invalid', 'authenticated', 'authenticated', '{"username":"zz_y"}'),
  ('00000000-0000-4000-8000-0000000000a6', 'zz-z@onyx.invalid', 'authenticated', 'authenticated', '{"username":"zz_z"}'),
  ('00000000-0000-4000-8000-0000000000a7', 'zz-b@onyx.invalid', 'authenticated', 'authenticated', '{"username":"zz_b"}'),
  ('00000000-0000-4000-8000-0000000000a8', 'zz-admin2@onyx.invalid', 'authenticated', 'authenticated', '{"username":"zz_admin2"}');

insert into public.servers (id, name, owner_id) values ('00000000-0000-4000-8000-0000000000b0', 'Testserver', '00000000-0000-4000-8000-0000000000a0');
insert into public.roles (id, server_id, name, position, permissions, is_default) values
  ('00000000-0000-4000-8000-0000000000c0', '00000000-0000-4000-8000-0000000000b0', '@everyone', 0, '{viewChannel,readHistory,sendMessages}', true),
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b0', 'Low', 1, '{banMembers}', false),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000b0', 'Mods', 2, '{banMembers}', false),
  ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-0000000000b0', 'High', 3, '{}', false);
insert into public.server_members (server_id, user_id)
select '00000000-0000-4000-8000-0000000000b0', u from unnest(array[
  '00000000-0000-4000-8000-0000000000a0', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2',
  '00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-0000000000a5',
  '00000000-0000-4000-8000-0000000000a7'
]::uuid[]) u;
insert into public.member_roles (server_id, user_id, role_id) values
  ('00000000-0000-4000-8000-0000000000b0', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000c1'),
  ('00000000-0000-4000-8000-0000000000b0', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c2'),
  ('00000000-0000-4000-8000-0000000000b0', '00000000-0000-4000-8000-0000000000a5', '00000000-0000-4000-8000-0000000000c3');
insert into public.channels (id, server_id, name) values ('00000000-0000-4000-8000-0000000000d0', '00000000-0000-4000-8000-0000000000b0', 'general');
insert into public.invites (code, server_id, inviter_id) values ('zz-test-invite', '00000000-0000-4000-8000-0000000000b0', '00000000-0000-4000-8000-0000000000a0');
-- 12 Nachrichten von X (die erste mit Anhang) für die Meldungen
insert into public.messages (id, channel_id, author_id, content)
select ('00000000-0000-4000-8000-0000000001' || lpad(i::text, 2, '0'))::uuid, '00000000-0000-4000-8000-0000000000d0', '00000000-0000-4000-8000-0000000000a3', 'Testnachricht ' || i
from generate_series(1, 12) i;
update public.messages
set attachments = '[{"id":"f1","name":"bild.png","kind":"image","size":10,"path":"channels/00000000-0000-4000-8000-0000000000d0/00000000-0000-4000-8000-000000000101/f1.png"}]'
where id = '00000000-0000-4000-8000-000000000101';
-- Nachricht von W (zum Test "eigene Nachricht melden")
insert into public.messages (id, channel_id, author_id, content) values ('00000000-0000-4000-8000-0000000001f0', '00000000-0000-4000-8000-0000000000d0', '00000000-0000-4000-8000-0000000000a4', 'Von W');
-- DM zwischen X und Y (Z ist nicht dabei)
insert into public.dm_channels (id, type, dm_key) values ('00000000-0000-4000-8000-0000000000e0', 'dm', '00000000-0000-4000-8000-0000000000a3:00000000-0000-4000-8000-0000000000a5');
insert into public.dm_participants (dm_id, user_id) values
  ('00000000-0000-4000-8000-0000000000e0', '00000000-0000-4000-8000-0000000000a3'),
  ('00000000-0000-4000-8000-0000000000e0', '00000000-0000-4000-8000-0000000000a5');
insert into public.messages (id, dm_id, author_id, content) values ('00000000-0000-4000-8000-0000000002f0', '00000000-0000-4000-8000-0000000000e0', '00000000-0000-4000-8000-0000000000a3', 'DM von X');
-- Zweiter Admin (nur für "Admins sperren keine Admins")
insert into private.platform_admins (user_id, note) values ('00000000-0000-4000-8000-0000000000a8', 'Test');
-- Sitzung + Refresh-Token von B (müssen beim Sperren verschwinden)
insert into auth.sessions (id, user_id) values ('00000000-0000-4000-8000-0000000000f0', '00000000-0000-4000-8000-0000000000a7');
insert into auth.refresh_tokens (token, user_id, session_id, revoked) values ('zz-test-refresh-token', '00000000-0000-4000-8000-0000000000a7', '00000000-0000-4000-8000-0000000000f0', false);
-- Push-Abo von B (muss beim Sperren verschwinden; Tabelle aus der Migration onyx_web_push)
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ('00000000-0000-4000-8000-0000000000a7', 'https://push.invalid/zz-test', repeat('A', 87), repeat('B', 22));

/* ------------------------------------------------------------------ */
/* 1. Server-Banns                                                      */
/* ------------------------------------------------------------------ */

select pg_temp.t('Bann: L (Rang 1) kann M (Rang 2) nicht bannen', '00000000-0000-4000-8000-0000000000a2',
  $q$insert into public.server_bans (server_id, user_id) values ('00000000-0000-4000-8000-0000000000b0', '00000000-0000-4000-8000-0000000000a1') returning 'x'$q$, 'row-level security');
select pg_temp.t('Bann: M kann Höherrangigen Y (Rang 3) nicht bannen', '00000000-0000-4000-8000-0000000000a1',
  $q$insert into public.server_bans (server_id, user_id) values ('00000000-0000-4000-8000-0000000000b0', '00000000-0000-4000-8000-0000000000a5') returning 'x'$q$, 'row-level security');
select pg_temp.t('Bann: M kann den Inhaber nicht bannen', '00000000-0000-4000-8000-0000000000a1',
  $q$insert into public.server_bans (server_id, user_id) values ('00000000-0000-4000-8000-0000000000b0', '00000000-0000-4000-8000-0000000000a0') returning 'x'$q$, 'row-level security');
select pg_temp.t('Bann: ohne Recht "Mitglieder bannen" (W) geht nichts', '00000000-0000-4000-8000-0000000000a4',
  $q$insert into public.server_bans (server_id, user_id) values ('00000000-0000-4000-8000-0000000000b0', '00000000-0000-4000-8000-0000000000a3') returning 'x'$q$, 'row-level security');
select pg_temp.t('Bann: niemand bannt sich selbst', '00000000-0000-4000-8000-0000000000a1',
  $q$insert into public.server_bans (server_id, user_id) values ('00000000-0000-4000-8000-0000000000b0', '00000000-0000-4000-8000-0000000000a1') returning 'x'$q$, 'row-level security');
select pg_temp.t('Bann: banned_by lässt sich nicht mitschicken (keine Spaltenrechte)', '00000000-0000-4000-8000-0000000000a2',
  $q$insert into public.server_bans (server_id, user_id, banned_by) values ('00000000-0000-4000-8000-0000000000b0', '00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000a0') returning 'x'$q$, 'permission denied');
select pg_temp.t('Bann: L (Rang 1) bannt X (ohne Rolle) mit Grund', '00000000-0000-4000-8000-0000000000a2',
  $q$insert into public.server_bans (server_id, user_id, reason) values ('00000000-0000-4000-8000-0000000000b0', '00000000-0000-4000-8000-0000000000a3', '  Spam  ') returning 'x'$q$, 'ok');
select pg_temp.t('Bann: Server setzt banned_by und trimmt den Grund', null,
  $q$select banned_by::text || '|' || reason from public.server_bans where user_id = '00000000-0000-4000-8000-0000000000a3'$q$, '=00000000-0000-4000-8000-0000000000a2|Spam', 'postgres');
select pg_temp.t('Bann: X ist kein Mitglied mehr', null,
  $q$select count(*)::text from public.server_members where server_id = '00000000-0000-4000-8000-0000000000b0' and user_id = '00000000-0000-4000-8000-0000000000a3'$q$, '=0', 'postgres');
select pg_temp.t('Bann: X sieht den Server nicht mehr', '00000000-0000-4000-8000-0000000000a3',
  $q$select count(*)::text from public.servers where id = '00000000-0000-4000-8000-0000000000b0'$q$, '=0');
select pg_temp.t('Bann: Gebannter X kann per Einladung nicht beitreten', '00000000-0000-4000-8000-0000000000a3',
  $q$select public.join_server_by_invite('zz-test-invite')::text$q$, 'banned from this server');
select pg_temp.t('Bann-Liste: W (ohne Recht) sieht keine Banns', '00000000-0000-4000-8000-0000000000a4',
  $q$select count(*)::text from public.server_bans$q$, '=0');
select pg_temp.t('Bann-Liste: Nicht-Mitglied Z sieht keine Banns', '00000000-0000-4000-8000-0000000000a6',
  $q$select count(*)::text from public.server_bans$q$, '=0');
select pg_temp.t('Bann-Liste: M (mit Recht) sieht den Bann', '00000000-0000-4000-8000-0000000000a1',
  $q$select count(*)::text from public.server_bans where server_id = '00000000-0000-4000-8000-0000000000b0'$q$, '=1');
select pg_temp.t('Entbannen: W (ohne Recht) entfernt nichts', '00000000-0000-4000-8000-0000000000a4',
  $q$with d as (delete from public.server_bans where user_id = '00000000-0000-4000-8000-0000000000a3' returning 1) select count(*)::text from d$q$, '=0');
select pg_temp.t('Entbannen: M entbannt X', '00000000-0000-4000-8000-0000000000a1',
  $q$with d as (delete from public.server_bans where user_id = '00000000-0000-4000-8000-0000000000a3' returning 1) select count(*)::text from d$q$, '=1');
select pg_temp.t('Entbannen: X kann wieder beitreten', '00000000-0000-4000-8000-0000000000a3',
  $q$select public.join_server_by_invite('zz-test-invite')::text$q$, '=00000000-0000-4000-8000-0000000000b0');

/* ------------------------------------------------------------------ */
/* 2. ONYX-weite Sperren                                                */
/* ------------------------------------------------------------------ */

select pg_temp.t('Admin-Status: W ist kein Admin', '00000000-0000-4000-8000-0000000000a4',
  $q$select public.account_status()->>'admin'$q$, '=false');
select pg_temp.t('Admin-Status: rayvn ist Admin', '2a97c679-6b57-4604-9fe1-fea9e7b3f129',
  $q$select public.account_status()->>'admin'$q$, '=true');
select pg_temp.t('platform_admins: für Angemeldete nicht lesbar', '00000000-0000-4000-8000-0000000000a4',
  $q$select count(*)::text from private.platform_admins$q$, 'permission denied');
select pg_temp.t('Sperr-Function: platform_moderate für Angemeldete gesperrt', '00000000-0000-4000-8000-0000000000a4',
  $q$select public.platform_moderate('00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-0000000000a3', 'ban')::text$q$, 'permission denied');
select pg_temp.t('Sperr-Function: platform_moderate für anon gesperrt', null,
  $q$select public.platform_moderate('2a97c679-6b57-4604-9fe1-fea9e7b3f129', '00000000-0000-4000-8000-0000000000a3', 'ban')::text$q$, 'permission denied', 'anon');
select pg_temp.t('Sperr-Function (403-Pfad): Nicht-Admin als Aufrufer abgewiesen', null,
  $q$select public.platform_moderate('00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-0000000000a3', 'check')::text$q$, 'not a platform admin', 'service_role');
select pg_temp.t('Sperr-Function: Admin kann sich nicht selbst sperren', null,
  $q$select public.platform_moderate('2a97c679-6b57-4604-9fe1-fea9e7b3f129', '2a97c679-6b57-4604-9fe1-fea9e7b3f129', 'ban')::text$q$, 'cannot suspend themselves', 'service_role');
select pg_temp.t('Sperr-Function: Admin kann keinen anderen Admin sperren', null,
  $q$select public.platform_moderate('2a97c679-6b57-4604-9fe1-fea9e7b3f129', '00000000-0000-4000-8000-0000000000a8', 'ban')::text$q$, 'cannot be suspended', 'service_role');
select pg_temp.t('Sperr-Function: unbekanntes Konto → user not found', null,
  $q$select public.platform_moderate('2a97c679-6b57-4604-9fe1-fea9e7b3f129', '00000000-0000-4000-8000-00000000ffff', 'check')::text$q$, 'user not found', 'service_role');
select pg_temp.t('platform_bans: kein direktes Schreiben für Angemeldete', '00000000-0000-4000-8000-0000000000a4',
  $q$insert into public.platform_bans (user_id) values ('00000000-0000-4000-8000-0000000000a3') returning 'x'$q$, 'permission denied');
select pg_temp.t('Vor der Sperre: B kann schreiben', '00000000-0000-4000-8000-0000000000a7',
  $q$insert into public.messages (channel_id, author_id, content) values ('00000000-0000-4000-8000-0000000000d0', '00000000-0000-4000-8000-0000000000a7', 'vorher') returning 'x'$q$, 'ok');
-- B verlässt den Server (damit join_server_by_invite unten wirklich schreiben müsste).
delete from public.server_members where user_id = '00000000-0000-4000-8000-0000000000a7';
-- Realtime-Kanal für die Sende-Prüfungen (wie ihn Realtime beim Senden setzt).
select set_config('realtime.topic', 'onyx:presence', true);
select pg_temp.t('Vor der Sperre: Realtime senden (Präsenz) erlaubt', '00000000-0000-4000-8000-0000000000a4',
  $q$insert into realtime.messages (topic, extension, event, payload, private) values ('onyx:presence', 'presence', 'test', '{}', true) returning 'x'$q$, 'ok');
select pg_temp.t('Sperren: rayvn sperrt Testkonto B (nur in dieser Transaktion)', null,
  $q$select public.platform_moderate('2a97c679-6b57-4604-9fe1-fea9e7b3f129', '00000000-0000-4000-8000-0000000000a7', 'ban', '  Test-Grund ')->>'reason'$q$, '=Test-Grund', 'service_role');
select pg_temp.t('Sperren: Sitzungen und Refresh-Tokens von B sind weg', null,
  $q$select ((select count(*) from auth.sessions where user_id = '00000000-0000-4000-8000-0000000000a7') + (select count(*) from auth.refresh_tokens where user_id = '00000000-0000-4000-8000-0000000000a7'))::text$q$, '=0', 'postgres');
select pg_temp.t('Sperren: Push-Abos von B sind gelöscht', null,
  $q$select count(*)::text from public.push_subscriptions where user_id = '00000000-0000-4000-8000-0000000000a7'$q$, '=0', 'postgres');
select pg_temp.t('Sperren: Realtime-Signal für account:<B> ist eingereiht', null,
  $q$select count(*)::text from realtime.messages where topic = 'account:00000000-0000-4000-8000-0000000000a7' and event = 'suspended'$q$, '=1', 'postgres');
select pg_temp.t('Sperren: erneutes Sperren bleibt bei einer aktiven Sperre', null,
  $q$select (public.platform_moderate('2a97c679-6b57-4604-9fe1-fea9e7b3f129', '00000000-0000-4000-8000-0000000000a7', 'ban', 'egal') is not null
     and (select count(*) from public.platform_bans where user_id = '00000000-0000-4000-8000-0000000000a7' and lifted_at is null) = 1)::text$q$, '=true', 'service_role');
select pg_temp.t('platform_bans: W (kein Admin) liest nichts', '00000000-0000-4000-8000-0000000000a4',
  $q$select count(*)::text from public.platform_bans$q$, '=0');
select pg_temp.t('platform_bans: rayvn (Admin) liest die Sperre', '2a97c679-6b57-4604-9fe1-fea9e7b3f129',
  $q$select count(*)::text from public.platform_bans where user_id = '00000000-0000-4000-8000-0000000000a7'$q$, '=1');
select pg_temp.t('Gesperrt: account_status zeigt B die Sperre mit Grund', '00000000-0000-4000-8000-0000000000a7',
  $q$select public.account_status()->'suspension'->>'reason'$q$, '=Test-Grund');
select pg_temp.t('Gesperrt: B kann keine Nachricht senden', '00000000-0000-4000-8000-0000000000a7',
  $q$insert into public.messages (channel_id, author_id, content) values ('00000000-0000-4000-8000-0000000000d0', '00000000-0000-4000-8000-0000000000a7', 'nachher') returning 'x'$q$, 'account suspended');
select pg_temp.t('Gesperrt: B kann sein Profil nicht ändern', '00000000-0000-4000-8000-0000000000a7',
  $q$update public.profiles set bio = 'x' where id = '00000000-0000-4000-8000-0000000000a7' returning 'x'$q$, 'account suspended');
select pg_temp.t('Gesperrt: B kann eigene Nachricht nicht löschen', '00000000-0000-4000-8000-0000000000a7',
  $q$with d as (delete from public.messages where author_id = '00000000-0000-4000-8000-0000000000a7' returning 1) select count(*)::text from d$q$, 'account suspended');
select pg_temp.t('Gesperrt: B kann keine Reaktion setzen', '00000000-0000-4000-8000-0000000000a7',
  $q$insert into public.reactions (message_id, user_id, emoji) values ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-0000000000a7', '👍') returning 'x'$q$, 'account suspended');
select pg_temp.t('Gesperrt: RPC create_server verweigert', '00000000-0000-4000-8000-0000000000a7',
  $q$select public.create_server('{"name":"Neu","roles":[{"name":"@everyone","isDefault":true}]}')::text$q$, 'account suspended');
select pg_temp.t('Gesperrt: RPC join_server_by_invite verweigert', '00000000-0000-4000-8000-0000000000a7',
  $q$select public.join_server_by_invite('zz-test-invite')::text$q$, 'account suspended');
select pg_temp.t('Gesperrt: RPC friend_request verweigert', '00000000-0000-4000-8000-0000000000a7',
  $q$select public.friend_request('zz_w')::text$q$, 'account suspended');
select pg_temp.t('Gesperrt: RPC user_block verweigert', '00000000-0000-4000-8000-0000000000a7',
  $q$select public.user_block('00000000-0000-4000-8000-0000000000a4')::text$q$, 'account suspended');
select pg_temp.t('Gesperrt: Gelesen-Status (upsert) verweigert', '00000000-0000-4000-8000-0000000000a7',
  $q$insert into public.read_states (user_id, scope_id, last_read_at) values ('00000000-0000-4000-8000-0000000000a7', '00000000-0000-4000-8000-0000000000d0', now()) returning 'x'$q$, 'account suspended');
select pg_temp.t('Gesperrt: Upload in den Storage verweigert', '00000000-0000-4000-8000-0000000000a7',
  $q$insert into storage.objects (bucket_id, name, owner_id) values ('media', 'users/00000000-0000-4000-8000-0000000000a7/x.png', '00000000-0000-4000-8000-0000000000a7') returning 'x'$q$, 'row-level security');
select pg_temp.t('Gesperrt: Realtime senden (Präsenz/Tippen) verweigert', '00000000-0000-4000-8000-0000000000a7',
  $q$insert into realtime.messages (topic, extension, event, payload, private) values ('onyx:presence', 'presence', 'test', '{}', true) returning 'x'$q$, 'row-level security');
select pg_temp.t('Gesperrt: kein neues Push-Abo (push_subscribe)', '00000000-0000-4000-8000-0000000000a7',
  $q$select public.push_subscribe('https://push.invalid/zz-test-2', repeat('A', 87), repeat('B', 22), 'de', true, true)::text$q$, 'account suspended');
select pg_temp.t('Gesperrt: B kann melden auch nicht', '00000000-0000-4000-8000-0000000000a7',
  $q$select public.report_user('00000000-0000-4000-8000-0000000000a4', 'spam')::text$q$, 'account suspended');
select pg_temp.t('Gesperrt: Lesen geht weiter (eigenes Profil)', '00000000-0000-4000-8000-0000000000a7',
  $q$select count(*)::text from public.profiles where id = '00000000-0000-4000-8000-0000000000a7'$q$, '=1');
select pg_temp.t('Nicht gesperrt: W schreibt normal weiter', '00000000-0000-4000-8000-0000000000a4',
  $q$insert into public.messages (channel_id, author_id, content) values ('00000000-0000-4000-8000-0000000000d0', '00000000-0000-4000-8000-0000000000a4', 'hallo') returning 'x'$q$, 'ok');
select pg_temp.t('Entsperren: rayvn hebt die Sperre von B auf', null,
  $q$select (public.platform_moderate('2a97c679-6b57-4604-9fe1-fea9e7b3f129', '00000000-0000-4000-8000-0000000000a7', 'unban')->>'lifted_by')$q$, '=2a97c679-6b57-4604-9fe1-fea9e7b3f129', 'service_role');
select pg_temp.t('Entsperren: B kann wieder schreiben', '00000000-0000-4000-8000-0000000000a7',
  $q$update public.profiles set bio = 'wieder da' where id = '00000000-0000-4000-8000-0000000000a7' returning 'x'$q$, 'ok');
select pg_temp.t('Entsperren: Verlauf bleibt (1 aufgehobene Sperre)', null,
  $q$select count(*)::text from public.platform_bans where user_id = '00000000-0000-4000-8000-0000000000a7' and lifted_at is not null$q$, '=1', 'postgres');

/* ------------------------------------------------------------------ */
/* 3. Meldungen                                                         */
/* ------------------------------------------------------------------ */

select pg_temp.t('Melden: W meldet Nachricht von X', '00000000-0000-4000-8000-0000000000a4',
  $q$select public.report_message('00000000-0000-4000-8000-000000000101', 'spam', ' nervt ')->>'status'$q$, '=created');
select pg_temp.t('Melden: Kopie enthält Text, Anhang-Pfad, Autor, Kanal, Server, Zeit', null,
  $q$select (content = 'Testnachricht 1' and attachments->0->>'path' like 'channels/%/f1.png' and target_user_id = '00000000-0000-4000-8000-0000000000a3'
     and target_username = 'zz_x' and channel_name = 'general' and server_name = 'Testserver' and message_created_at is not null and details = 'nervt')::text
     from public.reports where message_id = '00000000-0000-4000-8000-000000000101'$q$, '=true', 'postgres');
select pg_temp.t('Melden: dieselbe Nachricht nochmal → duplicate', '00000000-0000-4000-8000-0000000000a4',
  $q$select public.report_message('00000000-0000-4000-8000-000000000101', 'spam')->>'status'$q$, '=duplicate');
select pg_temp.t('Melden: eigene Nachricht geht nicht', '00000000-0000-4000-8000-0000000000a4',
  $q$select public.report_message('00000000-0000-4000-8000-0000000001f0', 'spam')::text$q$, 'cannot report your own message');
select pg_temp.t('Melden: ungültiger Grund abgewiesen', '00000000-0000-4000-8000-0000000000a4',
  $q$select public.report_message('00000000-0000-4000-8000-000000000102', 'langweilig')::text$q$, 'invalid report reason');
select pg_temp.t('Melden: fremde DM (Z ist nicht dabei) → nicht gefunden', '00000000-0000-4000-8000-0000000000a6',
  $q$select public.report_message('00000000-0000-4000-8000-0000000002f0', 'harassment')::text$q$, 'message not found');
select pg_temp.t('Melden: Nicht-Mitglied Z kann Servernachricht nicht melden', '00000000-0000-4000-8000-0000000000a6',
  $q$select public.report_message('00000000-0000-4000-8000-000000000102', 'spam')::text$q$, 'message not found');
select pg_temp.t('Melden: Y meldet DM von X', '00000000-0000-4000-8000-0000000000a5',
  $q$select public.report_message('00000000-0000-4000-8000-0000000002f0', 'harassment')->>'status'$q$, '=created');
select pg_temp.t('Melden: W meldet Konto X (Profil-Kopie)', '00000000-0000-4000-8000-0000000000a4',
  $q$select public.report_user('00000000-0000-4000-8000-0000000000a3', 'impersonation')->>'status'$q$, '=created');
select pg_temp.t('Melden: sich selbst melden geht nicht', '00000000-0000-4000-8000-0000000000a4',
  $q$select public.report_user('00000000-0000-4000-8000-0000000000a4', 'spam')::text$q$, 'cannot report yourself');
select pg_temp.t('Melden: kein direktes Insert in reports', '00000000-0000-4000-8000-0000000000a4',
  $q$insert into public.reports (kind, reason, message_id) values ('message', 'spam', '00000000-0000-4000-8000-000000000102') returning 'x'$q$, 'permission denied');
-- W hat 2 Meldungen verbraucht; 8 weitere gehen noch, die 11. in 10 Minuten nicht.
select pg_temp.t('Rate-Limit: Meldungen 3–10 von W gehen durch', '00000000-0000-4000-8000-0000000000a4',
  $q$select count(*)::text from generate_series(2, 9) i, lateral (select public.report_message(('00000000-0000-4000-8000-0000000001' || lpad(i::text, 2, '0'))::uuid, 'spam') r) x where x.r->>'status' = 'created'$q$, '=8');
select pg_temp.t('Rate-Limit: 11. Meldung in 10 Minuten wird abgewiesen', '00000000-0000-4000-8000-0000000000a4',
  $q$select public.report_message('00000000-0000-4000-8000-000000000110', 'spam')::text$q$, 'rate limited: report');
select pg_temp.t('Meldungen: W (kein Admin) liest keine', '00000000-0000-4000-8000-0000000000a4',
  $q$select count(*)::text from public.reports$q$, '=0');
select pg_temp.t('Meldungen: anon liest keine', null,
  $q$select count(*)::text from public.reports$q$, 'permission denied', 'anon');
select pg_temp.t('Meldungen: rayvn (Admin) liest die Testmeldungen', '2a97c679-6b57-4604-9fe1-fea9e7b3f129',
  $q$select count(*)::text from public.reports where reporter_id in ('00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-0000000000a5')$q$, '=11');
select pg_temp.t('Admin-RPC: W darf Status nicht ändern', '00000000-0000-4000-8000-0000000000a4',
  $q$select public.admin_set_report_status((select id from public.reports limit 1), 'resolved')::text$q$, 'not a platform admin');
select pg_temp.t('Admin-RPC: W darf nichts löschen', '00000000-0000-4000-8000-0000000000a4',
  $q$select public.admin_delete_reported_message(gen_random_uuid())::text$q$, 'not a platform admin');
select pg_temp.t('Admin-Anhang: W sieht gemeldete Anhänge nicht', '00000000-0000-4000-8000-0000000000a4',
  $q$select private.is_reported_attachment('channels/00000000-0000-4000-8000-0000000000d0/00000000-0000-4000-8000-000000000101/f1.png')::text$q$, '=false');
select pg_temp.t('Admin-Anhang: rayvn darf gemeldeten Anhang sehen', '2a97c679-6b57-4604-9fe1-fea9e7b3f129',
  $q$select private.is_reported_attachment('channels/00000000-0000-4000-8000-0000000000d0/00000000-0000-4000-8000-000000000101/f1.png')::text$q$, '=true');
select pg_temp.t('Admin-RPC: rayvn löscht gemeldete Nachricht (gibt Anhänge zurück)', '2a97c679-6b57-4604-9fe1-fea9e7b3f129',
  $q$select public.admin_delete_reported_message((select id from public.reports where message_id = '00000000-0000-4000-8000-000000000101' limit 1))->'attachments'->0->>'name'$q$, '=bild.png');
select pg_temp.t('Admin-RPC: Nachricht ist weg, Meldung vermerkt es', null,
  $q$select ((select count(*) from public.messages where id = '00000000-0000-4000-8000-000000000101') = 0
     and (select message_deleted_at is not null from public.reports where message_id = '00000000-0000-4000-8000-000000000101' limit 1))::text$q$, '=true', 'postgres');
select pg_temp.t('Admin-RPC: rayvn markiert eine Meldung als erledigt', '2a97c679-6b57-4604-9fe1-fea9e7b3f129',
  $q$select public.admin_set_report_status((select id from public.reports where message_id = '00000000-0000-4000-8000-000000000101' limit 1), 'resolved')::text$q$, 'ok');
select pg_temp.t('Admin-RPC: erledigt mit handled_by und Zeit', null,
  $q$select (status || '|' || handled_by::text || '|' || (handled_at is not null)::text) from public.reports where message_id = '00000000-0000-4000-8000-000000000101' limit 1$q$,
  '=resolved|2a97c679-6b57-4604-9fe1-fea9e7b3f129|true', 'postgres');

/* ------------------------------------------------------------------ */
/* Ergebnis, Aufräumen                                                  */
/* ------------------------------------------------------------------ */

-- Mitgliedsnummern der Testkonten wieder freigeben (setval überlebt das Rollback).
select setval('public.member_number_seq', greatest(1, (
  select coalesce(max(member_number), 1) from public.profiles where id::text not like '00000000-0000-4000-8000-0000000000a%'
)));

select n, ok, name, detail from t_res order by n;

rollback;
