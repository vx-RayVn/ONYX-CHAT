-- Fixture prefix for scripts/operations/prepare-test.mjs. The actual review.sql is inserted there.
begin;
create temp table onyx_ops_results(name text,ok boolean)on commit drop;
create function pg_temp.ops_check(n text,b boolean)returns void language sql as $$insert into pg_temp.onyx_ops_results values(n,coalesce(b,false))$$;
insert into auth.users(id,email,aud,role,is_anonymous,raw_user_meta_data,created_at,updated_at,last_sign_in_at)values
('30303030-3030-4030-8030-303030303001',null,'authenticated','authenticated',true,'{}',now()-interval '200 days',now()-interval '200 days',now()-interval '200 days'),
('30303030-3030-4030-8030-303030303002',null,'authenticated','authenticated',true,'{}',now()-interval '2 days',now()-interval '2 days',now()-interval '2 days'),
('30303030-3030-4030-8030-303030303003',null,'authenticated','authenticated',true,'{}',now()-interval '200 days',now()-interval '200 days',now()-interval '200 days'),
('30303030-3030-4030-8030-303030303004',null,'authenticated','authenticated',true,'{}',now()-interval '200 days',now()-interval '200 days',now()-interval '200 days'),
('30303030-3030-4030-8030-303030303005',null,'authenticated','authenticated',true,'{}',now()-interval '200 days',now()-interval '200 days',now()-interval '200 days'),
('30303030-3030-4030-8030-303030303006','zz-ops-owner@onyx.invalid','authenticated','authenticated',false,'{"username":"zz_ops_owner"}',now()-interval '200 days',now()-interval '200 days',now()-interval '200 days'),
('30303030-3030-4030-8030-303030303007',null,'authenticated','authenticated',true,'{}',now()-interval '200 days',now()-interval '200 days',now()-interval '200 days');
update public.profiles set created_at=now()-interval '200 days'where id::text like '30303030-3030-4030-8030-30303030300%';
update auth.users set email_change='zz-ops-pending@onyx.invalid',updated_at=now()-interval '200 days'where id='30303030-3030-4030-8030-303030303005';
insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at)values('30303030-3030-4030-8030-303030303014','30303030-3030-4030-8030-303030303004',now()-interval '200 days',now(),now()at time zone 'UTC');
insert into public.servers(id,name,owner_id)values('30303030-3030-4030-8030-303030303020','ZZ ops review','30303030-3030-4030-8030-303030303006');
insert into public.channels(id,server_id,name,type)values('30303030-3030-4030-8030-303030303021','30303030-3030-4030-8030-303030303020','general','text');
insert into public.server_members(server_id,user_id)values('30303030-3030-4030-8030-303030303020','30303030-3030-4030-8030-303030303003')on conflict do nothing;
update public.server_members set joined_at=now()-interval '200 days'where user_id::text like '30303030-3030-4030-8030-30303030300%';
insert into public.read_states(user_id,scope_id,last_read_at)values('30303030-3030-4030-8030-303030303007','30303030-3030-4030-8030-303030303021',now());
insert into public.messages(id,channel_id,author_id,content,created_at,attachments)values
('30303030-3030-4030-8030-303030303022','30303030-3030-4030-8030-303030303021','30303030-3030-4030-8030-303030303003',
 'Synthetic references: storage:media/users/ops-review/message-only.png https://your-project.supabase.co/storage/v1/object/public/media/users/ops-review/encoded%20space.png',now()-interval '100 days',
 '[{"id":"30303030-3030-4030-8030-303030303023","path":"channels/30303030-3030-4030-8030-303030303021/30303030-3030-4030-8030-303030303022/ops-review-kept.bin","kind":"file","name":"synthetic.bin","size":1,"mime":"application/octet-stream"}]');
update public.profiles set avatar='{"kind":"image","src":"storage:media/users/30303030-3030-4030-8030-303030303006/ops-review-active.png"}'where id='30303030-3030-4030-8030-303030303006';
insert into storage.objects(bucket_id,name,metadata,created_at,updated_at)values
('media','users/ops-review/orphan.png','{"size":11}',now()-interval '31 days',now()-interval '31 days'),
('media','users/30303030-3030-4030-8030-303030303006/ops-review-active.png','{"size":12}',now()-interval '31 days',now()-interval '31 days'),
('media','users/ops-review/encoded space.png','{"size":13}',now()-interval '31 days',now()-interval '31 days'),
('media','users/ops-review/message-only.png','{"size":14}',now()-interval '31 days',now()-interval '31 days'),
('media','users/ops-review/new-orphan.png','{"size":15}',now()-interval '1 hour',now()-interval '1 hour'),
('attachments','channels/30303030-3030-4030-8030-303030303021/30303030-3030-4030-8030-303030303022/ops-review-kept.bin','{"size":16}',now()-interval '31 days',now()-interval '31 days'),
('brand','ops-review-protected.png','{"size":17}',now()-interval '200 days',now()-interval '200 days');
-- INSERT_ACTUAL_REVIEW_HERE
select pg_temp.ops_check('Old empty guest is reviewable',exists(select 1 from pg_temp.onyx_ops_guests where id='30303030-3030-4030-8030-303030303001'and last_activity<now()-interval '90 days'and not protected_content));
select pg_temp.ops_check('Recent guest remains protected',exists(select 1 from pg_temp.onyx_ops_guests where id='30303030-3030-4030-8030-303030303002'and last_activity>now()-interval '90 days'));
select pg_temp.ops_check('Historical authored content remains protected',exists(select 1 from pg_temp.onyx_ops_guests where id='30303030-3030-4030-8030-303030303003'and protected_content));
select pg_temp.ops_check('Recent session refresh protects an old guest',exists(select 1 from pg_temp.onyx_ops_guests where id='30303030-3030-4030-8030-303030303004'and last_activity>now()-interval '90 days'));
select pg_temp.ops_check('Pending email linking is excluded',not exists(select 1 from pg_temp.onyx_ops_guests where id='30303030-3030-4030-8030-303030303005'));
select pg_temp.ops_check('Registered account is excluded',not exists(select 1 from pg_temp.onyx_ops_guests where id='30303030-3030-4030-8030-303030303006'));
select pg_temp.ops_check('Recent reads protect an old guest',exists(select 1 from pg_temp.onyx_ops_guests where id='30303030-3030-4030-8030-303030303007'and last_activity>now()-interval '90 days'));
select pg_temp.ops_check('Old unreferenced file is reviewable',exists(select 1 from pg_temp.onyx_ops_objects where name='users/ops-review/orphan.png'and supported and not referenced and greatest(created_at,updated_at)<now()-interval '30 days'));
select pg_temp.ops_check('Profile avatar stays referenced',(select referenced from pg_temp.onyx_ops_objects where name='users/30303030-3030-4030-8030-303030303006/ops-review-active.png'));
select pg_temp.ops_check('Encoded public URL stays referenced',(select referenced from pg_temp.onyx_ops_objects where name='users/ops-review/encoded space.png'));
select pg_temp.ops_check('Freeform message URL stays referenced',(select referenced from pg_temp.onyx_ops_objects where name='users/ops-review/message-only.png'));
select pg_temp.ops_check('Attachment path stays referenced',(select referenced from pg_temp.onyx_ops_objects where name='channels/30303030-3030-4030-8030-303030303021/30303030-3030-4030-8030-303030303022/ops-review-kept.bin'));
select pg_temp.ops_check('Fresh orphan stays within grace period',(select greatest(created_at,updated_at)>now()-interval '30 days'from pg_temp.onyx_ops_objects where name='users/ops-review/new-orphan.png'));
select pg_temp.ops_check('Brand file is never a candidate',(select not supported from pg_temp.onyx_ops_objects where name='ops-review-protected.png'));
select pg_temp.ops_check('URL encoding preserves UTF8 bytes and slashes',pg_temp.onyx_ops_encoded('users/ü space.png')='users/%C3%BC%20space.png');
select pg_temp.ops_check('Preview does not delete fixture accounts',(select count(*)=7 from auth.users where id::text like '30303030-3030-4030-8030-30303030300%'));
select pg_temp.ops_check('Preview does not delete fixture objects',(select count(*)=7 from storage.objects where name like '%ops-review%'));
select jsonb_build_object('passed',count(*)filter(where ok),'total',count(*),'failures',coalesce(jsonb_agg(name)filter(where not ok),'[]'::jsonb))as operations_tests from pg_temp.onyx_ops_results;
rollback;
