-- Run with psql -v ON_ERROR_STOP=1 after applying migrations. All fixtures roll back.
begin;
create function pg_temp.sync_assert(ok boolean, message text) returns void
language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'FAIL: %', message; end if;
  raise notice 'PASS: %', message;
end $$;

select pg_temp.sync_assert(exists(select 1 from information_schema.columns
  where table_schema='public' and table_name='transactions' and column_name='edit_history'),
  'transaction correction history is part of the migrated schema');

insert into auth.users(id,email) values
  ('fa120000-0000-0000-0000-000000000001','merge-test-a@example.invalid'),
  ('fa120000-0000-0000-0000-000000000002','merge-test-b@example.invalid');
insert into public.businesses(id,owner_id,name,sync_token) values
  ('fb120000-0000-0000-0000-000000000001','fa120000-0000-0000-0000-000000000001','Merge test A','merge-test-token-a'),
  ('fb120000-0000-0000-0000-000000000002','fa120000-0000-0000-0000-000000000002','Merge test B','merge-test-token-b');

set local role anon;
select set_config('request.headers','{"x-sync-token":"merge-test-token-a"}',true);
insert into public.draft_orders(business_id,id,label,raw,updated_at)
values('fb120000-0000-0000-0000-000000000001','draft-a','Meja A','{"items":[]}',now());
select pg_temp.sync_assert((select count(*)=1 from public.draft_orders),
  'publishable-key POS can insert and read its own branch draft');
update public.draft_orders set label='Meja A baru'
where business_id='fb120000-0000-0000-0000-000000000001' and id='draft-a';
select pg_temp.sync_assert((select label='Meja A baru' from public.draft_orders where id='draft-a'),
  'POS can update its own draft');

do $$ begin
  begin
    insert into public.draft_orders(business_id,id,raw,updated_at)
    values('fb120000-0000-0000-0000-000000000002','foreign','{}',now());
    raise exception 'FAIL: foreign-branch insert was accepted';
  exception when insufficient_privilege then
    raise notice 'PASS: foreign-branch draft insert rejected';
  end;
end $$;

select set_config('request.headers','{"x-sync-token":"merge-test-token-b"}',true);
select pg_temp.sync_assert((select count(*)=0 from public.draft_orders),
  'another branch token cannot read the draft');
insert into public.draft_orders(business_id,id,raw,updated_at)
values('fb120000-0000-0000-0000-000000000002','draft-b','{}',now());

select set_config('request.headers','{}',true);
select pg_temp.sync_assert((select count(*)=0 from public.draft_orders),
  'anonymous requests without a sync token cannot read drafts');
set local role authenticated;
select set_config('request.jwt.claim.sub','fa120000-0000-0000-0000-000000000001',true);
select pg_temp.sync_assert((select count(*)=1 from public.draft_orders),
  'owner reads only drafts from owned branches');

set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.headers','{"x-sync-token":"merge-test-token-a"}',true);
delete from public.draft_orders where id='draft-a';
select pg_temp.sync_assert((select count(*)=0 from public.draft_orders),
  'POS can delete its own draft');
reset role;
select pg_temp.sync_assert((select count(*)=1 from public.draft_orders
  where business_id='fb120000-0000-0000-0000-000000000002'),
  'another branch draft remains intact');
rollback;
