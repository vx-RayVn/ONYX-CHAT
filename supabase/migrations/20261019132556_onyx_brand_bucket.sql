-- ONYX: public bucket for brand images used outside the app (auth emails).
-- Read-only for everyone: there are no insert/update/delete policies, so only
-- the dashboard (service role) can put files here. The emails load
-- brand/onyx-logo-512.png (upload public/brand/onyx-logo-512.png there).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('brand', 'brand', true, 1048576, array['image/png', 'image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
