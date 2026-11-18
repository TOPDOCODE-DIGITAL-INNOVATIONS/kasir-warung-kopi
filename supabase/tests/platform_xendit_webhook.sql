begin;

create function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$
begin
  if condition is distinct from true then raise exception '%', message; end if;
end $$;

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data) values
  ('e8170000-0000-0000-0000-000000000001', 'xwh-admin@example.invalid', now(), '{"platform_role":"super_admin","account_status":"active"}'),
  ('e8170000-0000-0000-0000-000000000002', 'xwh-owner@example.invalid', now(), '{"platform_role":"owner"}'),
  ('e8170000-0000-0000-0000-000000000003', null, now(), '{"platform_role":"owner"}');

select pg_temp.assert_true(
  not has_function_privilege('anon', 'public.platform_ingest_xendit_webhook(text,text,text,text,jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.platform_begin_checkout(uuid,uuid,text,text,text)', 'execute'),
  'browser roles cannot call billing mutations'
);
select pg_temp.assert_true(
  has_function_privilege('service_role', 'public.platform_ingest_xendit_webhook(text,text,text,text,jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.platform_reconcile_xendit(uuid,uuid,text,jsonb,jsonb,jsonb)', 'execute'),
  'server role can call billing mutations'
);

-- Harga paket
select pg_temp.assert_true(
  (select amount from billing.billing_plans where code = 'monthly' and status = 'active') = 20000
  and (select amount from billing.billing_plans where code = 'yearly' and status = 'active') = 200000,
  'default prices are 20k / 200k'
);
select pg_temp.assert_true(
  public.platform_set_plan_price('e8170000-0000-0000-0000-000000000002', 'monthly', 25000) = 'forbidden'
  and public.platform_set_plan_price('e8170000-0000-0000-0000-000000000001', 'monthly', 10) = 'invalid_price',
  'only super admin can set a valid price'
);

-- Checkout
select pg_temp.assert_true(
  public.platform_begin_checkout('e8170000-0000-0000-0000-000000000001', 'e8170000-0000-0000-0000-000000000003', 'test', 'monthly', 'ref-x')->>'status' = 'email_missing',
  'owner without email is rejected'
);
select pg_temp.assert_true(
  public.platform_begin_checkout('e8170000-0000-0000-0000-000000000001', 'e8170000-0000-0000-0000-000000000002', 'test', 'monthly', 'xwh-ref-1')->>'status' = 'created',
  'checkout reserved before calling Xendit'
);
select pg_temp.assert_true(
  (public.platform_begin_checkout('e8170000-0000-0000-0000-000000000001', 'e8170000-0000-0000-0000-000000000002', 'test', 'yearly', 'xwh-ref-2')) @> '{"status":"resume","reference_id":"xwh-ref-1","amount":20000}',
  'second click resumes the same reference instead of creating another checkout'
);
select pg_temp.assert_true(
  public.platform_attach_checkout_session('e8170000-0000-0000-0000-000000000001', 'test', 'xwh-ref-1', 'ps-1', 'repl-1', 'https://checkout.example/1', now() + interval '1 day') = 'open'
  and public.platform_begin_checkout('e8170000-0000-0000-0000-000000000001', 'e8170000-0000-0000-0000-000000000002', 'test', 'monthly', 'xwh-ref-3')->>'status' = 'checkout_open',
  'open checkout blocks another checkout'
);

-- Harga berubah setelah checkout: versi baru, checkout lama tetap 20k
select pg_temp.assert_true(
  public.platform_set_plan_price('e8170000-0000-0000-0000-000000000001', 'monthly', 25000) = 'updated',
  'super admin can change the monthly price'
);
select pg_temp.assert_true(
  (select count(*) from billing.billing_plans where code = 'monthly' and status = 'active' and amount = 25000) = 1
  and (select amount from billing.billing_checkout_sessions where reference_id = 'xwh-ref-1') = 20000,
  'price change creates a new version and keeps the checkout price'
);

-- Webhook: aktivasi plan dan sesi completed BUKAN bukti bayar
select public.platform_ingest_xendit_webhook('test', 'plan-act-1', 'recurring.plan.activated', 'repl-1',
  '{"event":"recurring.plan.activated","data":{"id":"repl-1","status":"ACTIVE"}}');
select public.platform_ingest_xendit_webhook('test', 'ps-done-1', 'payment_session.completed', 'ps-1',
  '{"event":"payment_session.completed","data":{"payment_session_id":"ps-1","status":"COMPLETED"}}');
select pg_temp.assert_true(
  (select status from billing.billing_subscriptions where xendit_plan_id = 'repl-1') = 'pending'
  and public.platform_begin_checkout('e8170000-0000-0000-0000-000000000001', 'e8170000-0000-0000-0000-000000000002', 'test', 'monthly', 'xwh-ref-4')->>'status' = 'payment_verifying',
  'plan activation and completed session do not mark the subscription paid nor allow a new checkout'
);

-- Nominal tidak cocok -> needs_review, tidak aktif
select pg_temp.assert_true(
  public.platform_ingest_xendit_webhook('test', 'cyc-bad', 'recurring.cycle.succeeded', 'cyc-0',
    '{"event":"recurring.cycle.succeeded","data":{"id":"cyc-0","plan_id":"repl-1","status":"SUCCEEDED","amount":1000,"currency":"IDR"}}') = 'amount_mismatch',
  'amount mismatch is rejected'
);
select pg_temp.assert_true(
  (select status from billing.billing_webhook_events where dedup_key = 'cyc-bad') = 'needs_review'
  and (select status from billing.billing_subscriptions where xendit_plan_id = 'repl-1') = 'pending',
  'amount mismatch is flagged for review'
);

-- Siklus pertama sukses
select pg_temp.assert_true(
  public.platform_ingest_xendit_webhook('test', 'cyc-1-ok', 'recurring.cycle.succeeded', 'cyc-1',
    '{"event":"recurring.cycle.succeeded","data":{"id":"cyc-1","plan_id":"repl-1","status":"SUCCEEDED","amount":20000,"currency":"IDR","attempt_details":[{"attempt_number":1,"status":"SUCCEEDED","payment_id":"pay-1","created":"2026-11-18T00:00:00Z"}]}}') = 'applied',
  'first cycle applied'
);
select pg_temp.assert_true(
  public.platform_ingest_xendit_webhook('test', 'cyc-1-ok', 'recurring.cycle.succeeded', 'cyc-1', '{"event":"x","data":{}}') = 'duplicate'
  and public.platform_ingest_xendit_webhook('test', 'cyc-1-ok-again', 'recurring.cycle.succeeded', 'cyc-1',
    '{"event":"recurring.cycle.succeeded","data":{"id":"cyc-1","plan_id":"repl-1","status":"SUCCEEDED","amount":20000,"currency":"IDR"}}') = 'already_applied',
  'duplicate deliveries do not apply twice'
);
select pg_temp.assert_true(
  (select status = 'active' and renewal_enabled and period_start = '2026-11-18T00:00:00Z' and period_end = '2026-12-18T00:00:00Z'
    from billing.billing_subscriptions where xendit_plan_id = 'repl-1')
  and (select status from billing.billing_checkout_sessions where reference_id = 'xwh-ref-1') = 'completed'
  and (select xendit_payment_id from billing.billing_cycles where xendit_cycle_id = 'cyc-1') = 'pay-1',
  'subscription active for one month after the first payment'
);

-- Event gagal terlambat untuk siklus yang sudah lunas tidak menimpa
select public.platform_ingest_xendit_webhook('test', 'cyc-1-late-fail', 'recurring.cycle.failed', 'cyc-1',
  '{"event":"recurring.cycle.failed","data":{"id":"cyc-1","plan_id":"repl-1","status":"FAILED","amount":20000}}');
select pg_temp.assert_true(
  (select status from billing.billing_cycles where xendit_cycle_id = 'cyc-1') = 'succeeded'
  and (select status from billing.billing_subscriptions where xendit_plan_id = 'repl-1') = 'active',
  'late failure does not override a paid cycle'
);

-- Perpanjangan gagal lalu berhasil
select public.platform_ingest_xendit_webhook('test', 'cyc-2-retry', 'recurring.cycle.retrying', 'cyc-2',
  '{"event":"recurring.cycle.retrying","data":{"id":"cyc-2","plan_id":"repl-1","status":"RETRYING","amount":20000,"scheduled_timestamp":"2026-12-18T00:00:00Z"}}');
select pg_temp.assert_true(
  (select status from billing.billing_subscriptions where xendit_plan_id = 'repl-1') = 'past_due',
  'failed renewal marks past_due'
);
select public.platform_ingest_xendit_webhook('test', 'cyc-2-ok', 'recurring.cycle.succeeded', 'cyc-2',
  '{"event":"recurring.cycle.succeeded","data":{"id":"cyc-2","plan_id":"repl-1","status":"SUCCEEDED","amount":20000,"currency":"IDR","updated":"2026-12-19T00:00:00Z"}}');
select pg_temp.assert_true(
  (select status = 'active' and period_start = '2026-12-18T00:00:00Z' and period_end = '2027-01-18T00:00:00Z'
    from billing.billing_subscriptions where xendit_plan_id = 'repl-1'),
  'renewal extends the period from the previous end'
);

-- Owner aktif dengan auto-renew tidak bisa dibuatkan checkout baru
select pg_temp.assert_true(
  public.platform_begin_checkout('e8170000-0000-0000-0000-000000000001', 'e8170000-0000-0000-0000-000000000002', 'test', 'yearly', 'xwh-ref-5')->>'status' = 'subscription_active',
  'active auto-renewing subscription blocks a second recurring plan'
);

-- Plan dinonaktifkan
select public.platform_ingest_xendit_webhook('test', 'plan-inact-1', 'recurring.plan.inactivated', 'repl-1',
  '{"event":"recurring.plan.inactivated","data":{"id":"repl-1","status":"INACTIVE"}}');
select pg_temp.assert_true(
  (select not renewal_enabled and next_billing_at is null from billing.billing_subscriptions where xendit_plan_id = 'repl-1')
  and (select count(*) from billing.billing_audit_events where owner_id = 'e8170000-0000-0000-0000-000000000002' and action = 'payment_succeeded') = 2,
  'inactivation stops renewal and history is kept'
);

-- Event tak dikenal / plan tak dikenal
select pg_temp.assert_true(
  public.platform_ingest_xendit_webhook('test', 'other-1', 'invoice.paid', null, '{"event":"invoice.paid","data":{}}') = 'ignored_event'
  and public.platform_ingest_xendit_webhook('test', 'unknown-1', 'recurring.cycle.succeeded', 'cyc-9',
    '{"event":"recurring.cycle.succeeded","data":{"id":"cyc-9","plan_id":"repl-unknown","status":"SUCCEEDED","amount":20000}}') = 'unknown_subscription',
  'unknown events are ignored and unknown plans need review'
);

rollback;
