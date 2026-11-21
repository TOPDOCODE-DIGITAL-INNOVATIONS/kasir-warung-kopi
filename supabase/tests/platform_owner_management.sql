begin;

create function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$
begin
  if condition is distinct from true then raise exception '%', message; end if;
end $$;

insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data, created_at) values
  ('e8110000-0000-0000-0000-000000000001', 'owner-qa-super@example.invalid', '{}', '{"platform_role":"super_admin","account_status":"active"}', '2026-11-18'),
  ('e8110000-0000-0000-0000-000000000002', 'owner-qa-inactive@example.invalid', '{}', '{"platform_role":"super_admin","account_status":"inactive"}', '2026-11-18'),
  ('e8110000-0000-0000-0000-000000000003', 'owner-qa-active@example.invalid', '{"name":"Fixture Akun Owner","role":"super_admin"}',
    '{"platform_role":"owner","account_status":"active","provider":"email","providers":["email"],"custom":{"keep":true}}', '2026-11-18'),
  ('e8110000-0000-0000-0000-000000000004', 'owner-qa-paused@example.invalid', '{"full_name":"Fixture Owner Nonaktif"}',
    '{"platform_role":"owner","account_status":"inactive"}', '2026-11-17');

select pg_temp.assert_true(
  not has_function_privilege('anon', 'public.platform_list_owners(uuid,text,text,integer,integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.platform_set_owner_status(uuid,uuid,text,text)', 'execute'),
  'browser roles cannot execute the platform functions'
);

set local role service_role;
select pg_temp.assert_true(
  (select count(*) = 2 from public.platform_list_owners('e8110000-0000-0000-0000-000000000001', 'OWNER-QA-', null, 0, 26)),
  'active Super Admin sees Owners only and search is case-insensitive'
);
select pg_temp.assert_true(
  (select email = 'owner-qa-paused@example.invalid' from public.platform_list_owners('e8110000-0000-0000-0000-000000000001', 'fixture', null, 1, 1)),
  'filter and deterministic ordering apply before pagination'
);
select pg_temp.assert_true(
  (select email = 'owner-qa-paused@example.invalid' from public.platform_list_owners('e8110000-0000-0000-0000-000000000001', 'owner-qa-', 'inactive', 0, 1)),
  'inactive filter includes paused Owner'
);
select pg_temp.assert_true(
  not exists (select 1 from public.platform_list_owners('e8110000-0000-0000-0000-000000000003', 'owner-qa-', null, 0, 26)),
  'user metadata cannot grant platform access'
);
select pg_temp.assert_true(
  not public.platform_set_owner_status('e8110000-0000-0000-0000-000000000002', 'e8110000-0000-0000-0000-000000000003', 'active', 'inactive'),
  'inactive Super Admin cannot mutate accounts'
);
select pg_temp.assert_true(
  not public.platform_set_owner_status('e8110000-0000-0000-0000-000000000001', 'e8110000-0000-0000-0000-000000000002', 'inactive', 'active'),
  'Super Admin is excluded from Owner mutations'
);
select pg_temp.assert_true(
  public.platform_set_owner_status('e8110000-0000-0000-0000-000000000001', 'e8110000-0000-0000-0000-000000000003', 'active', 'inactive'),
  'active Super Admin can deactivate an Owner'
);
select pg_temp.assert_true(
  not public.platform_set_owner_status('e8110000-0000-0000-0000-000000000001', 'e8110000-0000-0000-0000-000000000003', 'active', 'inactive'),
  'repeated or stale expected status does not overwrite the current state'
);
reset role;

select pg_temp.assert_true(
  (select raw_app_meta_data = '{"platform_role":"owner","account_status":"inactive","provider":"email","providers":["email"],"custom":{"keep":true}}'::jsonb
    and raw_user_meta_data = '{"name":"Fixture Akun Owner","role":"super_admin"}'::jsonb
    from auth.users where id = 'e8110000-0000-0000-0000-000000000003'),
  'status mutation only changes trusted status and preserves profile and providers'
);
set local role service_role;
select pg_temp.assert_true(
  public.platform_set_owner_status('e8110000-0000-0000-0000-000000000001', 'e8110000-0000-0000-0000-000000000003', 'inactive', 'active'),
  'active Super Admin can reactivate an Owner'
);
reset role;

select pg_temp.assert_true(
  not has_function_privilege('authenticated', 'public.platform_owner_overview(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.platform_list_owners_with_branches(uuid,text,text,integer,integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.platform_get_owner_detail(uuid,uuid,integer,integer)', 'execute'),
  'browser roles cannot call overview and branch-detail functions directly'
);
create temp table before_branches as
  select * from public.platform_owner_overview('e8110000-0000-0000-0000-000000000001');
insert into public.businesses (id, owner_id, name, created_at) values
  ('e8111000-0000-0000-0000-000000000001', 'e8110000-0000-0000-0000-000000000003', 'Cabang Awal', '2026-11-17'),
  ('e8111000-0000-0000-0000-000000000002', 'e8110000-0000-0000-0000-000000000003', 'Cabang Terbaru', '2026-11-18'),
  ('e8111000-0000-0000-0000-000000000003', 'e8110000-0000-0000-0000-000000000001', 'Cabang di luar lingkup Owner', '2026-11-18');
select pg_temp.assert_true(
  (select after.branch_count = before.branch_count + 2 and after.owner_count = before.owner_count
    and after.owner_count = after.active_owner_count + after.inactive_owner_count
    from public.platform_owner_overview('e8110000-0000-0000-0000-000000000001') after cross join before_branches before),
  'overview counts registered branches of Owners and splits the total by status'
);
set local role service_role;
select pg_temp.assert_true(
  (select array_agg(branch_count order by branch_count) = array[0, 2]::bigint[]
    from public.platform_list_owners_with_branches('e8110000-0000-0000-0000-000000000001', 'owner-qa-', null, 0, 26)),
  'owner list includes exact counts and retains owners with zero branches'
);
select pg_temp.assert_true(
  (select (detail->>'branch_count')::int = 2 and jsonb_array_length(detail->'branches') = 1
    and detail #>> '{branches,0,name}' = 'Cabang Awal'
    and (detail->'branches'->0) - array['id','name','created_at'] = '{}'::jsonb
    from public.platform_get_owner_detail('e8110000-0000-0000-0000-000000000001', 'e8110000-0000-0000-0000-000000000003', 1, 1) detail),
  'owner detail paginates only the requested Owner branches and excludes sensitive branch fields'
);
select pg_temp.assert_true(
  public.platform_get_owner_detail('e8110000-0000-0000-0000-000000000003', 'e8110000-0000-0000-0000-000000000004', 0, 1) is null
  and public.platform_get_owner_detail('e8110000-0000-0000-0000-000000000001', 'e8110000-0000-0000-0000-000000000002', 0, 1) is null
  and not exists (select 1 from public.platform_owner_overview('e8110000-0000-0000-0000-000000000002')),
  'Owners have no access, Super Admin accounts are excluded as targets, and inactive Super Admin has no overview'
);
rollback;
