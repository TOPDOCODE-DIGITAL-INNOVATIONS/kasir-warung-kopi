begin;

create function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$
begin
  if condition is distinct from true then raise exception '%', message; end if;
end
$$;

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data) values
  ('e8300000-0000-0000-0000-000000000001', 'monitor-admin@example.invalid', now(), '{"platform_role":"super_admin"}'),
  ('e8300000-0000-0000-0000-000000000002', 'monitor-owner@example.invalid', now(), '{"platform_role":"owner"}');

do $$
declare
  admin_id constant uuid := 'e8300000-0000-0000-0000-000000000001';
  owner_id constant uuid := 'e8300000-0000-0000-0000-000000000002';
  reference_id constant text := 'pay-test-monitoring';
  checkout billing.billing_checkout_sessions;
  claim record;
  payment jsonb;
begin
  perform pg_temp.assert_true(
    not has_function_privilege('authenticated', 'public.platform_claim_payment_reconciliation(text,integer,uuid,uuid)', 'execute')
    and not has_function_privilege('anon', 'public.platform_get_payment_monitoring(uuid,text,text,integer,integer)', 'execute'),
    'only the server can call monitoring and reconciliation directly'
  );
  perform public.platform_begin_payment_checkout(admin_id, owner_id, 'test', 'monthly', reference_id);
  perform public.platform_attach_checkout_session(admin_id, 'test', reference_id, 'ps-monitoring', 'https://example.invalid', now() + interval '1 hour');
  update billing.billing_checkout_sessions c set created_at = now() - interval '5 minutes'
  where c.reference_id = 'pay-test-monitoring' returning * into checkout;

  perform pg_temp.assert_true(
    public.platform_get_payment_monitoring(admin_id, 'test', 'pending', 0, 51)->'rows' @>
      jsonb_build_array(jsonb_build_object('checkout_id', checkout.id))
    and public.platform_get_payment_monitoring(owner_id, 'test', 'pending', 0, 51) is null,
    'pending checkout is visible to super admins only'
  );
  perform pg_temp.assert_true(
    not exists (select from public.platform_claim_payment_reconciliation('test', 1, checkout.id, owner_id))
    and not exists (select from public.platform_claim_payment_reconciliation('live', 1, checkout.id, admin_id)),
    'manual claims check actor and environment'
  );

  payment := jsonb_build_object('payment_session_id','ps-monitoring','reference_id',reference_id,
    'payment_id','py-monitoring','session_type','PAY','status','COMPLETED','currency','IDR','amount',checkout.amount,'updated',now());
  perform pg_temp.assert_true(public.platform_ingest_xendit_webhook('test', 'monitor-incomplete', 'payment_session.completed',
    'ps-monitoring', jsonb_build_object('data', payment - 'payment_id')) = 'payment_id_missing', 'incomplete webhook requires review');
  perform pg_temp.assert_true(public.platform_ingest_xendit_webhook('test', 'monitor-discrepancy', 'payment_session.completed',
    'ps-monitoring', jsonb_build_object('data', payment || '{"amount":1}')) = 'amount_mismatch', 'amount discrepancy requires review');

  select * into claim from public.platform_claim_payment_reconciliation('test', 10, null, null) c where c.checkout_id = checkout.id;
  perform pg_temp.assert_true(claim.session_id = 'ps-monitoring', 'scheduler claims an eligible one-time checkout');
  perform pg_temp.assert_true(
    not exists (select from public.platform_claim_payment_reconciliation('test', 1, checkout.id, admin_id)),
    'manual recheck cannot claim a checkout while the scheduler checks it'
  );
  perform pg_temp.assert_true(public.platform_finish_payment_reconciliation('test', checkout.id, claim.claimed_at, null, payment, null)
    = 'applied', 'confirmed payment activates the subscription following an incomplete webhook');
  perform pg_temp.assert_true(public.platform_finish_payment_reconciliation('test', checkout.id, claim.claimed_at, null, payment, null)
    = 'stale_claim', 'the same claim cannot be completed twice');
  perform pg_temp.assert_true(public.platform_ingest_xendit_webhook('test', 'monitor-redelivery', 'payment_session.completed',
    'ps-monitoring', jsonb_build_object('data', payment)) = 'already_applied', 'late webhook applies no additional term');
  perform pg_temp.assert_true(
    (select c.status = 'completed' and c.last_reconcile_result = 'applied' from billing.billing_checkout_sessions c where c.id = checkout.id)
    and (select e.status from billing.billing_webhook_events e where e.dedup_key = 'monitor-incomplete') = 'processed'
    and (select e.status from billing.billing_webhook_events e where e.dedup_key = 'monitor-discrepancy') = 'needs_review',
    'reconciliation closes the matching webhook and preserves the disputed amount'
  );
  perform pg_temp.assert_true(public.platform_get_payment_monitoring(admin_id, 'test', 'review', 0, 51)->'rows' @>
    jsonb_build_array(jsonb_build_object('checkout_id', checkout.id, 'error_code', 'amount_mismatch')), 'review table links the disputed webhook');
end
$$;

rollback;
