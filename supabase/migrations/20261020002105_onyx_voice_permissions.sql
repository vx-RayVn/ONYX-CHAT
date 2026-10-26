-- ONYX – Sprach- und Videochat, Teil 1: neue Rechte
--
-- Eigene Migration, weil neue Enum-Werte erst nach dem Commit benutzt werden
-- dürfen. Die Vergabe an bestehende Rollen und die Tabellen folgen in
-- onyx_voice.
--   screenShare    Bildschirm, Fenster oder Tab teilen (bisher Teil von "video")
--   deafenMembers  andere server-taub schalten
--   moveMembers    andere aus Sprachkanälen trennen oder verschieben

alter type public.permission add value if not exists 'screenShare' after 'video';
alter type public.permission add value if not exists 'deafenMembers' after 'muteMembers';
alter type public.permission add value if not exists 'moveMembers' after 'deafenMembers';
