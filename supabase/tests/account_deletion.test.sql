-- Tests für Konto löschen und Server übertragen (Migration *_onyx_account_deletion.sql).
--
-- Ein einziger DO-Block, der am Ende immer mit einer Exception abbricht: Dadurch
-- wird alles zurückgerollt (Testkonten, Server, Nachrichten …), auch wenn
-- unterwegs etwas schiefgeht. Die Exception-Meldung IST das Testergebnis.
-- Einzige Ausnahme vom Rollback ist die Mitgliedsnummer-Sequenz – sie wird vor
-- dem Abbruch auf den alten Stand zurückgesetzt.
--
-- Ausführen im SQL-Editor des Dashboards oder über den Supabase-MCP (execute_sql).

do $test$
declare
  A constant uuid := '0a0a0a0a-0000-4000-8000-00000000000a'; -- wird gelöscht
  B constant uuid := '0b0b0b0b-0000-4000-8000-00000000000b';
  C constant uuid := '0c0c0c0c-0000-4000-8000-00000000000c';
  D constant uuid := '0d0d0d0d-0000-4000-8000-00000000000d'; -- kein Mitglied, von A blockiert
  E constant uuid := '0e0e0e0e-0000-4000-8000-00000000000e'; -- neues Konto danach
  S1 constant uuid := '51515151-0000-4000-8000-000000000001';
  S2 constant uuid := '52525252-0000-4000-8000-000000000002';
  CH constant uuid := 'c1c1c1c1-0000-4000-8000-000000000001';
  DM1 constant uuid := 'd1d1d1d1-0000-4000-8000-000000000001'; -- 1:1 A–B
  DM2 constant uuid := 'd2d2d2d2-0000-4000-8000-000000000002'; -- Gruppe A (Inhaber), C, B
  DM3 constant uuid := 'd3d3d3d3-0000-4000-8000-000000000003'; -- Gruppe nur A
  M1 constant uuid := '3e000000-0000-4000-8000-000000000001';
  M2 constant uuid := '3e000000-0000-4000-8000-000000000002';
  M3 constant uuid := '3e000000-0000-4000-8000-000000000003';
  M4 constant uuid := '3e000000-0000-4000-8000-000000000004';
  M5 constant uuid := '3e000000-0000-4000-8000-000000000005';
  M6 constant uuid := '3e000000-0000-4000-8000-000000000006';
  seq_last bigint;
  seq_called boolean;
  number_a bigint;
  v_storage boolean := false;
  v_prep jsonb;
  v_report text;
  v_failed int;
begin
  select last_value, is_called into seq_last, seq_called from public.member_number_seq;
  create temp table t_results (n serial, name text, ok boolean, detail text) on commit drop;
  grant all on t_results to authenticated, service_role;
  grant all on sequence t_results_n_seq to authenticated, service_role;

  begin
    /* -------------------------------------------------------------- */
    /* Testdaten                                                        */
    /* -------------------------------------------------------------- */
    insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, jsonb_build_object('username', u.username), now(), now()
    from (values (A, 'zz-del-a@example.invalid', 'zz_del_a'), (B, 'zz-del-b@example.invalid', 'zz_del_b'),
                 (C, 'zz-del-c@example.invalid', 'zz_del_c'), (D, 'zz-del-d@example.invalid', 'zz_del_d')) as u (id, email, username);
    select member_number into number_a from public.profiles where id = A;

    insert into public.servers (id, name, owner_id) values (S1, 'ZZ Test 1', A), (S2, 'ZZ Test 2', A);
    insert into public.roles (id, server_id, name, permissions, is_default) values
      ('71717171-0000-4000-8000-000000000001', S1, '@everyone', '{viewChannel,sendMessages,readHistory}', true),
      ('72727272-0000-4000-8000-000000000002', S2, '@everyone', '{viewChannel,sendMessages,readHistory}', true),
      ('73737373-0000-4000-8000-000000000003', S1, 'Mods', '{kickMembers}', false);
    insert into public.server_members (server_id, user_id) values (S1, A), (S1, B), (S2, A);
    insert into public.member_roles (server_id, user_id, role_id) values (S1, A, '73737373-0000-4000-8000-000000000003');
    insert into public.channels (id, server_id, name) values (CH, S1, 'general');
    insert into public.permission_overwrites (server_id, channel_id, target_type, target_id, allow) values (S1, CH, 'member', A, '{sendMessages}');
    insert into public.invites (code, server_id, inviter_id) values ('zz-del-test', S1, A);
    -- created_by setzt der Trigger aus auth.uid().
    perform set_config('request.jwt.claims', jsonb_build_object('sub', A, 'role', 'authenticated')::text, true);
    insert into public.server_emojis (id, server_id, name, image) values ('e1e1e1e1-0000-4000-8000-000000000001', S1, 'zz_test', 'data:image/png;base64,AA');
    perform set_config('request.jwt.claims', '', true);

    insert into public.dm_channels (id, type, owner_id, dm_key, name) values
      (DM1, 'dm', null, A || ':' || B, null), (DM2, 'group', A, null, 'ZZ Gruppe'), (DM3, 'group', A, null, 'ZZ allein');
    insert into public.dm_participants (dm_id, user_id, joined_at) values
      (DM1, A, now()), (DM1, B, now()),
      (DM2, A, now() - interval '3 hours'), (DM2, C, now() - interval '2 hours'), (DM2, B, now() - interval '1 hour'),
      (DM3, A, now());

    insert into public.messages (id, channel_id, dm_id, author_id, content, attachments) values
      (M1, CH, null, A, 'hello', '[]'),
      (M2, CH, null, A, '', jsonb_build_array(jsonb_build_object('id', 'f2', 'name', 'f.png', 'kind', 'image', 'size', 10, 'path', 'channels/' || CH || '/' || M2 || '/f.png'))),
      (M3, CH, null, A, 'with file', jsonb_build_array(jsonb_build_object('id', 'f3', 'name', 'g.png', 'kind', 'image', 'size', 10, 'path', 'channels/' || CH || '/' || M3 || '/g.png'))),
      (M4, CH, null, B, 'reply', '[]'),
      (M5, null, DM1, A, 'hi B', '[]'),
      (M6, null, DM3, A, '', jsonb_build_array(jsonb_build_object('id', 'f6', 'name', 'x.png', 'kind', 'image', 'size', 10, 'path', 'dms/' || DM3 || '/' || M6 || '/x.png')));
    insert into public.reactions (message_id, user_id, emoji) values (M4, A, '👍'), (M1, B, '🔥');

    insert into public.friendships (requester_id, addressee_id, status, accepted_at) values (A, B, 'accepted', now()), (C, A, 'pending', null);
    insert into public.blocks (blocker_id, blocked_id) values (A, D);
    insert into public.user_notes (owner_id, target_id, note) values (A, B, 'Notiz von A'), (B, A, 'Notiz über A');
    insert into public.read_states (user_id, scope_id, last_read_at) values (A, CH, now());
    insert into public.code_redemptions (user_id, code, rewards) values (A, 'ZZ-TEST', '[]');
    insert into private.rate_events (user_id, kind) values (A, 'zz_test');

    -- Storage-Zeilen nur als Datenbankeinträge (ohne Datei), damit die Dateiliste geprüft werden kann.
    begin
      insert into storage.objects (bucket_id, name, owner_id) values
        ('media', 'users/' || A || '/avatar-1.webp', A::text),
        ('media', 'servers/' || S1 || '/icon-1.webp', A::text),
        ('media', 'dms/' || DM3 || '/icon-1.webp', A::text),
        ('media', 'dms/' || DM2 || '/icon-1.webp', A::text),
        ('media', 'users/' || B || '/avatar-1.webp', B::text),
        ('attachments', 'channels/' || CH || '/' || M2 || '/f.png', A::text),
        ('attachments', 'dms/' || DM3 || '/' || M6 || '/x.png', A::text),
        ('attachments', 'channels/' || CH || '/' || M4 || '/b.png', B::text);
      v_storage := true;
    exception when others then
      insert into t_results (name, ok, detail) values ('Setup: Storage-Zeilen (nur für die Dateiliste)', null, sqlstate || ' ' || sqlerrm);
    end;

    /* -------------------------------------------------------------- */
    /* Server übertragen: Abweisungen                                   */
    /* -------------------------------------------------------------- */
    set local role authenticated;

    perform set_config('request.jwt.claims', jsonb_build_object('sub', B, 'role', 'authenticated')::text, true);
    begin
      perform public.transfer_server_ownership(S1, B);
      insert into t_results (name, ok, detail) values ('Übertragen: Nicht-Inhaber wird abgewiesen', false, 'kein Fehler');
    exception when others then
      insert into t_results (name, ok, detail) values ('Übertragen: Nicht-Inhaber wird abgewiesen', sqlstate = '42501', sqlstate || ' ' || sqlerrm);
    end;

    perform set_config('request.jwt.claims', jsonb_build_object('sub', A, 'role', 'authenticated')::text, true);
    begin
      perform public.transfer_server_ownership(S1, D);
      insert into t_results (name, ok, detail) values ('Übertragen: nur an Mitglieder', false, 'kein Fehler');
    exception when others then
      insert into t_results (name, ok, detail) values ('Übertragen: nur an Mitglieder', sqlstate = '42501', sqlstate || ' ' || sqlerrm);
    end;
    begin
      perform public.transfer_server_ownership(S1, A);
      insert into t_results (name, ok, detail) values ('Übertragen: nicht an sich selbst', false, 'kein Fehler');
    exception when others then
      insert into t_results (name, ok, detail) values ('Übertragen: nicht an sich selbst', sqlstate = '22023', sqlstate || ' ' || sqlerrm);
    end;
    begin
      perform public.account_deletion_prepare(A);
      insert into t_results (name, ok, detail) values ('Vorbereitung: für angemeldete Nutzer gesperrt', false, 'kein Fehler');
    exception when others then
      insert into t_results (name, ok, detail) values ('Vorbereitung: für angemeldete Nutzer gesperrt', sqlstate = '42501', sqlstate || ' ' || sqlerrm);
    end;
    begin
      delete from public.profiles where id = A;
      insert into t_results (name, ok, detail) values ('Profil: kein direktes Löschen über die API', false, 'kein Fehler');
    exception when others then
      insert into t_results (name, ok, detail) values ('Profil: kein direktes Löschen über die API', sqlstate = '42501', sqlstate || ' ' || sqlerrm);
    end;
    reset role;

    /* -------------------------------------------------------------- */
    /* Vorbereitung (Service-Role)                                      */
    /* -------------------------------------------------------------- */
    perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
    begin
      perform public.account_deletion_prepare(A);
      insert into t_results (name, ok, detail) values ('Vorbereitung: ohne Service-Role-Claims verweigert', false, 'kein Fehler');
    exception when others then
      insert into t_results (name, ok, detail) values ('Vorbereitung: ohne Service-Role-Claims verweigert', sqlstate = '42501', sqlstate || ' ' || sqlerrm);
    end;

    set local role service_role;
    perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
    v_prep := public.account_deletion_prepare(A);
    reset role;
    perform set_config('request.jwt.claims', '', true);

    insert into t_results (name, ok, detail) values
      ('Vorbereitung: nennt beide eigenen Server', jsonb_array_length(v_prep->'owned_servers') = 2, v_prep->>'owned_servers'),
      ('Vorbereitung: media = users/<A>/ + Ordner des Gesprächs nur mit A (nicht Server-Icon, nicht Gruppe mit anderen)',
        case when v_storage then v_prep->'media' = jsonb_build_array('dms/' || DM3 || '/icon-1.webp', 'users/' || A || '/avatar-1.webp') end, v_prep->>'media'),
      ('Vorbereitung: attachments = Uploads von A + Gespräch nur mit A, nichts von B',
        case when v_storage then v_prep->'attachments' = jsonb_build_array('channels/' || CH || '/' || M2 || '/f.png', 'dms/' || DM3 || '/' || M6 || '/x.png') end, v_prep->>'attachments');

    /* -------------------------------------------------------------- */
    /* Löschen wird verweigert, solange A Server besitzt                */
    /* -------------------------------------------------------------- */
    begin
      delete from auth.users where id = A;
      insert into t_results (name, ok, detail) values ('Löschen: verweigert, solange Server im Besitz', false, 'kein Fehler');
    exception when others then
      insert into t_results (name, ok, detail) values ('Löschen: verweigert, solange Server im Besitz', sqlstate = '23503', sqlstate || ' ' || sqlerrm);
    end;
    insert into t_results (name, ok, detail)
    select 'Löschen: nach der Abweisung ist nichts weg', count(*) = 2 and exists (select 1 from public.profiles where id = A), count(*) || ' Server'
    from public.servers where owner_id = A;

    /* -------------------------------------------------------------- */
    /* A überträgt Server 1 an B und löscht Server 2                    */
    /* -------------------------------------------------------------- */
    set local role authenticated;
    perform set_config('request.jwt.claims', jsonb_build_object('sub', A, 'role', 'authenticated')::text, true);
    begin
      perform public.transfer_server_ownership(S1, B);
      insert into t_results (name, ok, detail) values ('Übertragen: Inhaber an Mitglied klappt', true, null);
    exception when others then
      insert into t_results (name, ok, detail) values ('Übertragen: Inhaber an Mitglied klappt', false, sqlstate || ' ' || sqlerrm);
    end;
    begin
      perform public.transfer_server_ownership(S1, A);
      insert into t_results (name, ok, detail) values ('Übertragen: alter Inhaber kann nicht zurückholen', false, 'kein Fehler');
    exception when others then
      insert into t_results (name, ok, detail) values ('Übertragen: alter Inhaber kann nicht zurückholen', sqlstate = '42501', sqlstate || ' ' || sqlerrm);
    end;
    delete from public.servers where id = S2;
    reset role;
    perform set_config('request.jwt.claims', '', true);

    insert into t_results (name, ok, detail)
    select 'Übertragen: B ist Inhaber, A bleibt Mitglied, Server 2 gelöscht',
      s.owner_id = B and exists (select 1 from public.server_members m where m.server_id = s.id and m.user_id = A)
        and not exists (select 1 from public.servers where id = S2),
      s.owner_id::text
    from public.servers s where s.id = S1;

    /* -------------------------------------------------------------- */
    /* Löschen                                                          */
    /* -------------------------------------------------------------- */
    begin
      delete from auth.users where id = A;
      insert into t_results (name, ok, detail) values ('Löschen: Auth-Nutzer ohne Server lässt sich löschen', true, null);
    exception when others then
      insert into t_results (name, ok, detail) values ('Löschen: Auth-Nutzer ohne Server lässt sich löschen', false, sqlstate || ' ' || sqlerrm);
    end;

    insert into t_results (name, ok, detail) values
      ('Nachher: Profil weg', not exists (select 1 from public.profiles where id = A), null),
      ('Nachher: Nachricht mit Text bleibt ohne Autor', exists (select 1 from public.messages where id = M1 and author_id is null and content = 'hello'), null),
      ('Nachher: Nachricht nur aus einer Datei ist weg', not exists (select 1 from public.messages where id = M2), null),
      ('Nachher: Text bleibt, Dateiverweis entfernt', exists (select 1 from public.messages where id = M3 and author_id is null and attachments = '[]' and content = 'with file'), null),
      ('Nachher: Nachricht von B unverändert', exists (select 1 from public.messages where id = M4 and author_id = B), null),
      ('Nachher: Reaktionen von A weg, von B bleiben',
        not exists (select 1 from public.reactions where user_id = A) and exists (select 1 from public.reactions where message_id = M1 and user_id = B), null),
      ('Nachher: Mitgliedschaft, Rollen, Mitglieds-Überschreibung weg',
        not exists (select 1 from public.server_members where user_id = A)
          and not exists (select 1 from public.member_roles where user_id = A)
          and not exists (select 1 from public.permission_overwrites where target_type = 'member' and target_id = A), null),
      ('Nachher: 1:1-DM bleibt für B, Nachricht von A ohne Autor',
        exists (select 1 from public.dm_channels where id = DM1)
          and (select array_agg(user_id) from public.dm_participants where dm_id = DM1) = array[B]
          and exists (select 1 from public.messages where id = M5 and author_id is null), null),
      ('Nachher: Gruppe geht an die am längsten dabei Person (C)',
        (select owner_id from public.dm_channels where id = DM2) = C, (select coalesce(owner_id::text, 'null') from public.dm_channels where id = DM2)),
      ('Nachher: Gespräch ohne andere Teilnehmer samt Nachrichten weg',
        not exists (select 1 from public.dm_channels where id = DM3) and not exists (select 1 from public.messages where id = M6), null),
      ('Nachher: Freundschaften, Anfragen und Blockierungen weg',
        not exists (select 1 from public.friendships where A in (requester_id, addressee_id))
          and not exists (select 1 from public.blocks where A in (blocker_id, blocked_id)), null),
      ('Nachher: Notizen (eigene und über A), Gelesen-Status, eingelöste Codes weg',
        not exists (select 1 from public.user_notes where A in (owner_id, target_id))
          and not exists (select 1 from public.read_states where user_id = A)
          and not exists (select 1 from public.code_redemptions where user_id = A), null),
      ('Nachher: Abzeichen, Zähler, Rate-Limit-Protokoll weg',
        not exists (select 1 from public.user_badges where user_id = A)
          and not exists (select 1 from private.user_stats where user_id = A)
          and not exists (select 1 from private.rate_events where user_id = A), null),
      ('Nachher: Einladung und Emoji bleiben ohne Ersteller',
        exists (select 1 from public.invites where code = 'zz-del-test' and inviter_id is null)
          and exists (select 1 from public.server_emojis where id = 'e1e1e1e1-0000-4000-8000-000000000001' and created_by is null), null),
      ('Nachher: Server 1 lebt mit Inhaber B weiter', exists (select 1 from public.servers where id = S1 and owner_id = B), null);

    -- B kann in die DM mit dem gelöschten Konto nicht mehr schreiben, in die Gruppe schon.
    set local role authenticated;
    perform set_config('request.jwt.claims', jsonb_build_object('sub', B, 'role', 'authenticated')::text, true);
    insert into t_results (name, ok, detail) values
      ('DM mit gelöschtem Konto: Schreiben gesperrt, Gruppe weiter offen', not private.can_send_dm(DM1) and private.can_send_dm(DM2), null),
      ('DM mit gelöschtem Konto: Verlauf für B weiter lesbar', exists (select 1 from public.messages where id = M5), null);
    begin
      insert into public.messages (id, dm_id, author_id, content) values ('3e000000-0000-4000-8000-000000000009', DM1, B, 'hallo?');
      insert into t_results (name, ok, detail) values ('DM mit gelöschtem Konto: Senden von RLS abgewiesen', false, 'kein Fehler');
    exception when others then
      insert into t_results (name, ok, detail) values ('DM mit gelöschtem Konto: Senden von RLS abgewiesen', sqlstate = '42501', sqlstate || ' ' || sqlerrm);
    end;
    reset role;
    perform set_config('request.jwt.claims', '', true);

    -- Neue Konten bekommen nie die Nummer des gelöschten.
    insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', E, 'authenticated', 'authenticated', 'zz-del-e@example.invalid', '{"username":"zz_del_e"}', now(), now());
    insert into t_results (name, ok, detail)
    select 'Mitgliedsnummer wird nicht neu vergeben', p.member_number > number_a, 'A hatte ' || number_a || ', neues Konto ' || p.member_number
    from public.profiles p where p.id = E;
  exception when others then
    insert into t_results (name, ok, detail) values ('Unerwarteter Abbruch', false, sqlstate || ' ' || sqlerrm);
  end;

  /* ---------------------------------------------------------------- */
  /* Sequenz zurück (Sequenzen kennen kein Rollback), Ergebnis melden   */
  /* ---------------------------------------------------------------- */
  reset role;
  perform setval('public.member_number_seq',
    greatest(seq_last, coalesce((select max(p.member_number) from public.profiles p where p.id not in (A, B, C, D, E)), 0)),
    seq_called);

  select count(*) filter (where ok is not true),
    string_agg(case when ok then 'OK    ' when ok is null then 'SKIP  ' else 'FEHLER' end || ' ' || name || coalesce(' – ' || detail, ''), E'\n' order by n)
  into v_failed, v_report from t_results;
  raise exception E'Testergebnis (alles zurückgerollt): % von % Prüfungen nicht OK\n%', v_failed, (select count(*) from t_results), v_report;
end;
$test$;
