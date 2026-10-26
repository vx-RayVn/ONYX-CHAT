-- ONYX – Tests für Sprach- und Videochat (Migrationen 20261020002105_onyx_voice_permissions und 20261020002526_onyx_voice)
--
-- Läuft komplett in EINER Transaktion und wird am Ende zurückgerollt: es
-- bleiben keine Konten, Server, Anrufe oder Sprach-Status übrig. Testkonten
-- sind erfundene Zeilen in auth.users (…@onyx.invalid), die nie committet
-- werden. Realtime-Signale und pg_net-Aufträge gehen erst nach einem Commit
-- raus – hier also nie.
--
-- Ausgabe: "bestanden/gesamt" und die fehlgeschlagenen Prüfungen. Ausführen
-- im SQL-Editor oder per MCP execute_sql.
--
-- Sequenzen sind nicht transaktional: die Mitgliedsnummern der Testkonten
-- setzt der Schluss wieder zurück (setval).

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
    perform set_config('request.jwt.claims', case when p_user is null and p_role <> 'service_role' then '' else json_build_object('sub', p_user, 'role', p_role)::text end, true);
    execute format('set local role %I', p_role);
    execute p_sql into v;
    reset role;
    perform set_config('request.jwt.claims', '', true);
    insert into t_res (name, ok, detail)
    values (p_name, p_expect = 'ok' or (p_expect like '=%' and v is not distinct from substr(p_expect, 2)), 'result: ' || coalesce(v, 'null'));
  exception when others then
    reset role;
    perform set_config('request.jwt.claims', '', true);
    insert into t_res (name, ok, detail)
    values (p_name, p_expect <> 'ok' and p_expect not like '=%' and sqlerrm ilike '%' || p_expect || '%', 'error: ' || sqlerrm);
  end;
end;
$$;

/** LiveKit-Ereignis wie vom Webhook (als service_role). */
create function pg_temp.ev(p_event text, p_room text, p_user text, p_sid text, p_at double precision, p_source text default null) returns text
language sql as $$
  select format('select public.voice_event(%L::jsonb)', jsonb_build_object('event', p_event, 'room', p_room, 'identity', p_user, 'sid', p_sid, 'at', p_at, 'source', p_source))
$$;

create temp table t_now as select extract(epoch from now())::double precision as at;
grant select on t_now to authenticated, anon, service_role;

/* ------------------------------------------------------------------ */
/* Testdaten                                                            */
/* ------------------------------------------------------------------ */

-- a0 Inhaber, a1 Mod M (Rang 2: stumm, taub, verschieben), a2 Low L (Rang 1: nur stumm),
-- a3 X und a4 W ohne Rolle, a5 Y (Rang 3, ohne Rechte), a6 Z (kein Mitglied), a7 B (wird gesperrt).
insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000a0', 'zz-owner@onyx.invalid', 'authenticated', 'authenticated', '{"username":"zz_owner"}'),
  ('00000000-0000-4000-8000-0000000000a1', 'zz-mod@onyx.invalid', 'authenticated', 'authenticated', '{"username":"zz_mod"}'),
  ('00000000-0000-4000-8000-0000000000a2', 'zz-low@onyx.invalid', 'authenticated', 'authenticated', '{"username":"zz_low"}'),
  ('00000000-0000-4000-8000-0000000000a3', 'zz-x@onyx.invalid', 'authenticated', 'authenticated', '{"username":"zz_x"}'),
  ('00000000-0000-4000-8000-0000000000a4', 'zz-w@onyx.invalid', 'authenticated', 'authenticated', '{"username":"zz_w"}'),
  ('00000000-0000-4000-8000-0000000000a5', 'zz-y@onyx.invalid', 'authenticated', 'authenticated', '{"username":"zz_y"}'),
  ('00000000-0000-4000-8000-0000000000a6', 'zz-z@onyx.invalid', 'authenticated', 'authenticated', '{"username":"zz_z"}'),
  ('00000000-0000-4000-8000-0000000000a7', 'zz-b@onyx.invalid', 'authenticated', 'authenticated', '{"username":"zz_b"}');

insert into public.servers (id, name, owner_id) values ('00000000-0000-4000-8000-0000000000b0', 'Testserver', '00000000-0000-4000-8000-0000000000a0');
insert into public.roles (id, server_id, name, position, permissions, is_default) values
  ('00000000-0000-4000-8000-0000000000c0', '00000000-0000-4000-8000-0000000000b0', '@everyone', 0, '{viewChannel,readHistory,sendMessages,connect,speak,video}', true),
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b0', 'Low', 1, '{muteMembers}', false),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000b0', 'Mods', 2, '{muteMembers,deafenMembers,moveMembers,screenShare}', false),
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
-- d0 Text, d1 Sprache (Limit 2), d2 Sprache privat (nur Mods), d3 Sprache ohne "Sprechen" für @everyone
insert into public.channels (id, server_id, name, type, user_limit) values
  ('00000000-0000-4000-8000-0000000000d0', '00000000-0000-4000-8000-0000000000b0', 'general', 'text', null),
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000b0', 'Lobby', 'voice', 2),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000b0', 'Mods', 'voice', null),
  ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000b0', 'Bühne', 'voice', null);
insert into public.permission_overwrites (server_id, channel_id, target_type, target_id, allow, deny) values
  ('00000000-0000-4000-8000-0000000000b0', '00000000-0000-4000-8000-0000000000d2', 'role', '00000000-0000-4000-8000-0000000000c0', '{}', '{viewChannel}'),
  ('00000000-0000-4000-8000-0000000000b0', '00000000-0000-4000-8000-0000000000d2', 'role', '00000000-0000-4000-8000-0000000000c2', '{viewChannel}', '{}'),
  ('00000000-0000-4000-8000-0000000000b0', '00000000-0000-4000-8000-0000000000d3', 'role', '00000000-0000-4000-8000-0000000000c0', '{}', '{speak}');
-- DM X–Y, DM X–W (W hat X blockiert), Gruppe X, Y, W
insert into public.dm_channels (id, type, dm_key) values
  ('00000000-0000-4000-8000-0000000000e0', 'dm', '00000000-0000-4000-8000-0000000000a3:00000000-0000-4000-8000-0000000000a5'),
  ('00000000-0000-4000-8000-0000000000e1', 'dm', '00000000-0000-4000-8000-0000000000a3:00000000-0000-4000-8000-0000000000a4');
insert into public.dm_channels (id, type, owner_id) values ('00000000-0000-4000-8000-0000000000e2', 'group', '00000000-0000-4000-8000-0000000000a3');
insert into public.dm_participants (dm_id, user_id) values
  ('00000000-0000-4000-8000-0000000000e0', '00000000-0000-4000-8000-0000000000a3'),
  ('00000000-0000-4000-8000-0000000000e0', '00000000-0000-4000-8000-0000000000a5'),
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a3'),
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a4'),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000a3'),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000a4'),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000a5');
insert into public.blocks (blocker_id, blocked_id) values ('00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-0000000000a3');
-- Ziel-URL für die Rauswurf-Aufträge (nur in dieser Transaktion)
update private.voice_config set url = 'https://zz-voice.invalid/functions/v1/voice-webhook';

/* ------------------------------------------------------------------ */
/* 0. Neue Rechte aus der Migration                                     */
/* ------------------------------------------------------------------ */

select pg_temp.t('Migration: keine Rolle hat "video" ohne "screenShare"', null,
  $q$select count(*)::text from public.roles where 'video' = any (permissions) and not ('screenShare' = any (permissions)) and server_id <> '00000000-0000-4000-8000-0000000000b0'$q$, '=0', 'postgres');
select pg_temp.t('Migration: keine Rolle hat "muteMembers" ohne "moveMembers"', null,
  $q$select count(*)::text from public.roles where 'muteMembers' = any (permissions) and not ('moveMembers' = any (permissions)) and server_id <> '00000000-0000-4000-8000-0000000000b0'$q$, '=0', 'postgres');

/* ------------------------------------------------------------------ */
/* 1. Beitreten: Prüfung vor dem Token                                  */
/* ------------------------------------------------------------------ */

select pg_temp.t('Beitritt: anon darf die Prüfung nicht aufrufen', null,
  $q$select public.voice_join_check('00000000-0000-4000-8000-0000000000d1')::text$q$, 'permission denied', 'anon');
select pg_temp.t('Beitritt: ohne Anmeldung → not authenticated', null,
  $q$select public.voice_join_check('00000000-0000-4000-8000-0000000000d1')::text$q$, 'not authenticated');
select pg_temp.t('Beitritt: X im Sprachkanal → Raum, Sprechen und Kamera, kein Bildschirm', '00000000-0000-4000-8000-0000000000a3',
  $q$select (r->>'room') || '|' || (r->>'can_speak') || '|' || (r->>'can_video') || '|' || (r->>'can_screen') || '|' || (r->>'user_limit') || '|' || (r->>'bypass_limit')
     from (select public.voice_join_check('00000000-0000-4000-8000-0000000000d1') r) x$q$,
  '=channel:00000000-0000-4000-8000-0000000000d1|true|true|false|2|false');
select pg_temp.t('Beitritt: Mod M darf Bildschirm teilen und volle Kanäle betreten', '00000000-0000-4000-8000-0000000000a1',
  $q$select (r->>'can_screen') || '|' || (r->>'bypass_limit') from (select public.voice_join_check('00000000-0000-4000-8000-0000000000d1') r) x$q$, '=true|true');
select pg_temp.t('Beitritt: Inhaber hat alle Rechte', '00000000-0000-4000-8000-0000000000a0',
  $q$select (r->>'can_speak') || '|' || (r->>'can_screen') || '|' || (r->>'bypass_limit') from (select public.voice_join_check('00000000-0000-4000-8000-0000000000d3') r) x$q$, '=true|true|true');
select pg_temp.t('Beitritt: ohne "Sprechen" (d3) → can_speak false', '00000000-0000-4000-8000-0000000000a3',
  $q$select public.voice_join_check('00000000-0000-4000-8000-0000000000d3')->>'can_speak'$q$, '=false');
select pg_temp.t('Beitritt: Nicht-Mitglied Z → kein Verbinden', '00000000-0000-4000-8000-0000000000a6',
  $q$select public.voice_join_check('00000000-0000-4000-8000-0000000000d1')::text$q$, 'missing permission: connect');
select pg_temp.t('Beitritt: privater Kanal ohne Sichtrecht (W) → kein Verbinden', '00000000-0000-4000-8000-0000000000a4',
  $q$select public.voice_join_check('00000000-0000-4000-8000-0000000000d2')::text$q$, 'missing permission: connect');
select pg_temp.t('Beitritt: Textkanal → kein Sprachkanal', '00000000-0000-4000-8000-0000000000a3',
  $q$select public.voice_join_check('00000000-0000-4000-8000-0000000000d0')::text$q$, 'not a voice channel');
select pg_temp.t('Beitritt: unbekannte ID → not found', '00000000-0000-4000-8000-0000000000a3',
  $q$select public.voice_join_check(gen_random_uuid())::text$q$, 'not found');
select pg_temp.t('Beitritt: DM-Teilnehmer X → DM-Raum', '00000000-0000-4000-8000-0000000000a3',
  $q$select public.voice_join_check('00000000-0000-4000-8000-0000000000e0')->>'room'$q$, '=dm:00000000-0000-4000-8000-0000000000e0');
select pg_temp.t('Beitritt: fremde DM (Z) → not found', '00000000-0000-4000-8000-0000000000a6',
  $q$select public.voice_join_check('00000000-0000-4000-8000-0000000000e0')::text$q$, 'not found');
select pg_temp.t('Beitritt: blockierte 1:1-DM → blocked', '00000000-0000-4000-8000-0000000000a3',
  $q$select public.voice_join_check('00000000-0000-4000-8000-0000000000e1')::text$q$, 'blocked');
select pg_temp.t('Beitritt: Gruppe trotz Blockierung zwischen zwei Mitgliedern möglich', '00000000-0000-4000-8000-0000000000a3',
  $q$select public.voice_join_check('00000000-0000-4000-8000-0000000000e2')->>'kind'$q$, '=dm');

/* ------------------------------------------------------------------ */
/* 2. Webhook-Ereignisse, Sichtbarkeit, Schreibschutz                   */
/* ------------------------------------------------------------------ */

select pg_temp.t('Webhook: authenticated darf voice_event nicht aufrufen', '00000000-0000-4000-8000-0000000000a3',
  pg_temp.ev('participant_joined', 'channel:00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000a3', 'PA_x1', (select at from t_now)), 'permission denied');
select pg_temp.t('Webhook: X tritt d1 bei', null,
  pg_temp.ev('participant_joined', 'channel:00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000a3', 'PA_x1', (select at from t_now) - 100), '=ok', 'service_role');
select pg_temp.t('Webhook: Realtime-Nachricht an voice:d1 erzeugt', null,
  $q$select (count(*) > 0)::text from realtime.messages where topic = 'voice:00000000-0000-4000-8000-0000000000d1' and event = 'state'$q$, '=true', 'postgres');
select pg_temp.t('Webhook: fremde Identität (kein UUID) wird ignoriert', null,
  pg_temp.ev('participant_joined', 'channel:00000000-0000-4000-8000-0000000000d1', 'agent-1', 'PA_ag', (select at from t_now)), '=ignored: identity', 'service_role');
select pg_temp.t('Webhook: Nicht-Mitglied Z wird nicht eingetragen', null,
  pg_temp.ev('participant_joined', 'channel:00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000a6', 'PA_z1', (select at from t_now)), '=ignored: no access', 'service_role');
select pg_temp.t('Webhook: unbekannter Raum wird ignoriert', null,
  pg_temp.ev('participant_joined', 'lobby', '00000000-0000-4000-8000-0000000000a3', 'PA_x9', (select at from t_now)), '=ignored: room', 'service_role');
select pg_temp.t('Sichtbar: W (Mitglied) sieht X in d1', '00000000-0000-4000-8000-0000000000a4',
  $q$select count(*)::text from public.voice_states where channel_id = '00000000-0000-4000-8000-0000000000d1'$q$, '=1');
select pg_temp.t('Sichtbar: Z (kein Mitglied) sieht niemanden', '00000000-0000-4000-8000-0000000000a6',
  $q$select count(*)::text from public.voice_states$q$, '=0');
select pg_temp.t('Sichtbar: anon liest nichts', null,
  $q$select count(*)::text from public.voice_states$q$, 'permission denied', 'anon');
select pg_temp.t('Webhook: Mod M tritt privatem Kanal d2 bei', null,
  pg_temp.ev('participant_joined', 'channel:00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000a1', 'PA_m1', (select at from t_now) - 100), '=ok', 'service_role');
select pg_temp.t('Sichtbar: W sieht M im privaten Kanal nicht', '00000000-0000-4000-8000-0000000000a4',
  $q$select count(*)::text from public.voice_states where channel_id = '00000000-0000-4000-8000-0000000000d2'$q$, '=0');
select pg_temp.t('Sichtbar: Mod M sieht sich im privaten Kanal', '00000000-0000-4000-8000-0000000000a1',
  $q$select count(*)::text from public.voice_states where channel_id = '00000000-0000-4000-8000-0000000000d2'$q$, '=1');
select pg_temp.t('Schreibschutz: X kann den eigenen Status nicht direkt ändern', '00000000-0000-4000-8000-0000000000a3',
  $q$update public.voice_states set server_mute = false where user_id = '00000000-0000-4000-8000-0000000000a3' returning 'x'$q$, 'permission denied');
select pg_temp.t('Schreibschutz: X kann sich nicht selbst eintragen', '00000000-0000-4000-8000-0000000000a3',
  $q$insert into public.voice_states (user_id, room, dm_id, sid) values ('00000000-0000-4000-8000-0000000000a3', 'dm:00000000-0000-4000-8000-0000000000e0', '00000000-0000-4000-8000-0000000000e0', 'x') returning 'x'$q$, 'permission denied');
select pg_temp.t('Selbst: X schaltet sich stumm (Anzeige)', '00000000-0000-4000-8000-0000000000a3',
  $q$select public.voice_set_self(true, false)::text$q$, 'ok');
select pg_temp.t('Selbst: taub bedeutet auch stumm', '00000000-0000-4000-8000-0000000000a3',
  $q$select public.voice_set_self(false, true)::text$q$, 'ok');
select pg_temp.t('Selbst: Status in der Tabelle', null,
  $q$select self_mute::text || '|' || self_deaf::text from public.voice_states where user_id = '00000000-0000-4000-8000-0000000000a3'$q$, '=true|true', 'postgres');
select pg_temp.t('Webhook: Kamera an', null,
  pg_temp.ev('track_published', 'channel:00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000a3', 'PA_x1', (select at from t_now) - 90, 'CAMERA'), '=ok', 'service_role');
select pg_temp.t('Webhook: Kamera einer alten Verbindung ändert nichts', null,
  pg_temp.ev('track_published', 'channel:00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000a3', 'PA_old', (select at from t_now) - 90, 'SCREEN_SHARE'), '=ok', 'service_role');
select pg_temp.t('Webhook: Kamera an, Bildschirm aus', null,
  $q$select camera::text || '|' || screen::text from public.voice_states where user_id = '00000000-0000-4000-8000-0000000000a3'$q$, '=true|false', 'postgres');
select pg_temp.t('Webhook: "verlassen" einer anderen Verbindung löscht nichts', null,
  pg_temp.ev('participant_left', 'channel:00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000a3', 'PA_old', (select at from t_now) - 80), '=ok', 'service_role');
select pg_temp.t('Webhook: X ist noch drin', null,
  $q$select count(*)::text from public.voice_states where user_id = '00000000-0000-4000-8000-0000000000a3'$q$, '=1', 'postgres');
select pg_temp.t('Webhook: älteres "beitreten" (anderer Kanal) überschreibt nicht', null,
  pg_temp.ev('participant_joined', 'channel:00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000a3', 'PA_x0', (select at from t_now) - 200), '=ok', 'service_role');
select pg_temp.t('Webhook: X bleibt in d1', null,
  $q$select channel_id::text from public.voice_states where user_id = '00000000-0000-4000-8000-0000000000a3'$q$, '=00000000-0000-4000-8000-0000000000d1', 'postgres');
select pg_temp.t('Webhook: W tritt d1 bei', null,
  pg_temp.ev('participant_joined', 'channel:00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000a4', 'PA_w1', (select at from t_now) - 100), '=ok', 'service_role');

/* ------------------------------------------------------------------ */
/* 3. Moderation: Recht im Kanal + Rangfolge                            */
/* ------------------------------------------------------------------ */

select pg_temp.t('Mod: W (ohne Recht) kann X nicht stumm schalten', '00000000-0000-4000-8000-0000000000a4',
  $q$select public.voice_moderate('00000000-0000-4000-8000-0000000000a3', 'mute')::text$q$, 'missing permission: muteMembers');
select pg_temp.t('Mod: L (nur stumm) kann nicht taub schalten', '00000000-0000-4000-8000-0000000000a2',
  $q$select public.voice_moderate('00000000-0000-4000-8000-0000000000a3', 'deafen')::text$q$, 'missing permission: deafenMembers');
select pg_temp.t('Mod: L kann nicht trennen', '00000000-0000-4000-8000-0000000000a2',
  $q$select public.voice_moderate('00000000-0000-4000-8000-0000000000a3', 'disconnect')::text$q$, 'missing permission: moveMembers');
select pg_temp.t('Mod: unbekannte Aktion', '00000000-0000-4000-8000-0000000000a2',
  $q$select public.voice_moderate('00000000-0000-4000-8000-0000000000a3', 'ban')::text$q$, 'unknown action');
select pg_temp.t('Mod: L schaltet X stumm', '00000000-0000-4000-8000-0000000000a2',
  $q$select (r->>'room') || '|' || (r->>'server_mute') || '|' || (r->>'can_speak') from (select public.voice_moderate('00000000-0000-4000-8000-0000000000a3', 'mute') r) x$q$,
  '=channel:00000000-0000-4000-8000-0000000000d1|true|false');
select pg_temp.t('Mod: X ist server-stumm (für alle sichtbar)', '00000000-0000-4000-8000-0000000000a4',
  $q$select server_mute::text from public.voice_states where user_id = '00000000-0000-4000-8000-0000000000a3'$q$, '=true');
select pg_temp.t('Mod: L sieht den privaten Kanal von M nicht → kein Recht dort', '00000000-0000-4000-8000-0000000000a2',
  $q$select public.voice_moderate('00000000-0000-4000-8000-0000000000a1', 'mute')::text$q$, 'missing permission: muteMembers');
select pg_temp.t('Mod: Y (Rang 3) tritt d1 bei', null,
  pg_temp.ev('participant_joined', 'channel:00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000a5', 'PA_y1', (select at from t_now) - 100), '=ok', 'service_role');
select pg_temp.t('Mod: L (Rang 1) kann den höherrangigen Y nicht stumm schalten', '00000000-0000-4000-8000-0000000000a2',
  $q$select public.voice_moderate('00000000-0000-4000-8000-0000000000a5', 'mute')::text$q$, 'target is not below you');
select pg_temp.t('Mod: Inhaber darf Y stumm schalten und wieder freigeben', '00000000-0000-4000-8000-0000000000a0',
  $q$select (public.voice_moderate('00000000-0000-4000-8000-0000000000a5', 'mute')->>'server_mute') || '|' || (public.voice_moderate('00000000-0000-4000-8000-0000000000a5', 'unmute')->>'server_mute')$q$, '=true|false');
select pg_temp.t('Mod: M kann den Inhaber nicht stumm schalten (nicht im Kanal)', '00000000-0000-4000-8000-0000000000a1',
  $q$select public.voice_moderate('00000000-0000-4000-8000-0000000000a0', 'mute')::text$q$, 'not in a voice channel');
select pg_temp.t('Mod: M schaltet sich selbst stumm (eigene Person erlaubt)', '00000000-0000-4000-8000-0000000000a1',
  $q$select public.voice_moderate('00000000-0000-4000-8000-0000000000a1', 'mute')->>'server_mute'$q$, '=true');
select pg_temp.t('Mod: M hebt eigene Stummschaltung auf', '00000000-0000-4000-8000-0000000000a1',
  $q$select public.voice_moderate('00000000-0000-4000-8000-0000000000a1', 'unmute')->>'server_mute'$q$, '=false');
select pg_temp.t('Mod: Stumm bleibt beim nächsten Beitritt (Token ohne Sprechen)', '00000000-0000-4000-8000-0000000000a3',
  $q$select (r->>'server_mute') || '|' || (r->>'can_speak') from (select public.voice_join_check('00000000-0000-4000-8000-0000000000d1') r) x$q$, '=true|false');
select pg_temp.t('Mod: M schaltet X taub, stumm bleibt', '00000000-0000-4000-8000-0000000000a1',
  $q$select (r->>'server_mute') || '|' || (r->>'server_deaf') from (select public.voice_moderate('00000000-0000-4000-8000-0000000000a3', 'deafen') r) x$q$, '=true|true');
select pg_temp.t('Mod: M hebt Stumm auf, taub bleibt', '00000000-0000-4000-8000-0000000000a1',
  $q$select (r->>'server_mute') || '|' || (r->>'server_deaf') || '|' || (r->>'can_speak') from (select public.voice_moderate('00000000-0000-4000-8000-0000000000a3', 'unmute') r) x$q$, '=false|true|true');
select pg_temp.t('Mod: Verschieben in einen Textkanal geht nicht', '00000000-0000-4000-8000-0000000000a1',
  $q$select public.voice_moderate('00000000-0000-4000-8000-0000000000a3', 'move', '00000000-0000-4000-8000-0000000000d0')::text$q$, 'invalid destination');
select pg_temp.t('Mod: X kann nicht in den privaten Kanal verschoben werden', '00000000-0000-4000-8000-0000000000a1',
  $q$select public.voice_moderate('00000000-0000-4000-8000-0000000000a3', 'move', '00000000-0000-4000-8000-0000000000d2')::text$q$, 'target cannot connect there');
select pg_temp.t('Mod: M verschiebt X nach d3', '00000000-0000-4000-8000-0000000000a1',
  $q$select public.voice_moderate('00000000-0000-4000-8000-0000000000a3', 'move', '00000000-0000-4000-8000-0000000000d3')->>'dest_channel_id'$q$, '=00000000-0000-4000-8000-0000000000d3');
select pg_temp.t('Mod: Verschieben-Ticket erlaubt X den vollen Kanal (einmal)', '00000000-0000-4000-8000-0000000000a3',
  $q$select (public.voice_join_check('00000000-0000-4000-8000-0000000000d3')->>'bypass_limit') || '|' || (public.voice_join_check('00000000-0000-4000-8000-0000000000d3')->>'bypass_limit')$q$, '=true|false');
select pg_temp.t('Mod: M kann trennen', '00000000-0000-4000-8000-0000000000a1',
  $q$select public.voice_moderate('00000000-0000-4000-8000-0000000000a4', 'disconnect')->>'room'$q$, '=channel:00000000-0000-4000-8000-0000000000d1');
select pg_temp.t('Mod: Ziel ohne Sprachverbindung', '00000000-0000-4000-8000-0000000000a1',
  $q$select public.voice_moderate('00000000-0000-4000-8000-0000000000a6', 'mute')::text$q$, 'not in a voice channel');

/* ------------------------------------------------------------------ */
/* 4. Anrufe in DMs                                                     */
/* ------------------------------------------------------------------ */

select pg_temp.t('Anruf: Z kann in fremder DM nicht anrufen', '00000000-0000-4000-8000-0000000000a6',
  $q$select public.call_start('00000000-0000-4000-8000-0000000000e0')::text$q$, 'not found');
select pg_temp.t('Anruf: blockierte DM → blocked', '00000000-0000-4000-8000-0000000000a3',
  $q$select public.call_start('00000000-0000-4000-8000-0000000000e1')::text$q$, 'blocked');
select pg_temp.t('Anruf: X startet einen Videoanruf mit Y', '00000000-0000-4000-8000-0000000000a3',
  $q$select public.call_start('00000000-0000-4000-8000-0000000000e0', true)->>'started'$q$, '=true');
select pg_temp.t('Anruf: Systemnachricht vom Typ call mit derselben ID', null,
  $q$select (m.type::text || '|' || c.video::text || '|' || (c.ended_at is null)::text) from public.calls c join public.messages m on m.id = c.id where c.dm_id = '00000000-0000-4000-8000-0000000000e0'$q$, '=call|true|true', 'postgres');
select pg_temp.t('Anruf: zweiter Start tritt demselben Anruf bei', '00000000-0000-4000-8000-0000000000a5',
  $q$select (r->>'started') || '|' || ((r->>'id')::uuid = (select id from public.calls where dm_id = '00000000-0000-4000-8000-0000000000e0'))::text from (select public.call_start('00000000-0000-4000-8000-0000000000e0') r) x$q$, '=false|true');
select pg_temp.t('Anruf: Realtime-Klingeln an calls:Y', null,
  $q$select (count(*) > 0)::text from realtime.messages where topic = 'calls:00000000-0000-4000-8000-0000000000a5' and event = 'call'$q$, '=true', 'postgres');
select pg_temp.t('Anruf: Y sieht den Anruf', '00000000-0000-4000-8000-0000000000a5',
  $q$select count(*)::text from public.calls$q$, '=1');
select pg_temp.t('Anruf: Z sieht ihn nicht', '00000000-0000-4000-8000-0000000000a6',
  $q$select count(*)::text from public.calls$q$, '=0');
select pg_temp.t('Anruf: Y lehnt ab', '00000000-0000-4000-8000-0000000000a5',
  $q$select public.call_decline((select id from public.calls where dm_id = '00000000-0000-4000-8000-0000000000e0'))::text$q$, 'ok');
select pg_temp.t('Anruf: Z kann nicht ablehnen (keine Wirkung)', '00000000-0000-4000-8000-0000000000a6',
  $q$select public.call_decline((select id from public.calls where dm_id = '00000000-0000-4000-8000-0000000000e0' and ended_at is null limit 1))::text$q$, 'ok');
select pg_temp.t('Anruf: nur Y in declined', null,
  $q$select declined::text from public.calls where dm_id = '00000000-0000-4000-8000-0000000000e0'$q$, '={00000000-0000-4000-8000-0000000000a5}', 'postgres');
select pg_temp.t('Anruf: X verbindet (Webhook) → joined, X wechselt aus d1 in die DM', null,
  pg_temp.ev('participant_joined', 'dm:00000000-0000-4000-8000-0000000000e0', '00000000-0000-4000-8000-0000000000a3', 'PA_x2', (select at from t_now) - 50), '=ok', 'service_role');
select pg_temp.t('Anruf: joined = {X}, Status zeigt die DM', null,
  $q$select (select joined::text from public.calls where dm_id = '00000000-0000-4000-8000-0000000000e0') || '|' || (select room from public.voice_states where user_id = '00000000-0000-4000-8000-0000000000a3')$q$,
  '={00000000-0000-4000-8000-0000000000a3}|dm:00000000-0000-4000-8000-0000000000e0', 'postgres');
select pg_temp.t('Anruf: W (nicht in der DM) wird nicht eingetragen', null,
  pg_temp.ev('participant_joined', 'dm:00000000-0000-4000-8000-0000000000e0', '00000000-0000-4000-8000-0000000000a4', 'PA_w2', (select at from t_now) - 50), '=ignored: no access', 'service_role');
select pg_temp.t('Anruf: X legt auf → niemand mehr drin → beendet', null,
  pg_temp.ev('participant_left', 'dm:00000000-0000-4000-8000-0000000000e0', '00000000-0000-4000-8000-0000000000a3', 'PA_x2', (select at from t_now) - 40), '=ok', 'service_role');
select pg_temp.t('Anruf: ended_at gesetzt', null,
  $q$select (ended_at is not null)::text from public.calls where dm_id = '00000000-0000-4000-8000-0000000000e0'$q$, '=true', 'postgres');
select pg_temp.t('Anruf: Wiederverbinden kurz danach setzt denselben Anruf fort', null,
  pg_temp.ev('participant_joined', 'dm:00000000-0000-4000-8000-0000000000e0', '00000000-0000-4000-8000-0000000000a3', 'PA_x3', (select at from t_now) - 30), '=ok', 'service_role');
select pg_temp.t('Anruf: wieder aktiv, nur ein Anruf', null,
  $q$select count(*)::text || '|' || count(*) filter (where ended_at is null)::text from public.calls where dm_id = '00000000-0000-4000-8000-0000000000e0'$q$, '=1|1', 'postgres');
select pg_temp.t('Anruf: Raum geschlossen (room_finished) → beendet, Status weg', null,
  pg_temp.ev('room_finished', 'dm:00000000-0000-4000-8000-0000000000e0', null, null, (select at from t_now) + 1), '=ok', 'service_role');
select pg_temp.t('Anruf: beendet und niemand mehr im Raum', null,
  $q$select ((select count(*) from public.calls where dm_id = '00000000-0000-4000-8000-0000000000e0' and ended_at is null) = 0
     and (select count(*) from public.voice_states where dm_id = '00000000-0000-4000-8000-0000000000e0') = 0)::text$q$, '=true', 'postgres');
select pg_temp.t('Anruf: Gruppe – X ruft an', '00000000-0000-4000-8000-0000000000a3',
  $q$select public.call_start('00000000-0000-4000-8000-0000000000e2')->>'started'$q$, '=true');

/* ------------------------------------------------------------------ */
/* 5. Realtime-Berechtigung                                             */
/* ------------------------------------------------------------------ */

select pg_temp.t('Realtime: W hört voice:d1', '00000000-0000-4000-8000-0000000000a4',
  $q$select private.can_join_voice_topic('voice:00000000-0000-4000-8000-0000000000d1')::text$q$, '=true');
select pg_temp.t('Realtime: W hört den privaten Kanal nicht', '00000000-0000-4000-8000-0000000000a4',
  $q$select private.can_join_voice_topic('voice:00000000-0000-4000-8000-0000000000d2')::text$q$, '=false');
select pg_temp.t('Realtime: Z hört voice:d1 nicht', '00000000-0000-4000-8000-0000000000a6',
  $q$select private.can_join_voice_topic('voice:00000000-0000-4000-8000-0000000000d1')::text$q$, '=false');
select pg_temp.t('Realtime: Y hört die eigene DM', '00000000-0000-4000-8000-0000000000a5',
  $q$select private.can_join_voice_topic('voice:00000000-0000-4000-8000-0000000000e0')::text$q$, '=true');
select pg_temp.t('Realtime: W hört die DM X–Y nicht', '00000000-0000-4000-8000-0000000000a4',
  $q$select private.can_join_voice_topic('voice:00000000-0000-4000-8000-0000000000e0')::text$q$, '=false');
select pg_temp.t('Realtime: X hört eigene Anrufe', '00000000-0000-4000-8000-0000000000a3',
  $q$select private.can_join_voice_topic('calls:00000000-0000-4000-8000-0000000000a3')::text$q$, '=true');
select pg_temp.t('Realtime: W hört die Anrufe von X nicht', '00000000-0000-4000-8000-0000000000a4',
  $q$select private.can_join_voice_topic('calls:00000000-0000-4000-8000-0000000000a3')::text$q$, '=false');
select pg_temp.t('Realtime: unbekanntes Format', '00000000-0000-4000-8000-0000000000a4',
  $q$select private.can_join_voice_topic('voice:abc')::text$q$, '=false');

/* ------------------------------------------------------------------ */
/* 6. Rauswurf bei Kick, Sperre, Löschen; Abgleich; Dienstfunktionen    */
/* ------------------------------------------------------------------ */

select pg_temp.t('Rauswurf: B tritt d1 bei', null,
  pg_temp.ev('participant_joined', 'channel:00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000a7', 'PA_b1', (select at from t_now) - 100), '=ok', 'service_role');
select pg_temp.t('Rauswurf: Inhaber kickt W (in d1) → Status weg, Auftrag an voice-webhook', '00000000-0000-4000-8000-0000000000a0',
  $q$delete from public.server_members where server_id = '00000000-0000-4000-8000-0000000000b0' and user_id = '00000000-0000-4000-8000-0000000000a4' returning 'x'$q$, 'ok');
select pg_temp.t('Rauswurf: W nicht mehr im Sprachkanal', null,
  $q$select count(*)::text from public.voice_states where user_id = '00000000-0000-4000-8000-0000000000a4'$q$, '=0', 'postgres');
select pg_temp.t('Rauswurf: Auftrag "evict" für W liegt in der pg_net-Warteschlange', null,
  $q$select count(*)::text from net.http_request_queue where url = 'https://zz-voice.invalid/functions/v1/voice-webhook'
     and convert_from(body, 'utf8')::jsonb @> '{"action":"evict","identity":"00000000-0000-4000-8000-0000000000a4"}'$q$, '=1', 'postgres');
select pg_temp.t('Rauswurf: ONYX-Sperre von B → raus aus d1', null,
  $q$insert into public.platform_bans (user_id, reason) values ('00000000-0000-4000-8000-0000000000a7', 'Test') returning 'x'$q$, 'ok', 'postgres');
select pg_temp.t('Rauswurf: B nicht mehr drin, Auftrag liegt vor', null,
  $q$select ((select count(*) from public.voice_states where user_id = '00000000-0000-4000-8000-0000000000a7') = 0
     and (select count(*) from net.http_request_queue where convert_from(body, 'utf8')::jsonb @> '{"identity":"00000000-0000-4000-8000-0000000000a7"}') = 1)::text$q$, '=true', 'postgres');
select pg_temp.t('Sperre: B bekommt kein Token mehr', '00000000-0000-4000-8000-0000000000a7',
  $q$select public.voice_join_check('00000000-0000-4000-8000-0000000000d1')::text$q$, 'account suspended');
select pg_temp.t('Sperre: B kann keinen Anruf starten', '00000000-0000-4000-8000-0000000000a7',
  $q$select public.call_start('00000000-0000-4000-8000-0000000000e0')::text$q$, 'account suspended');
select pg_temp.t('Löschen: Kanal mit Teilnehmern → Auftrag "close"', '00000000-0000-4000-8000-0000000000a0',
  $q$delete from public.channels where id = '00000000-0000-4000-8000-0000000000d2' returning 'x'$q$, 'ok');
select pg_temp.t('Löschen: close für channel:d2 liegt vor, Status per Cascade weg', null,
  $q$select ((select count(*) from net.http_request_queue where convert_from(body, 'utf8')::jsonb @> '{"action":"close","room":"channel:00000000-0000-4000-8000-0000000000d2"}') = 1
     and (select count(*) from public.voice_states where user_id = '00000000-0000-4000-8000-0000000000a1') = 0)::text$q$, '=true', 'postgres');
select pg_temp.t('Abgleich: leerer Raum → nichts zu entfernen', null,
  $q$select public.voice_reconcile('channel:00000000-0000-4000-8000-0000000000d3', '{}')::text$q$, '=0', 'service_role');
select pg_temp.t('Abgleich: authenticated darf nicht', '00000000-0000-4000-8000-0000000000a3',
  $q$select public.voice_reconcile('channel:00000000-0000-4000-8000-0000000000d1', '{}')::text$q$, 'permission denied');
select pg_temp.t('Konfiguration: authenticated liest das Geheimnis nicht', '00000000-0000-4000-8000-0000000000a3',
  $q$select public.voice_config(null)$q$, 'permission denied');
select pg_temp.t('Konfiguration: private Tabelle für authenticated gesperrt', '00000000-0000-4000-8000-0000000000a3',
  $q$select secret from private.voice_config$q$, 'permission denied');
select pg_temp.t('Konfiguration: service_role bekommt das Geheimnis', null,
  $q$select (length(public.voice_config(null)) = 64)::text$q$, '=true', 'service_role');

-- Abgleich mit einem echten Altbestand: Y in d1, letztes Ereignis vor 100 s, nicht mehr bei LiveKit
select pg_temp.t('Abgleich: Y (alt) tritt d1 bei', null,
  pg_temp.ev('participant_joined', 'channel:00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000a5', 'PA_y1', (select at from t_now) - 100), '=ok', 'service_role');
select pg_temp.t('Abgleich: entfernt Y, behält X-Liste', null,
  $q$select public.voice_reconcile('channel:00000000-0000-4000-8000-0000000000d1', '{00000000-0000-4000-8000-0000000000a3}')::text$q$, '=1', 'service_role');

/* ------------------------------------------------------------------ */
/* 7. Sprachnachrichten (Bucket attachments, Anhang in der Nachricht)   */
/* ------------------------------------------------------------------ */

select pg_temp.t('Sprachnachricht: X darf in die DM X–Y hochladen', '00000000-0000-4000-8000-0000000000a3',
  $q$select private.can_upload_attachment('dms/00000000-0000-4000-8000-0000000000e0/00000000-0000-4000-8000-0000000003a0/a1-voice-message.webm')::text$q$, '=true');
select pg_temp.t('Sprachnachricht: Z darf nicht in fremde DM hochladen', '00000000-0000-4000-8000-0000000000a6',
  $q$select private.can_upload_attachment('dms/00000000-0000-4000-8000-0000000000e0/00000000-0000-4000-8000-0000000003a0/a1-voice-message.webm')::text$q$, '=false');
select pg_temp.t('Sprachnachricht: X sendet die Nachricht mit Sprach-Anhang', '00000000-0000-4000-8000-0000000000a3',
  $q$insert into public.messages (id, dm_id, author_id, content, attachments) values ('00000000-0000-4000-8000-0000000003a0', '00000000-0000-4000-8000-0000000000e0', '00000000-0000-4000-8000-0000000000a3', '',
     '[{"id":"a1","name":"voice-message.webm","kind":"audio","mime":"audio/webm;codecs=opus","size":12345,"duration":3.2,"waveform":[0.1,0.5,0.3],"voice":true,"path":"dms/00000000-0000-4000-8000-0000000000e0/00000000-0000-4000-8000-0000000003a0/a1-voice-message.webm"}]') returning 'x'$q$, 'ok');
select pg_temp.t('Sprachnachricht: Pfad einer anderen Nachricht wird abgewiesen', '00000000-0000-4000-8000-0000000000a3',
  $q$insert into public.messages (id, dm_id, author_id, content, attachments) values ('00000000-0000-4000-8000-0000000003a1', '00000000-0000-4000-8000-0000000000e0', '00000000-0000-4000-8000-0000000000a3', '',
     '[{"id":"a2","name":"voice-message.webm","kind":"audio","size":10,"voice":true,"path":"dms/00000000-0000-4000-8000-0000000000e0/00000000-0000-4000-8000-0000000003a0/a1-voice-message.webm"}]') returning 'x'$q$, 'invalid attachment');
select pg_temp.t('Sprachnachricht: lokaler Browser-Schlüssel wird abgewiesen', '00000000-0000-4000-8000-0000000000a3',
  $q$insert into public.messages (id, dm_id, author_id, content, attachments) values ('00000000-0000-4000-8000-0000000003a2', '00000000-0000-4000-8000-0000000000e0', '00000000-0000-4000-8000-0000000000a3', '',
     '[{"id":"a3","name":"voice-message.webm","kind":"audio","size":10,"voice":true,"localKey":"a3","path":"dms/00000000-0000-4000-8000-0000000000e0/00000000-0000-4000-8000-0000000003a2/a3-voice-message.webm"}]') returning 'x'$q$, 'invalid attachment');
select pg_temp.t('Sprachnachricht: Y (in der DM) darf sie abspielen', '00000000-0000-4000-8000-0000000000a5',
  $q$select private.can_read_attachment('dms/00000000-0000-4000-8000-0000000000e0/00000000-0000-4000-8000-0000000003a0/a1-voice-message.webm')::text$q$, '=true');
select pg_temp.t('Sprachnachricht: Z darf sie nicht abspielen', '00000000-0000-4000-8000-0000000000a6',
  $q$select private.can_read_attachment('dms/00000000-0000-4000-8000-0000000000e0/00000000-0000-4000-8000-0000000003a0/a1-voice-message.webm')::text$q$, '=false');
select pg_temp.t('Sprachnachricht: Y sieht Anhang mit Dauer und Wellenform', '00000000-0000-4000-8000-0000000000a5',
  $q$select (attachments->0->>'duration') || '|' || jsonb_array_length(attachments->0->'waveform')::text from public.messages where id = '00000000-0000-4000-8000-0000000003a0'$q$, '=3.2|3');
select pg_temp.t('Sprachnachricht: ohne "Sprachnachrichten senden" im Kanal abgewiesen', '00000000-0000-4000-8000-0000000000a3',
  $q$insert into public.messages (id, channel_id, author_id, content, attachments) values ('00000000-0000-4000-8000-0000000003a3', '00000000-0000-4000-8000-0000000000d0', '00000000-0000-4000-8000-0000000000a3', '',
     '[{"id":"a4","name":"voice-message.webm","kind":"audio","size":10,"voice":true,"path":"channels/00000000-0000-4000-8000-0000000000d0/00000000-0000-4000-8000-0000000003a3/a4-voice-message.webm"}]') returning 'x'$q$, 'row-level security');
select pg_temp.t('Sprachnachricht: Inhaber darf sie im Kanal senden', '00000000-0000-4000-8000-0000000000a0',
  $q$insert into public.messages (id, channel_id, author_id, content, attachments) values ('00000000-0000-4000-8000-0000000003a4', '00000000-0000-4000-8000-0000000000d0', '00000000-0000-4000-8000-0000000000a0', '',
     '[{"id":"a5","name":"voice-message.webm","kind":"audio","size":10,"voice":true,"path":"channels/00000000-0000-4000-8000-0000000000d0/00000000-0000-4000-8000-0000000003a4/a5-voice-message.webm"}]') returning 'x'$q$, 'ok');

/* ------------------------------------------------------------------ */
/* 8. Rechteänderungen während einer Verbindung (Statement-Trigger)       */
/* ------------------------------------------------------------------ */

select pg_temp.t('Live-Rechte: neun Statement-Trigger auf den drei Rechtetabellen', null,
  $q$select count(*)::text from pg_trigger where tgrelid in ('public.permission_overwrites'::regclass, 'public.member_roles'::regclass, 'public.roles'::regclass)
    and tgname like 'voice_permissions_%' and (tgtype & 1) = 0$q$, '=9', 'postgres');
select pg_temp.t('Live-Rechte: anon darf keine Dienst-Snapshots lesen', null,
  $q$select public.voice_permissions_snapshot('[]')::text$q$, 'permission denied', 'anon');
select pg_temp.t('Live-Rechte: authenticated darf keine Dienst-Snapshots lesen', '00000000-0000-4000-8000-0000000000a3',
  $q$select public.voice_permissions_snapshot('[]')::text$q$, 'permission denied');
select pg_temp.t('Live-Rechte: postgres ohne Service-Claims ebenfalls abgewiesen', null,
  $q$select public.voice_permissions_snapshot('[]')::text$q$, 'service role only', 'postgres');
select pg_temp.t('Live-Rechte: X verbindet für den Test neu', null,
  pg_temp.ev('participant_joined', 'channel:00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000a3', 'PA_perm_x', (select at from t_now) + 30), '=ok', 'service_role');
select pg_temp.t('Live-Rechte: Y verbindet für den Test neu', null,
  pg_temp.ev('participant_joined', 'channel:00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000a5', 'PA_perm_y', (select at from t_now) + 30), '=ok', 'service_role');
delete from net.http_request_queue where url = 'https://zz-voice.invalid/functions/v1/voice-webhook';
update public.roles set permissions = array_remove(permissions, 'speak'::public.permission)
where id in ('00000000-0000-4000-8000-0000000000c0', '00000000-0000-4000-8000-0000000000c1');
select pg_temp.t('Live-Rechte: Rollenänderung bündelt beide Verbundenen in einem Auftrag', null,
  $q$select (count(*) = 1 and max(jsonb_array_length(convert_from(body, 'utf8')::jsonb->'targets')) = 2)::text
    from net.http_request_queue where url = 'https://zz-voice.invalid/functions/v1/voice-webhook' and convert_from(body, 'utf8')::jsonb->>'action' = 'permissions'$q$, '=true', 'postgres');
select pg_temp.t('Live-Rechte: keine veralteten Freigaben im Auftrag gespeichert', null,
  $q$select (not (convert_from(body, 'utf8')::jsonb->'targets'->0 ? 'can_speak'))::text from net.http_request_queue
    where url = 'https://zz-voice.invalid/functions/v1/voice-webhook' and convert_from(body, 'utf8')::jsonb->>'action' = 'permissions' limit 1$q$, '=true', 'postgres');
select pg_temp.t('Live-Rechte: Snapshot kennt entzogene Sprechrechte und erlaubtes Video', null,
  $q$select (r->0->>'can_speak') || '|' || (r->0->>'can_video') from (select public.voice_permissions_snapshot('[{"identity":"00000000-0000-4000-8000-0000000000a3","room":"channel:00000000-0000-4000-8000-0000000000d1","sid":"PA_perm_x"}]') r) q$q$, '=false|true', 'service_role');
select pg_temp.t('Live-Rechte: Auftrag mit alter SID verändert die neue Verbindung nicht', null,
  $q$select public.voice_permissions_snapshot('[{"identity":"00000000-0000-4000-8000-0000000000a3","room":"channel:00000000-0000-4000-8000-0000000000d1","sid":"PA_old"}]')->0->>'action'$q$, '=ignore', 'service_role');
delete from net.http_request_queue where url = 'https://zz-voice.invalid/functions/v1/voice-webhook';
insert into public.permission_overwrites (server_id, channel_id, target_type, target_id, allow, deny) values
 ('00000000-0000-4000-8000-0000000000b0', '00000000-0000-4000-8000-0000000000d1', 'member', '00000000-0000-4000-8000-0000000000a3', '{screenShare}', '{video}'),
 ('00000000-0000-4000-8000-0000000000b0', '00000000-0000-4000-8000-0000000000d1', 'member', '00000000-0000-4000-8000-0000000000a5', '{screenShare}', '{video}');
select pg_temp.t('Live-Rechte: Bulk-Insert von Überschreibungen erzeugt einen Auftrag', null,
  $q$select count(*)::text from net.http_request_queue where url = 'https://zz-voice.invalid/functions/v1/voice-webhook' and convert_from(body, 'utf8')::jsonb->>'action' = 'permissions'$q$, '=1', 'postgres');
select pg_temp.t('Live-Rechte: aktuelle Mitglieds-Überschreibung gilt sofort', null,
  $q$select (r->0->>'can_video') || '|' || (r->0->>'can_screen') from (select public.voice_permissions_snapshot('[{"identity":"00000000-0000-4000-8000-0000000000a3","room":"channel:00000000-0000-4000-8000-0000000000d1","sid":"PA_perm_x"}]') r) q$q$, '=false|true', 'service_role');
insert into public.roles (id, server_id, name, permissions) values ('00000000-0000-4000-8000-0000000000c4', '00000000-0000-4000-8000-0000000000b0', 'Live-Test', '{speak}');
delete from net.http_request_queue where url = 'https://zz-voice.invalid/functions/v1/voice-webhook';
insert into public.member_roles (server_id, user_id, role_id) values ('00000000-0000-4000-8000-0000000000b0', '00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000c4');
select pg_temp.t('Live-Rechte: Rollenzuweisung betrifft nur das Mitglied', null,
  $q$select (count(*) = 1 and max(jsonb_array_length(convert_from(body, 'utf8')::jsonb->'targets')) = 1)::text
    from net.http_request_queue where url = 'https://zz-voice.invalid/functions/v1/voice-webhook' and convert_from(body, 'utf8')::jsonb->>'action' = 'permissions'$q$, '=true', 'postgres');
select pg_temp.t('Live-Rechte: Rollenzuweisung erlaubt Sprechen wieder', null,
  $q$select public.voice_permissions_snapshot('[{"identity":"00000000-0000-4000-8000-0000000000a3","room":"channel:00000000-0000-4000-8000-0000000000d1","sid":"PA_perm_x"}]')->0->>'can_speak'$q$, '=true', 'service_role');
delete from public.member_roles where role_id = '00000000-0000-4000-8000-0000000000c4';
select pg_temp.t('Live-Rechte: Rollenentzug nimmt Sprechen wieder weg', null,
  $q$select public.voice_permissions_snapshot('[{"identity":"00000000-0000-4000-8000-0000000000a3","room":"channel:00000000-0000-4000-8000-0000000000d1","sid":"PA_perm_x"}]')->0->>'can_speak'$q$, '=false', 'service_role');
delete from public.permission_overwrites where channel_id = '00000000-0000-4000-8000-0000000000d1';
select pg_temp.t('Live-Rechte: gelöschte Überschreibung gibt Video wieder frei', null,
  $q$select public.voice_permissions_snapshot('[{"identity":"00000000-0000-4000-8000-0000000000a3","room":"channel:00000000-0000-4000-8000-0000000000d1","sid":"PA_perm_x"}]')->0->>'can_video'$q$, '=true', 'service_role');
insert into public.categories (id, server_id, name) values ('00000000-0000-4000-8000-0000000000f4', '00000000-0000-4000-8000-0000000000b0', 'Live-Kategorie');
insert into public.permission_overwrites (server_id, category_id, target_type, target_id, deny) values
 ('00000000-0000-4000-8000-0000000000b0', '00000000-0000-4000-8000-0000000000f4', 'role', '00000000-0000-4000-8000-0000000000c0', '{connect}');
delete from net.http_request_queue where url = 'https://zz-voice.invalid/functions/v1/voice-webhook';
update public.channels set category_id = '00000000-0000-4000-8000-0000000000f4' where id = '00000000-0000-4000-8000-0000000000d1';
select pg_temp.t('Live-Rechte: Kategorie-Wechsel prüft laufende Verbindungen neu', null,
  $q$select count(*)::text from net.http_request_queue where url = 'https://zz-voice.invalid/functions/v1/voice-webhook' and convert_from(body, 'utf8')::jsonb->>'action' = 'permissions'$q$, '=1', 'postgres');
select pg_temp.t('Live-Rechte: entzogenes Verbinden liefert Rauswurf', null,
  $q$select public.voice_permissions_snapshot('[{"identity":"00000000-0000-4000-8000-0000000000a3","room":"channel:00000000-0000-4000-8000-0000000000d1","sid":"PA_perm_x"}]')->0->>'action'$q$, '=evict', 'service_role');
select pg_temp.t('Live-Rechte: fehlgeschlagener Rauswurf bleibt wiederholbar', null,
  $q$select public.voice_permissions_snapshot('[{"identity":"00000000-0000-4000-8000-0000000000a3","room":"channel:00000000-0000-4000-8000-0000000000d1","sid":"PA_perm_x"}]')->0->>'action'$q$, '=evict', 'service_role');

/* ------------------------------------------------------------------ */
/* Ergebnis, Aufräumen                                                  */
/* ------------------------------------------------------------------ */

select pg_temp.t('Aktivität: anonymer Zugriff verboten', null,
  $q$select count(*)::text from public.voice_server_activity()$q$, 'permission denied', 'anon');
select pg_temp.t('Aktivität: Mitglied sieht belegten sichtbaren Server', '00000000-0000-4000-8000-0000000000a3',
  $q$select count(*)::text from public.voice_server_activity() where server_id = '00000000-0000-4000-8000-0000000000b0'$q$, '=1');
select pg_temp.t('Aktivität: Fremder sieht keinen Server', '00000000-0000-4000-8000-0000000000a6',
  $q$select count(*)::text from public.voice_server_activity()$q$, '=0');
select pg_temp.t('Aktivität: Mitglied darf privates Signal abonnieren', '00000000-0000-4000-8000-0000000000a3',
  $q$select private.can_join_voice_topic('voice-activity:00000000-0000-4000-8000-0000000000b0')::text$q$, '=true');
select pg_temp.t('Aktivität: Fremder darf Signal nicht abonnieren', '00000000-0000-4000-8000-0000000000a6',
  $q$select private.can_join_voice_topic('voice-activity:00000000-0000-4000-8000-0000000000b0')::text$q$, '=false');
select pg_temp.t('Webhook: altes Join-Token umgeht entzogenen Connect nicht', null,
  pg_temp.ev('participant_joined', 'channel:00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000a3', 'PA_revoked', (select at + 100 from t_now)), '=ignored: no access', 'service_role');

-- Mitgliedsnummern der Testkonten wieder freigeben (setval überlebt das Rollback).
select pg_temp.t('Live-Rechte: fehlgeschlagene Zustellung bleibt dauerhaft vorgemerkt', null,
  $q$select (count(*) > 0)::text from private.voice_permission_jobs$q$, '=true', 'postgres');
select pg_temp.t('Live-Rechte: Benutzer darf Aufträge nicht quittieren', null,
  $q$select public.voice_permissions_complete('[]')::text$q$, 'permission denied');
select pg_temp.t('Live-Rechte: alte Quittung wird angenommen', null,
  $q$select public.voice_permissions_complete('[{"identity":"00000000-0000-4000-8000-0000000000a3","room":"channel:00000000-0000-4000-8000-0000000000d1","sid":"PA_perm_x","version":"0"}]')::text$q$, 'ok', 'service_role');
select pg_temp.t('Live-Rechte: alte Quittung löscht keinen neueren Auftrag', null,
  $q$select count(*)::text from private.voice_permission_jobs where user_id = '00000000-0000-4000-8000-0000000000a3'$q$, '=1', 'postgres');
delete from net.http_request_queue where url = 'https://zz-voice.invalid/functions/v1/voice-webhook';
update private.voice_permission_jobs set retry_at = now() - interval '1 second';
select private.voice_retry_permissions();
select pg_temp.t('Live-Rechte: Cron bündelt eine Wiederholung statt den Auftrag zu verlieren', null,
  $q$select count(*)::text from net.http_request_queue where url = 'https://zz-voice.invalid/functions/v1/voice-webhook' and convert_from(body, 'utf8')::jsonb->>'action' = 'permissions'$q$, '=1', 'postgres');
select pg_temp.t('Live-Rechte: aktuelle Quittung bestätigt erfolgreiche Zustellung', null,
  format('select public.voice_permissions_complete(%L::jsonb)::text', (select jsonb_agg(jsonb_build_object('identity', user_id, 'room', room, 'sid', sid, 'version', version::text)) from private.voice_permission_jobs)), 'ok', 'service_role');
select pg_temp.t('Live-Rechte: erfolgreich quittierte Aufträge sind aufgeräumt', null,
  $q$select count(*)::text from private.voice_permission_jobs$q$, '=0', 'postgres');

select setval('public.member_number_seq', greatest(1, (
  select coalesce(max(member_number), 1) from public.profiles where id::text not like '00000000-0000-4000-8000-0000000000a%'
)));

-- Zusammenfassung und nur die fehlgeschlagenen Prüfungen (alle Zeilen: select * from t_res order by n).
select (select count(*) filter (where ok) || '/' || count(*) from t_res) as summary,
  (select coalesce(json_agg(json_build_object('n', n, 'name', name, 'detail', detail) order by n), '[]') from t_res where not ok) as failures;

rollback;
