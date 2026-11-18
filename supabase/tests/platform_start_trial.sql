begin;

create function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$
begin
  if condition is distinct from true then raise exception '%', message; end if;
end $$;

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data) values
  ('e8130000-0000-0000-0000-000000000001', 'trial-admin@example.invalid', now(), '{"platform_role":"super_admin","account_status":"active"}'),
  ('e8130000-0000-0000-0000-000000000002', 'trial-inactive@example.invalid', now(), '{"platform_role":"super_admin","account_status":"inactive"}'),
  ('e8130000-0000-0000-0000-000000000003', 'trial-owner@example.invalid', now(), '{"platform_role":"owner"}'),
  ('e8130000-0000-0000-0000-000000000004', 'trial-unverified@example.invalid', null, '{"platform_role":"owner"}');

insert into billing.billing_accounts (owner_id, environment, xendit_customer_id)
values ('e8130000-0000-0000-0000-000000000003', 'test', 'trial-fixture-customer');

select pg_temp.assert_true(
  not has_function_privilege('anon', 'public.platform_start_trial(uuid,uuid,text,integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.platform_start_trial(uuid,uuid,text,integer)', 'execute'),
  'direct browser users cannot execute the trial mutation'
);

set local role service_role;
select pg_temp.assert_true(
  public.platform_start_trial('e8130000-0000-0000-0000-000000000002', 'e8130000-0000-0000-0000-000000000003', 'test', 14) = 'forbidden'
  and public.platform_start_trial('e8130000-0000-0000-0000-000000000003', 'e8130000-0000-0000-0000-000000000004', 'test', 14) = 'forbidden',
  'inactive Super Admin and Owner cannot start trials'
);
select pg_temp.assert_true(
  public.platform_start_trial('e8130000-0000-0000-0000-000000000001', 'e8130000-0000-0000-0000-000000000002', 'test', 14) = 'owner_not_found'
  and public.platform_start_trial('e8130000-0000-0000-0000-000000000001', 'e8130000-0000-0000-0000-000000000004', 'test', 14) = 'email_unverified'
  and public.platform_start_trial('e8130000-0000-0000-0000-000000000001', 'e8130000-0000-0000-0000-000000000003', 'invalid', 14) = 'invalid_request',
  'trial checks the target role, email verification, and environment'
);
select pg_temp.assert_true(
  public.platform_start_trial('e8130000-0000-0000-0000-000000000001', 'e8130000-0000-0000-0000-000000000003', 'test', 14) = 'started',
  'eligible Owner can receive a trial using the existing billing account'
);
select pg_temp.assert_true(
  public.platform_start_trial('e8130000-0000-0000-0000-000000000001', 'e8130000-0000-0000-0000-000000000003', 'test', 15) = 'trial_already_used',
  'retry with another duration cannot rewrite the original trial'
);
select pg_temp.assert_true(
  (select data #>> '{owner,trial_status}' = 'active' and data #>> '{owner,subscription_status}' = 'none'
    from public.platform_billing_owner_detail('e8130000-0000-0000-0000-000000000001', 'test', 'e8130000-0000-0000-0000-000000000003') data)
  and
  (select data #>> '{owner,trial_status}' = 'none'
    from public.platform_billing_owner_detail('e8130000-0000-0000-0000-000000000001', 'live', 'e8130000-0000-0000-0000-000000000003') data),
  'the trial is reflected immediately and isolated from Live billing'
);
reset role;

select pg_temp.assert_true(
  (select trial_ends_at - trial_started_at = interval '336 hours'
    and trial_started_by = 'e8130000-0000-0000-0000-000000000001'::uuid
    and xendit_customer_id = 'trial-fixture-customer'
    from billing.billing_accounts where owner_id = 'e8130000-0000-0000-0000-000000000003' and environment = 'test')
  and (select count(*) = 1 from billing.billing_audit_events
    where owner_id = 'e8130000-0000-0000-0000-000000000003' and environment = 'test'
      and actor_id = 'e8130000-0000-0000-0000-000000000001' and action = 'trial_started' and outcome = 'success')
  and not exists (select 1 from billing.billing_subscriptions where owner_id = 'e8130000-0000-0000-0000-000000000003'),
  'one exact-duration trial and audit entry are saved without creating a subscription or replacing the customer ID'
);
update billing.billing_accounts set trial_started_at = now() - interval '15 days', trial_ends_at = now() - interval '1 day'
  where owner_id = 'e8130000-0000-0000-0000-000000000003' and environment = 'test';
set local role service_role;
select pg_temp.assert_true(
  public.platform_start_trial('e8130000-0000-0000-0000-000000000001', 'e8130000-0000-0000-0000-000000000003', 'test', 14) = 'trial_already_used',
  'an expired trial cannot be restarted'
);
rollback;
