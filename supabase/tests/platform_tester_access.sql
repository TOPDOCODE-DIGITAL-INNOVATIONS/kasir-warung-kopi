begin;

create function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$
begin
  if condition is distinct from true then raise exception '%', message; end if;
end $$;

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
  ('e8160000-0000-0000-0000-000000000001', 'tester-admin@example.invalid', now(), '{"platform_role":"super_admin","account_status":"active"}', '{"name":"Admin Uji"}'),
  ('e8160000-0000-0000-0000-000000000002', 'tester-owner@example.invalid', now(), '{"platform_role":"owner"}', '{"name":"Owner Penguji"}'),
  ('e8160000-0000-0000-0000-000000000003', 'trial-owner@example.invalid', now(), '{"platform_role":"owner"}', '{"name":"Owner Trial"}'),
  ('e8160000-0000-0000-0000-000000000004', 'other-admin@example.invalid', now(), '{"platform_role":"super_admin","account_status":"inactive"}', '{}');

insert into public.businesses (id, name, owner_id, last_synced_at, last_device_code) values
  ('e8160000-0000-0000-0000-0000000000b1', 'Cabang Uji', 'e8160000-0000-0000-0000-000000000002', now() - interval '1 hour', 'TAB-1');
insert into public.transactions (business_id, id, created_at, grand_total, status) values
  ('e8160000-0000-0000-0000-0000000000b1', 'tx-1', now() - interval '2 hours', 25000, 'completed'),
  ('e8160000-0000-0000-0000-0000000000b1', 'tx-2', now() - interval '3 hours', 15000, 'completed'),
  ('e8160000-0000-0000-0000-0000000000b1', 'tx-3', now() - interval '3 hours', 99000, 'cancelled');
insert into public.shifts (business_id, id, cashier_name, start_time, end_time, total_transactions) values
  ('e8160000-0000-0000-0000-0000000000b1', 'shift-1', 'Kasir A', now() - interval '5 hours', now() - interval '1 hour', 2);

select pg_temp.assert_true(
  not has_function_privilege('authenticated', 'public.platform_set_tester_access(uuid,uuid,text,timestamptz,text)', 'execute')
  and not has_function_privilege('anon', 'public.platform_end_trial(uuid,uuid,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.platform_insights(uuid,text,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.platform_owner_activity(uuid,uuid,text)', 'execute'),
  'browser roles cannot call the new platform functions'
);

set local role service_role;

-- Izin & validasi
select pg_temp.assert_true(
  public.platform_end_trial('e8160000-0000-0000-0000-000000000004', 'e8160000-0000-0000-0000-000000000003', 'test') = 'forbidden'
  and public.platform_set_tester_access('e8160000-0000-0000-0000-000000000002', 'e8160000-0000-0000-0000-000000000002', 'test', now() + interval '30 days', null) = 'forbidden'
  and public.platform_set_tester_access('e8160000-0000-0000-0000-000000000001', 'e8160000-0000-0000-0000-000000000002', 'test', now() - interval '1 day', null) = 'invalid_period'
  and public.platform_set_tester_access('e8160000-0000-0000-0000-000000000001', 'e8160000-0000-0000-0000-000000000002', 'test', now() + interval '4 years', null) = 'invalid_period'
  and public.platform_set_tester_access('e8160000-0000-0000-0000-000000000001', 'e8160000-0000-0000-0000-000000000004', 'test', now() + interval '30 days', null) = 'owner_not_found'
  and public.platform_set_tester_access('e8160000-0000-0000-0000-000000000001', 'e8160000-0000-0000-0000-000000000002', 'test', null, null) = 'not_tester',
  'tester and trial mutations check actor, period and target'
);

-- Trial berjalan lalu dihentikan Super Admin; trial otomatis tidak dimulai lagi.
select public.owner_billing_status('e8160000-0000-0000-0000-000000000003', 'test', 14);
select pg_temp.assert_true(
  (select data #>> '{owner,trial_status}' = 'active'
    from public.platform_billing_owner_detail('e8160000-0000-0000-0000-000000000001', 'test', 'e8160000-0000-0000-0000-000000000003') data),
  'auto trial is active before admin ends it'
);
select pg_temp.assert_true(
  public.platform_end_trial('e8160000-0000-0000-0000-000000000001', 'e8160000-0000-0000-0000-000000000003', 'test') = 'ended'
  and public.platform_end_trial('e8160000-0000-0000-0000-000000000001', 'e8160000-0000-0000-0000-000000000003', 'test') = 'trial_not_active',
  'admin can end an active trial exactly once'
);
select pg_temp.assert_true(
  (select (data->>'trial_ends_at')::timestamptz <= now()
    from public.owner_billing_status('e8160000-0000-0000-0000-000000000003', 'test', 14) data),
  'owner_billing_status does not restart an ended trial'
);

-- Owner yang belum pernah trial dijadikan penguji: trial ditandai terpakai, akses penguji berlaku.
select pg_temp.assert_true(
  public.platform_set_tester_access('e8160000-0000-0000-0000-000000000001', 'e8160000-0000-0000-0000-000000000002', 'test', now() + interval '90 days', '  Beta batch 1  ') = 'granted',
  'eligible owner can be made a tester'
);
select pg_temp.assert_true(
  (select data->>'tester_until' is not null and (data->>'trial_ends_at')::timestamptz <= now()
    from public.owner_billing_status('e8160000-0000-0000-0000-000000000002', 'test', 14) data),
  'tester access is returned to the owner app and no trial auto-starts'
);
select pg_temp.assert_true(
  (select data #>> '{owner,tester_status}' = 'active' and data #>> '{owner,tester_note}' = 'Beta batch 1'
     and jsonb_array_length(data->'audit') >= 2
    from public.platform_billing_owner_detail('e8160000-0000-0000-0000-000000000001', 'test', 'e8160000-0000-0000-0000-000000000002') data)
  and (select data #>> '{owner,tester_status}' = 'none'
    from public.platform_billing_owner_detail('e8160000-0000-0000-0000-000000000001', 'live', 'e8160000-0000-0000-0000-000000000002') data),
  'tester status, note and audit appear in detail and stay isolated from Live'
);
select pg_temp.assert_true(
  (select (data #>> '{summary,tester_active}')::int >= 1
     and exists (select 1 from jsonb_array_elements(data->'owners') o where o->>'owner_id' = 'e8160000-0000-0000-0000-000000000002')
     and not exists (select 1 from jsonb_array_elements(data->'owners') o where o->>'tester_status' <> 'active')
    from public.platform_billing_overview('e8160000-0000-0000-0000-000000000001', 'test', 'example.invalid', 'tester_active', 0, 25) data),
  'overview counts and filters tester accounts'
);

-- Cabut akses penguji
select pg_temp.assert_true(
  public.platform_set_tester_access('e8160000-0000-0000-0000-000000000001', 'e8160000-0000-0000-0000-000000000002', 'test', null, null) = 'revoked',
  'tester access can be revoked'
);
select pg_temp.assert_true(
  (select data #>> '{owner,tester_status}' = 'expired'
    from public.platform_billing_owner_detail('e8160000-0000-0000-0000-000000000001', 'test', 'e8160000-0000-0000-0000-000000000002') data),
  'revoked tester shows as expired'
);

-- Aktivitas Owner & insight platform
select pg_temp.assert_true(
  public.platform_owner_activity('e8160000-0000-0000-0000-000000000004', 'e8160000-0000-0000-0000-000000000002', 'test') is null,
  'inactive admin cannot read owner activity'
);
select pg_temp.assert_true(
  (select (data #>> '{totals,transactions_30d}')::int = 2
     and (data #>> '{totals,revenue_30d}')::numeric = 40000
     and (data #>> '{totals,active_branches_7d}')::int = 1
     and jsonb_array_length(data->'daily') = 30
     and (data #>> '{branches,0,transactions_30d}')::int = 2
     and exists (select 1 from jsonb_array_elements(data->'events') e where e->>'kind' = 'shift_closed')
     and exists (select 1 from jsonb_array_elements(data->'events') e where e->>'kind' = 'billing:tester_granted')
    from public.platform_owner_activity('e8160000-0000-0000-0000-000000000001', 'e8160000-0000-0000-0000-000000000002', 'test') data),
  'owner activity aggregates completed transactions, branches and events'
);
select pg_temp.assert_true(
  (select jsonb_array_length(data->'series') = 30 and data->>'unit' = 'day'
     and (data #>> '{kpis,transactions}')::int >= 2
     and (data #>> '{kpis,active_owners_7d}')::int >= 1
     and exists (select 1 from jsonb_array_elements(data->'top_owners') t where t->>'owner_id' = 'e8160000-0000-0000-0000-000000000002')
    from public.platform_insights('e8160000-0000-0000-0000-000000000001', 'test', '30d') data)
  and (select jsonb_array_length(data->'series') = 12 and data->>'unit' = 'month'
    from public.platform_insights('e8160000-0000-0000-0000-000000000001', 'test', '12m') data)
  and (select jsonb_array_length(data->'series') = 13 and data->>'unit' = 'week'
    from public.platform_insights('e8160000-0000-0000-0000-000000000001', 'test', '90d') data)
  and public.platform_insights('e8160000-0000-0000-0000-000000000001', 'test', 'bad') is null
  and public.platform_insights('e8160000-0000-0000-0000-000000000004', 'test', '30d') is null,
  'platform insights return bucketed series for each range and enforce access'
);
reset role;

rollback;
