begin;

create function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$
begin
  if condition is distinct from true then raise exception '%', message; end if;
end
$$;

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data) values
  ('e8200000-0000-0000-0000-000000000001', 'pay-admin@example.invalid', now(), '{"platform_role":"super_admin"}'),
  ('e8200000-0000-0000-0000-000000000002', 'pay-owner@example.invalid', now(), '{"platform_role":"owner"}'),
  ('e8200000-0000-0000-0000-000000000003', 'pay-legacy@example.invalid', now(), '{"platform_role":"owner"}');

do $$
declare
  admin_id constant uuid := 'e8200000-0000-0000-0000-000000000001';
  test_owner constant uuid := 'e8200000-0000-0000-0000-000000000002';
  legacy_id constant uuid := 'e8200000-0000-0000-0000-000000000003';
  payment jsonb;
  first_checkout jsonb;
  next_checkout jsonb;
  first_period record;
  extended_period record;
begin
  perform pg_temp.assert_true(
    not has_function_privilege('authenticated', 'public.platform_begin_payment_checkout(uuid,uuid,text,text,text)', 'execute'),
    'clients cannot reserve a payable checkout'
  );
  perform pg_temp.assert_true(
    public.platform_begin_payment_checkout(test_owner, test_owner, 'test', 'monthly', 'pay-unauthorized')->>'status' = 'forbidden',
    'only super admins can create checkouts'
  );
  first_checkout := public.platform_begin_payment_checkout(admin_id, test_owner, 'test', 'monthly', 'pay-one');
  perform pg_temp.assert_true(first_checkout->>'status' = 'created', 'checkout reserved');
  perform pg_temp.assert_true(
    public.platform_begin_payment_checkout(admin_id, test_owner, 'test', 'yearly', 'pay-double')
      @> '{"status":"resume","reference_id":"pay-one","plan_code":"monthly"}',
    'retry keeps checkout reference and plan'
  );
  perform pg_temp.assert_true(
    public.platform_attach_checkout_session(admin_id, 'test', 'pay-one', 'ps-one', 'https://example.invalid/checkout', now() + interval '1 hour') = 'open',
    'session attached'
  );

  payment := jsonb_build_object(
    'payment_session_id', 'ps-one', 'reference_id', 'pay-one', 'payment_id', 'py-one',
    'session_type', 'PAY', 'status', 'COMPLETED', 'currency', 'IDR', 'amount', first_checkout->'amount', 'updated', now()
  );
  perform pg_temp.assert_true(
    public.platform_ingest_xendit_webhook('live', 'wrong-env', 'payment_session.completed', 'ps-one', jsonb_build_object('data', payment)) = 'ignored_event',
    'wrong environment cannot apply a checkout'
  );
  perform pg_temp.assert_true(
    public.platform_ingest_xendit_webhook('test', 'wrong-price', 'payment_session.completed', 'ps-one', jsonb_build_object('data', payment || '{"amount":1}')) = 'amount_mismatch',
    'wrong amount is rejected'
  );
  perform pg_temp.assert_true(
    public.platform_ingest_xendit_webhook('test', 'wrong-currency', 'payment_session.completed', 'ps-one', jsonb_build_object('data', payment || '{"currency":"USD"}')) = 'amount_mismatch',
    'wrong currency is rejected'
  );
  perform pg_temp.assert_true(
    public.platform_ingest_xendit_webhook('test', 'missing-id', 'payment_session.completed', 'ps-one', jsonb_build_object('data', payment - 'payment_id')) = 'payment_id_missing',
    'completed session requires a captured payment id'
  );
  perform pg_temp.assert_true(
    public.platform_reconcile_payment_checkout(admin_id, legacy_id, 'test', payment) = 'owner_mismatch',
    'payment session belongs to the requested owner'
  );
  perform pg_temp.assert_true(
    public.platform_ingest_xendit_webhook('test', 'pay-one-done', 'payment_session.completed', 'ps-one', jsonb_build_object('data', payment)) = 'applied',
    'completed one-time payment applies'
  );
  perform pg_temp.assert_true(
    public.platform_reconcile_payment_checkout(admin_id, test_owner, 'test', payment) = 'already_applied'
    and public.platform_ingest_xendit_webhook('test', 'pay-one-redelivered', 'payment_session.completed', 'ps-one', jsonb_build_object('data', payment)) = 'already_applied',
    'reconciliation and redelivery do not add a second term'
  );
  perform pg_temp.assert_true(
    public.platform_ingest_xendit_webhook('test', 'old-expired', 'payment_session.expired', 'ps-one',
      jsonb_build_object('data', payment || '{"status":"EXPIRED"}')) = 'recorded'
    and (select c.status from billing.billing_checkout_sessions c where c.reference_id = 'pay-one') = 'completed',
    'late expiry does not undo payment'
  );
  select s.period_start, s.period_end, s.renewal_enabled, s.next_billing_at, s.xendit_plan_id into first_period
  from billing.billing_subscriptions s where s.owner_id = test_owner and s.environment = 'test' and s.status = 'active';
  perform pg_temp.assert_true(
    first_period.period_end = first_period.period_start + interval '1 month'
    and not first_period.renewal_enabled and first_period.next_billing_at is null and first_period.xendit_plan_id is null,
    'one month of access without a recurring plan'
  );

  next_checkout := public.platform_begin_payment_checkout(admin_id, test_owner, 'test', 'yearly', 'pay-next');
  perform pg_temp.assert_true(next_checkout->>'status' = 'created', 'early renewal is available');
  perform pg_temp.assert_true(
    public.platform_attach_checkout_session(admin_id, 'test', 'pay-next', 'ps-next', 'https://example.invalid/checkout-next', now() + interval '1 hour') = 'open',
    'renewal session attached'
  );
  payment := payment || jsonb_build_object('payment_session_id', 'ps-next', 'reference_id', 'pay-next', 'amount', next_checkout->'amount');
  perform pg_temp.assert_true(
    public.platform_reconcile_payment_checkout(admin_id, test_owner, 'test', payment) = 'duplicate_payment',
    'same provider payment id cannot pay a different checkout'
  );
  perform pg_temp.assert_true(
    public.platform_reconcile_payment_checkout(admin_id, test_owner, 'test', payment || '{"payment_id":"py-next"}') = 'applied',
    'verified renewal applied from reconciliation'
  );
  select s.period_start, s.period_end, s.renewal_enabled into extended_period
  from billing.billing_subscriptions s where s.owner_id = test_owner and s.environment = 'test' and s.status = 'active';
  perform pg_temp.assert_true(
    extended_period.period_start = first_period.period_start
    and extended_period.period_end = first_period.period_end + interval '1 year' and not extended_period.renewal_enabled,
    'early renewal appends a year without losing current access'
  );

  perform public.platform_begin_payment_checkout(admin_id, test_owner, 'test', 'monthly', 'pay-cancel');
  perform public.platform_attach_checkout_session(admin_id, 'test', 'pay-cancel', 'ps-cancel', 'https://example.invalid/checkout-cancel', now() - interval '1 second');
  perform pg_temp.assert_true(
    public.platform_get_checkout_context(admin_id, 'test', test_owner)->'open_checkout' @> '{"reference_id":"pay-cancel"}',
    'past due checkout stays available for status check'
  );
  perform pg_temp.assert_true(
    public.platform_reconcile_payment_checkout(admin_id, test_owner, 'test', '{"payment_session_id":"ps-cancel","reference_id":"pay-cancel","status":"CANCELED","session_type":"PAY"}') = 'recorded',
    'cancellation event is accepted'
  );
  perform pg_temp.assert_true(
    (select c.status from billing.billing_checkout_sessions c where c.reference_id = 'pay-cancel') = 'cancelled'
    and (select s.period_end from billing.billing_subscriptions s where s.owner_id = test_owner and s.status = 'active') = extended_period.period_end,
    'cancellation preserves paid access'
  );
  perform pg_temp.assert_true(
    to_regprocedure('public.platform_begin_checkout(uuid,uuid,text,text,text)') is null
    and to_regprocedure('public.platform_reconcile_xendit(uuid,uuid,text,jsonb,jsonb,jsonb)') is null
    and to_regprocedure('billing.apply_cycle(text,jsonb)') is null,
    'provider recurring functions were removed'
  );
  perform pg_temp.assert_true(
    public.platform_ingest_xendit_webhook('test', 'retired-cycle', 'recurring.cycle.succeeded', 'cycle-old',
      jsonb_build_object('data', payment || '{"session_type":"SUBSCRIPTION","plan_id":"repl-old"}')) = 'ignored_event'
    and public.platform_ingest_xendit_webhook('test', 'retired-session', 'payment_session.completed', 'ps-old',
      jsonb_build_object('data', payment || '{"session_type":"SUBSCRIPTION"}')) = 'ignored_event',
    'legacy provider events never change a paid term'
  );
end
$$;

rollback;
