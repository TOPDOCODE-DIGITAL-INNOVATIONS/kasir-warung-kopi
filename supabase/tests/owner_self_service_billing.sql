begin;

create function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$
begin
  if condition is distinct from true then raise exception '%', message; end if;
end $$;

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data) values
  ('e8210000-0000-0000-0000-000000000001', 'self-admin@example.invalid', now(), '{"platform_role":"super_admin","account_status":"active"}'),
  ('e8210000-0000-0000-0000-000000000002', 'self-owner@example.invalid', now(), '{"platform_role":"owner","account_status":"active"}'),
  ('e8210000-0000-0000-0000-000000000003', 'self-other@example.invalid', now(), '{"platform_role":"owner","account_status":"active"}'),
  ('e8210000-0000-0000-0000-000000000004', 'self-unverified@example.invalid', null, '{"platform_role":"owner"}'),
  ('e8210000-0000-0000-0000-000000000005', 'self-inactive@example.invalid', now(), '{"platform_role":"owner","account_status":"inactive"}'),
  ('e8210000-0000-0000-0000-000000000006', 'self-paid@example.invalid', now(), '{"platform_role":"owner"}');

-- Pastikan ada paket aktif untuk uji checkout.
update billing.billing_plans set amount = coalesce(amount, 20000), status = 'active'
where code = 'monthly' and version = (select max(version) from billing.billing_plans where code = 'monthly')
  and not exists (select 1 from billing.billing_plans where code = 'monthly' and status = 'active');

select pg_temp.assert_true(
  not has_function_privilege('anon', 'public.owner_billing_status(uuid,text,integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.owner_billing_status(uuid,text,integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.public_billing_plans()', 'execute'),
  'billing status functions are only callable by the server'
);

select pg_temp.assert_true(
  has_function_privilege('service_role', 'public.owner_billing_status(uuid,text,integer)', 'execute')
  and has_function_privilege('service_role', 'public.public_billing_plans()', 'execute'),
  'the server role can execute billing status functions'
);

-- Trial otomatis
select pg_temp.assert_true(
  (public.owner_billing_status('e8210000-0000-0000-0000-000000000002', 'test', 14)->>'trial_ends_at')::timestamptz
    between now() + interval '13 days 23 hours' and now() + interval '14 days 1 hour',
  'first status read starts a 14-day trial for a verified Owner'
);
select pg_temp.assert_true(
  (select count(*) from billing.billing_audit_events
    where owner_id = 'e8210000-0000-0000-0000-000000000002' and action = 'trial_auto_started') = 1,
  'the automatic trial is audited'
);
update billing.billing_accounts set trial_started_at = now() - interval '30 days', trial_ends_at = now() - interval '16 days'
where owner_id = 'e8210000-0000-0000-0000-000000000002' and environment = 'test';
select pg_temp.assert_true(
  (public.owner_billing_status('e8210000-0000-0000-0000-000000000002', 'test', 14)->>'trial_ends_at')::timestamptz < now()
  and (select count(*) from billing.billing_audit_events
    where owner_id = 'e8210000-0000-0000-0000-000000000002' and action = 'trial_auto_started') = 1,
  'an expired trial is never restarted'
);
select pg_temp.assert_true(
  public.owner_billing_status('e8210000-0000-0000-0000-000000000004', 'test', 14)->>'trial_ends_at' is null,
  'unverified email does not receive a trial'
);
select pg_temp.assert_true(
  public.owner_billing_status('e8210000-0000-0000-0000-000000000001', 'test', 14)->>'status' = 'not_owner'
  and public.owner_billing_status('e8210000-0000-0000-0000-000000000002', 'invalid', 14)->>'status' = 'invalid_request'
  and public.owner_billing_status('e8210000-0000-0000-0000-000000000002', 'test', 0)->>'status' = 'invalid_request',
  'status checks role, environment and trial length'
);
select pg_temp.assert_true(
  public.owner_billing_status('e8210000-0000-0000-0000-000000000003', 'live', 14)->>'trial_ends_at' is not null
  and not exists (select 1 from billing.billing_accounts where owner_id = 'e8210000-0000-0000-0000-000000000003' and environment = 'test'),
  'trial is tracked per environment'
);

-- Owner yang pernah membayar tidak mendapat trial
insert into billing.billing_accounts (owner_id, environment) values ('e8210000-0000-0000-0000-000000000006', 'test');
insert into billing.billing_subscriptions (owner_id, environment, plan_id, status, period_start, period_end)
select 'e8210000-0000-0000-0000-000000000006', 'test', id, 'ended', now() - interval '40 days', now() - interval '10 days'
from billing.billing_plans where code = 'monthly' order by version desc limit 1;
select pg_temp.assert_true(
  (select s->>'trial_ends_at' is null and s#>>'{subscription,status}' = 'ended'
    and (s#>>'{subscription,period_end}')::timestamptz < now()
   from public.owner_billing_status('e8210000-0000-0000-0000-000000000006', 'test', 14) s),
  'previously paying Owner gets no trial and sees the last paid period'
);

-- Checkout self-service
select pg_temp.assert_true(
  public.platform_begin_checkout('e8210000-0000-0000-0000-000000000003', 'e8210000-0000-0000-0000-000000000002', 'test', 'monthly', 'self-ref-x')->>'status' = 'forbidden'
  and public.platform_begin_checkout('e8210000-0000-0000-0000-000000000005', 'e8210000-0000-0000-0000-000000000005', 'test', 'monthly', 'self-ref-y')->>'status' = 'forbidden',
  'an Owner cannot create checkout for another Owner, and inactive Owners cannot self-checkout'
);
select pg_temp.assert_true(
  public.platform_begin_checkout('e8210000-0000-0000-0000-000000000002', 'e8210000-0000-0000-0000-000000000002', 'test', 'monthly', 'self-ref-1')->>'status' = 'created',
  'an active Owner can start their own checkout'
);
select pg_temp.assert_true(
  public.platform_attach_checkout_session('e8210000-0000-0000-0000-000000000003', 'test', 'self-ref-1', 'ps-self-1', 'rp-self-1', 'https://example.invalid/pay', now() + interval '30 minutes') = 'forbidden'
  and public.platform_fail_checkout('e8210000-0000-0000-0000-000000000003', 'test', 'self-ref-1', 'failed') = 'forbidden',
  'another Owner cannot attach or fail the checkout'
);
select pg_temp.assert_true(
  public.platform_attach_checkout_session('e8210000-0000-0000-0000-000000000002', 'test', 'self-ref-1', 'ps-self-1', 'rp-self-1', 'https://example.invalid/pay', now() + interval '30 minutes') = 'open',
  'the Owner can attach their own checkout session'
);
select pg_temp.assert_true(
  (select s#>>'{open_checkout,checkout_url}' = 'https://example.invalid/pay'
   from public.owner_billing_status('e8210000-0000-0000-0000-000000000002', 'test', 14) s),
  'status exposes the open checkout link to the Owner'
);
select pg_temp.assert_true(
  public.platform_reconcile_xendit('e8210000-0000-0000-0000-000000000003', 'e8210000-0000-0000-0000-000000000002', 'test', null, null, '[]')->>'status' = 'forbidden'
  and public.platform_reconcile_xendit('e8210000-0000-0000-0000-000000000002', 'e8210000-0000-0000-0000-000000000002', 'test', null, null, '[]')->>'status' = 'ok',
  'reconciliation is limited to the Owner themself'
);
select pg_temp.assert_true(
  public.platform_begin_checkout('e8210000-0000-0000-0000-000000000001', 'e8210000-0000-0000-0000-000000000003', 'test', 'monthly', 'self-ref-admin')->>'status' = 'created',
  'Super Admin can still create checkout for any Owner'
);
select pg_temp.assert_true(
  jsonb_array_length(public.public_billing_plans()) >= 1
  and not (public.public_billing_plans()::text like '%owner%'),
  'public plans list exposes prices only'
);

rollback;
