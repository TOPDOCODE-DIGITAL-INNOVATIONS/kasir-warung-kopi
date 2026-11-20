begin;

alter table billing.billing_checkout_sessions
  add column last_reconcile_at timestamptz,
  add column last_reconcile_result text;

create index billing_pending_reconcile_idx on billing.billing_checkout_sessions
  (environment, last_reconcile_at nulls first, created_at, id)
  where payment_mode = 'one_time' and status in ('creating', 'open') and xendit_session_id is not null;

create index billing_webhook_needs_review_idx on billing.billing_webhook_events (environment, received_at desc, id desc)
  where status = 'needs_review';

create function public.platform_get_payment_monitoring(
  p_actor uuid, p_environment text, p_view text, p_offset integer, p_limit integer
) returns jsonb
language sql stable security definer set search_path = '' as $$
  with candidates as (
    select c.id, c.id as checkout_id, c.owner_id, u.email as owner_email, c.reference_id,
      c.xendit_session_id, p.name as plan_name, c.amount, c.status, c.created_at as occurred_at,
      c.expires_at, c.last_reconcile_at, c.last_reconcile_result, null::text as event_type, null::text as error_code
    from billing.billing_checkout_sessions c
    join billing.billing_plans p on p.id = c.plan_id
    join auth.users u on u.id = c.owner_id
    where p_view = 'pending' and c.environment = p_environment and c.payment_mode = 'one_time'
      and c.status in ('creating', 'open')
    union all
    select e.id, c.id, c.owner_id, u.email, coalesce(c.reference_id, e.payload#>>'{data,reference_id}'),
      coalesce(c.xendit_session_id, e.provider_object_id), p.name, c.amount, e.status, e.received_at, c.expires_at,
      c.last_reconcile_at, c.last_reconcile_result, e.event_type, e.last_error_code
    from billing.billing_webhook_events e
    left join billing.billing_checkout_sessions c on c.environment = e.environment
      and c.xendit_session_id = e.provider_object_id and c.payment_mode = 'one_time'
    left join billing.billing_plans p on p.id = c.plan_id
    left join auth.users u on u.id = c.owner_id
    where p_view = 'review' and e.environment = p_environment and e.status = 'needs_review'
  ), page as (
    select * from candidates order by occurred_at desc, id desc
    limit least(greatest(coalesce(p_limit, 26), 1), 51) offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object('rows', coalesce(
    (select jsonb_agg(to_jsonb(page) order by occurred_at desc, id desc) from page), '[]'::jsonb
  ))
  where billing.is_active_super_admin(p_actor) and p_environment in ('test','live')
    and p_view in ('pending','review')
$$;

create function public.platform_claim_payment_reconciliation(
  p_environment text, p_limit integer, p_checkout uuid, p_actor uuid
) returns table (checkout_id uuid, session_id text, claimed_at timestamptz)
language sql security definer set search_path = '' as $$
  with eligible as (
    select c.id
    from billing.billing_checkout_sessions c
    where c.environment = p_environment and c.payment_mode = 'one_time' and c.xendit_session_id is not null
      and p_environment in ('test','live')
      and (
        (p_actor is null and p_checkout is null and c.status in ('creating','open')
          and c.created_at <= now() - interval '2 minutes'
          and (c.last_reconcile_at is null or c.last_reconcile_at <= now() - interval '10 minutes'))
        or
        (p_actor is not null and c.id = p_checkout and billing.is_active_super_admin(p_actor)
          and (c.last_reconcile_result is distinct from 'checking'
            or c.last_reconcile_at <= now() - interval '2 minutes'))
      )
    order by c.last_reconcile_at asc nulls first, c.created_at, c.id
    limit least(greatest(coalesce(p_limit, 1), 1), 10)
    for update skip locked
  )
  update billing.billing_checkout_sessions c
    set last_reconcile_at = clock_timestamp(), last_reconcile_result = 'checking'
  from eligible where c.id = eligible.id
  returning c.id, c.xendit_session_id, c.last_reconcile_at
$$;

create function public.platform_finish_payment_reconciliation(
  p_environment text, p_checkout uuid, p_claimed_at timestamptz, p_actor uuid,
  p_session jsonb, p_error text
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_checkout billing.billing_checkout_sessions;
  v_result text;
  v_provider_status text := upper(coalesce(p_session->>'status', ''));
begin
  if p_environment is null or p_environment not in ('test','live') or p_claimed_at is null
    or (p_actor is not null and not billing.is_active_super_admin(p_actor))
    then return 'invalid_request'; end if;

  select * into v_checkout from billing.billing_checkout_sessions
  where id = p_checkout and environment = p_environment and payment_mode = 'one_time';
  if not found then return 'not_found'; end if;

  -- Order locks the same way as webhook settlement.
  perform 1 from billing.billing_accounts
  where owner_id = v_checkout.owner_id and environment = p_environment for update;
  select * into v_checkout from billing.billing_checkout_sessions
  where id = p_checkout and last_reconcile_at = p_claimed_at and last_reconcile_result = 'checking' for update;
  if not found then return 'stale_claim'; end if;

  if p_session is null then
    v_result := case when p_error = 'provider_not_found' then p_error else 'provider_unavailable' end;
  elsif p_session->>'payment_session_id' is distinct from v_checkout.xendit_session_id
    or p_session->>'reference_id' is distinct from v_checkout.reference_id then
    v_result := 'session_mismatch';
  else
    begin
      v_result := billing.apply_payment_session(p_environment, p_session);
    exception when others then
      v_result := 'error_' || sqlstate;
    end;
  end if;

  if v_result = 'recorded' and v_provider_status in ('ACTIVE','EXPIRED','CANCELED','CANCELLED') then
    v_result := lower(v_provider_status);
  end if;

  update billing.billing_checkout_sessions
    set last_reconcile_result = v_result, last_reconcile_at = clock_timestamp()
  where id = p_checkout;

  -- Resolve matching events once the provider independently confirms the outcome.
  -- Preserve discrepancies and unrelated events for review.
  if v_result in ('applied','already_applied','expired') then
    update billing.billing_webhook_events e
    set status = 'processed', processed_at = now()
    where e.environment = p_environment and e.provider_object_id = v_checkout.xendit_session_id
      and e.status = 'needs_review' and e.payload#>>'{data,reference_id}' = v_checkout.reference_id
      and (
        (v_result = 'expired' and e.event_type = 'payment_session.expired')
        or (v_result in ('applied','already_applied') and e.event_type = 'payment_session.completed'
          and e.payload#>>'{data,currency}' = v_checkout.currency
          and e.payload#>'{data,amount}' = to_jsonb(v_checkout.amount)
          and coalesce(nullif(e.payload#>>'{data,payment_id}', ''), p_session->>'payment_id') = p_session->>'payment_id')
      );
  end if;

  if p_actor is not null or v_result not in ('active','recorded') then
    insert into billing.billing_audit_events (owner_id, environment, actor_id, action, reference_id, outcome)
    values (v_checkout.owner_id, p_environment, p_actor, 'xendit_reconciled', v_checkout.reference_id,
      case when v_result in ('applied','already_applied','recorded','active','expired','canceled','cancelled')
        then 'success' else 'failure' end);
  end if;
  return v_result;
end
$$;

revoke all on function
  public.platform_get_payment_monitoring(uuid,text,text,integer,integer),
  public.platform_claim_payment_reconciliation(text,integer,uuid,uuid),
  public.platform_finish_payment_reconciliation(text,uuid,timestamptz,uuid,jsonb,text)
from public, anon, authenticated;

grant execute on function
  public.platform_get_payment_monitoring(uuid,text,text,integer,integer),
  public.platform_claim_payment_reconciliation(text,integer,uuid,uuid),
  public.platform_finish_payment_reconciliation(text,uuid,timestamptz,uuid,jsonb,text)
to service_role;

notify pgrst, 'reload schema';
commit;
