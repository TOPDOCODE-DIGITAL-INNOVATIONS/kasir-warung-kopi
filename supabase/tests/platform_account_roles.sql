-- Run via scripts/test-platform-migration.mjs; all fixtures and DDL roll back.
begin;
create function pg_temp.assert_true(ok boolean, message text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL: %', message; end if;
  raise notice 'PASS: %', message;
end;
$$;

create function pg_temp.public_fingerprint() returns jsonb language plpgsql as $$
declare t record; fingerprint text; result jsonb := '{}'::jsonb;
begin
  for t in select tablename from pg_tables where schemaname='public' order by tablename loop
    execute format('select md5(coalesce(string_agg(to_jsonb(r)::text, '''' order by to_jsonb(r)::text), '''')) from public.%I r', t.tablename) into fingerprint;
    result := result || jsonb_build_object(t.tablename, fingerprint);
  end loop;
  return result;
end;
$$;

insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values
 ('e8100000-0000-0000-0000-000000000001','legacy-platform@example.invalid','{"name":"Legacy owner","role":"super_admin"}','{"provider":"email","providers":["email"],"custom":{"keep":true}}'),
 ('e8100000-0000-0000-0000-000000000002','trusted-platform@example.invalid','{"name":"Trusted admin"}','{"provider":"email","providers":["email"],"platform_role":"super_admin","account_status":"inactive"}');
-- Simulate a legacy account even if this test is run after the migration.
update auth.users set raw_app_meta_data = raw_app_meta_data - 'platform_role' - 'account_status'
where id='e8100000-0000-0000-0000-000000000001';

create temp table public_before as select pg_temp.public_fingerprint() as data;
create temp table policies_before as select md5(string_agg(to_jsonb(p)::text,'' order by to_jsonb(p)::text)) as data from pg_policies p;
create temp table auth_before as select id, to_jsonb(u)-'raw_app_meta_data' as data from auth.users u;
create temp table sessions_before as select id, to_jsonb(s) as data from auth.sessions s;
create temp table identities_before as select id, to_jsonb(i) as data from auth.identities i;

-- APPLY_MIGRATION_HERE

select pg_temp.assert_true((select raw_app_meta_data->>'platform_role'='owner' and raw_app_meta_data->>'account_status'='active' from auth.users where id='e8100000-0000-0000-0000-000000000001'), 'legacy account gets trusted defaults; editable super_admin is ignored');
select pg_temp.assert_true((select raw_app_meta_data @> '{"provider":"email","providers":["email"],"custom":{"keep":true}}' from auth.users where id='e8100000-0000-0000-0000-000000000001'), 'Supabase provider fields and custom app metadata survive');
select pg_temp.assert_true((select raw_app_meta_data->>'platform_role'='super_admin' and raw_app_meta_data->>'account_status'='inactive' from auth.users where id='e8100000-0000-0000-0000-000000000002'), 'existing trusted role and inactive status are preserved');
select pg_temp.assert_true(not exists(select 1 from auth.users u join auth_before b using(id) where to_jsonb(u)-'raw_app_meta_data' is distinct from b.data), 'IDs, passwords, sessions fields, user metadata and timestamps are unchanged');
select pg_temp.assert_true((select count(*) from auth.sessions)=(select count(*) from sessions_before) and not exists(select 1 from auth.sessions s full join sessions_before b using(id) where to_jsonb(s) is distinct from b.data), 'existing Auth sessions are preserved');
select pg_temp.assert_true((select count(*) from auth.identities)=(select count(*) from identities_before) and not exists(select 1 from auth.identities i full join identities_before b using(id) where to_jsonb(i) is distinct from b.data), 'linked Auth identities are preserved');
select pg_temp.assert_true(pg_temp.public_fingerprint()=(select data from public_before), 'all public business rows remain byte-for-byte equal');
select pg_temp.assert_true((select md5(string_agg(to_jsonb(p)::text,'' order by to_jsonb(p)::text)) from pg_policies p)=(select data from policies_before), 'existing RLS policies are unchanged');
create temp table metadata_after as select id, raw_app_meta_data from auth.users;

-- APPLY_MIGRATION_HERE

select pg_temp.assert_true(not exists(select 1 from auth.users u join metadata_after b using(id) where u.raw_app_meta_data is distinct from b.raw_app_meta_data), 're-running migration preserves existing metadata');

-- Execute as the actual Auth service role to catch trigger permission failures.
set local role supabase_auth_admin;
insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values
 ('e8100000-0000-0000-0000-000000000003','signup-platform@example.invalid','{"name":"New owner","role":"super_admin","platform_role":"super_admin"}','{"provider":"email","providers":["email"]}');
reset role;
select pg_temp.assert_true((select raw_app_meta_data->>'platform_role'='owner' and raw_app_meta_data->>'account_status'='active' from auth.users where id='e8100000-0000-0000-0000-000000000003'), 'new Auth signup succeeds with owner defaults despite forged user metadata');
select pg_temp.assert_true(not has_function_privilege('authenticated','platform_private.initialize_account()','execute') and not has_function_privilege('anon','platform_private.initialize_account()','execute'), 'trigger function is not callable by public API roles');

set local role authenticated;
set local request.jwt.claims='{"sub":"e8100000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"platform_role":"super_admin"}}';
select pg_temp.assert_true(not exists(select 1 from public.businesses), 'super_admin has no RLS bypass to other owners branches');
reset role;

rollback;
