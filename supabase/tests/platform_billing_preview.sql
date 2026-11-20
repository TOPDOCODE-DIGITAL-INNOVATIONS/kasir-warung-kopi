begin;

create function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$
begin
  if condition is distinct from true then raise exception '%', message; end if;
end $$;

insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
  ('e8120000-0000-0000-0000-000000000001', 'billing-admin@example.invalid', '{}', '{"platform_role":"super_admin","account_status":"active"}'),
  ('e8120000-0000-0000-0000-000000000002', 'billing-inactive@example.invalid', '{}', '{"platform_role":"super_admin","account_status":"inactive"}'),
  ('e8120000-0000-0000-0000-000000000003', 'billing-trial@example.invalid', '{"name":"Billing QA Trial"}', '{"platform_role":"owner"}'),
  ('e8120000-0000-0000-0000-000000000004', 'billing-paid@example.invalid', '{"name":"Billing QA Paid"}', '{"platform_role":"owner"}'),
  ('e8120000-0000-0000-0000-000000000005', 'billing-uncovered@example.invalid', '{"name":"Billing QA Uncovered"}', '{"platform_role":"owner"}');

insert into public.businesses (owner_id, name) values
  ('e8120000-0000-0000-0000-000000000003', 'Free branch'),
  ('e8120000-0000-0000-0000-000000000004', 'Paid owner first branch'),
  ('e8120000-0000-0000-0000-000000000004', 'Paid owner additional branch'),
  ('e8120000-0000-0000-0000-000000000005', 'Uncovered owner first branch'),
  ('e8120000-0000-0000-0000-000000000005', 'Uncovered owner additional branch');

insert into billing.billing_accounts (owner_id, environment, trial_started_at, trial_ends_at) values
  ('e8120000-0000-0000-0000-000000000003', 'test', now() - interval '1 day', now() + interval '13 days'),
  ('e8120000-0000-0000-0000-000000000004', 'test', null, null);
insert into billing.billing_subscriptions (id, owner_id, environment, plan_id, status, period_start, period_end) values
  ('e8121000-0000-0000-0000-000000000001', 'e8120000-0000-0000-0000-000000000004', 'test',
    (select id from billing.billing_plans where code = 'yearly' and version = 1),
    'active', now() - interval '1 day', now() + interval '1 year');
insert into billing.billing_checkout_sessions (
  owner_id, environment, plan_id, reference_id, checkout_url, status, amount, expires_at
) values
  ('e8120000-0000-0000-0000-000000000003', 'test',
    (select id from billing.billing_plans where code = 'monthly' and version = 1),
    'qa-open', 'https://example.invalid/private-checkout', 'open', 100000, now() + interval '10 minutes');
insert into billing.billing_cycles (subscription_id, environment, xendit_cycle_id, status, amount, paid_at, period_start, period_end) values
  ('e8121000-0000-0000-0000-000000000001', 'test', 'qa-cycle', 'succeeded', 1100000, now(), now(), now() + interval '1 year');

select pg_temp.assert_true(
  not has_schema_privilege('authenticated', 'billing', 'usage')
  and not has_function_privilege('authenticated', 'public.platform_billing_overview(uuid,text,text,text,integer,integer)', 'execute')
  and not has_function_privilege('anon', 'public.platform_billing_owner_detail(uuid,text,uuid)', 'execute'),
  'billing tables and read functions are server-only'
);
set local role service_role;
select pg_temp.assert_true(
  (select jsonb_array_length(data->'owners') = 1 and data #>> '{owners,0,subscription_status}' = 'pending'
    and data #>> '{owners,0,trial_status}' = 'active' and data #>> '{owners,0,plan_name}' = 'Bulanan'
    and data #>> '{owners,0,branch_count}' = '1' and data #>> '{owners,0,branch_coverage}' = 'free'
    from public.platform_billing_overview('e8120000-0000-0000-0000-000000000001', 'test', 'Billing QA', 'pending', 0, 26) data),
  'the first branch remains free with an active trial and a pending upgrade'
);
select pg_temp.assert_true(
  (select data #>> '{owners,0,subscription_status}' = 'none' and data #>> '{owners,0,trial_status}' = 'none'
    from public.platform_billing_overview('e8120000-0000-0000-0000-000000000001', 'live', 'Billing QA Trial', null, 0, 26) data),
  'test trial and checkout do not affect the live environment'
);
select pg_temp.assert_true(
  (select data #>> '{owner,subscription_status}' = 'active' and data #>> '{owner,plan_name}' = 'Tahunan'
    and data #>> '{owner,branch_count}' = '2' and data #>> '{owner,branch_coverage}' = 'covered'
    and data #>> '{cycles,0,status}' = 'succeeded' and data #>> '{cycles,0,amount}' = '1100000'
    and (data #>> '{cycles,0,period_end}')::timestamptz = (data #>> '{cycles,0,period_start}')::timestamptz + interval '1 year'
    from public.platform_billing_owner_detail('e8120000-0000-0000-0000-000000000001', 'test', 'e8120000-0000-0000-0000-000000000004') data),
  'detail includes the verified subscription period and the matching invoice history'
);
select pg_temp.assert_true(
  (select jsonb_array_length(data->'owners') = 1 and data #>> '{owners,0,branch_coverage}' = 'uncovered'
    and data #>> '{owners,0,owner_id}' = 'e8120000-0000-0000-0000-000000000005'
    from public.platform_billing_overview('e8120000-0000-0000-0000-000000000001', 'test', 'Billing QA', 'additional_uncovered', 0, 26) data)
  and (select data #>> '{owner,branch_coverage}' = 'uncovered'
    from public.platform_billing_owner_detail('e8120000-0000-0000-0000-000000000001', 'live', 'e8120000-0000-0000-0000-000000000004') data),
  'uncovered additional branches can be filtered and test payments do not cover live branches'
);
select pg_temp.assert_true(
  (select data #>> '{checkouts,0,reference_id}' = 'qa-open' and not ((data->'checkouts'->0) ? 'checkout_url')
    from public.platform_billing_owner_detail('e8120000-0000-0000-0000-000000000001', 'test', 'e8120000-0000-0000-0000-000000000003') data),
  'checkout history excludes the private checkout link'
);
select pg_temp.assert_true(
  public.platform_billing_overview('e8120000-0000-0000-0000-000000000002', 'test', '', null, 0, 26) is null
  and public.platform_billing_owner_detail('e8120000-0000-0000-0000-000000000003', 'test', 'e8120000-0000-0000-0000-000000000004') is null,
  'an inactive Super Admin cannot list billing and Owners cannot access another Owner’s history'
);
rollback;
