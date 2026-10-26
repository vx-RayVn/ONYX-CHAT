-- Synthetic private declarations only. No account, order, payment or email is created.
begin;
create temporary table commerce_test_baseline as select (select last_value from public.member_number_seq) seq,(select count(*) from public.profiles) profiles,(select count(*) from private.billing_orders) orders;
do $$
declare i integer;result jsonb;again jsonb;leased jsonb;other jsonb;notice uuid:='00000000-0034-4000-8000-000000000001';f record;token uuid;
begin
 assert (select last_value from public.member_number_seq)=(select seq from commerce_test_baseline),'sequence baseline changed';
 for f in select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args,p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private') and(p.proname like 'commerce_%' or p.proname='billing_reserve_with_terms') loop
  assert not has_function_privilege('anon',f.oid,'EXECUTE'),'anonymous RPC access';
  assert not has_function_privilege('authenticated',f.oid,'EXECUTE'),'authenticated RPC access';
  assert has_function_privilege('service_role',f.oid,'EXECUTE'),'service RPC missing';
 end loop;
 assert not has_table_privilege('anon','private.commerce_notices','SELECT');
 assert not has_table_privilege('authenticated','private.commerce_mail','SELECT');
 assert (select relrowsecurity from pg_class where oid='private.commerce_notices'::regclass);
 assert (select relrowsecurity from pg_class where oid='private.commerce_mail'::regclass);
 result:=private.commerce_notice_accept(notice,repeat('a',64),repeat('b',64),repeat('c',64),jsonb_build_object('id',notice,'kind','cancel','email','synthetic@example.invalid'),'synthetic receipt',now());
 assert result->>'receipt'='synthetic receipt';
 assert (select count(*) from private.commerce_mail where notice_id=notice)=2,'consumer and operator copies';
 again:=private.commerce_notice_accept(notice,repeat('a',64),repeat('b',64),repeat('c',64),jsonb_build_object('id',notice,'kind','cancel','email','synthetic@example.invalid'),'changed retry clock',now());
 assert again=result,'retry preserves original receipt';
 assert (select count(*) from private.commerce_mail where notice_id=notice)=2,'retry duplicated mail';
 begin
  perform private.commerce_notice_accept(notice,repeat('d',64),repeat('b',64),repeat('c',64),jsonb_build_object('id',notice,'kind','cancel','email','synthetic@example.invalid'),'synthetic receipt',now());raise exception 'conflict accepted';
 exception when check_violation then null;end;
 begin
  perform private.commerce_notice_accept(gen_random_uuid(),null,repeat('b',64),repeat('c',64),'{}','synthetic receipt',now());raise exception 'null accepted';
 exception when check_violation then null;end;
 begin
  perform private.commerce_notice_accept(gen_random_uuid(),repeat('a',64),repeat('b',64),repeat('c',64),'{}','synthetic receipt',now());raise exception 'empty object accepted';
 exception when check_violation then null;end;
 for i in 2..3 loop
  declare new_id uuid:=gen_random_uuid();begin perform private.commerce_notice_accept(new_id,repeat('a',64),repeat('b',64),repeat('c',64),jsonb_build_object('id',new_id,'kind','withdraw','email','synthetic@example.invalid'),'synthetic receipt',now());end;
 end loop;
 begin
  declare new_id uuid:=gen_random_uuid();begin perform private.commerce_notice_accept(new_id,repeat('a',64),repeat('b',64),repeat('c',64),jsonb_build_object('id',new_id,'kind','withdraw','email','synthetic@example.invalid'),'synthetic receipt',now());end;
  raise exception 'email rate limit not enforced';
 exception when sqlstate 'P0429' then null;end;
 leased:=private.commerce_mail_lease(notice);assert jsonb_array_length(leased)=2;
 other:=private.commerce_mail_lease(notice);assert jsonb_array_length(other)=0,'active lease reissued';
 assert not private.commerce_notice_delivery(notice);
 perform private.commerce_mail_finish((leased->0->>'id')::uuid,gen_random_uuid(),true);
 assert not private.commerce_notice_delivery(notice),'wrong lease token accepted';
 perform private.commerce_mail_finish((leased->0->>'id')::uuid,(leased->0->>'lease')::uuid,true);
 perform private.commerce_mail_finish((leased->1->>'id')::uuid,(leased->1->>'lease')::uuid,true);
 assert private.commerce_notice_delivery(notice);
 assert jsonb_array_length(private.commerce_mail_lease(notice))=0,'sent mail reissued';
 leased:=private.commerce_mail_lease(null);assert jsonb_array_length(leased)=4;
 perform private.commerce_mail_finish((leased->0->>'id')::uuid,(leased->0->>'lease')::uuid,false);
 assert (select next_attempt>now() from private.commerce_mail where id=(leased->0->>'id')::uuid),'failure has no backoff';
 update private.commerce_mail set created_at=now()-interval '24 hours',lease_until=null,next_attempt=now() where id=(leased->0->>'id')::uuid;
 perform private.commerce_mail_lease(null);
 assert(select state='manual' from private.commerce_mail where id=(leased->0->>'id')::uuid),'idempotency expiry not protected';
 begin
  perform private.billing_reserve_with_terms(null,'plus',null,true,false,repeat('0',64),repeat('x',101));raise exception 'wrong terms hash accepted';
 exception when check_violation then null;end;
 assert (select count(*) from private.billing_orders)=(select orders from commerce_test_baseline),'unexpected purchase';
 assert (select count(*) from public.profiles)=(select profiles from commerce_test_baseline),'unexpected profile';
 assert (select last_value from public.member_number_seq)=(select seq from commerce_test_baseline),'sequence changed';
end $$;
rollback;
