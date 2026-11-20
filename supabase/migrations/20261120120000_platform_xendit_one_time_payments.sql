begin;

-- Existing sessions can still receive their original recurring webhooks.
alter table billing.billing_checkout_sessions
  add column payment_mode text not null default 'recurring'
    check (payment_mode in ('recurring', 'one_time'));

create function public.platform_begin_payment_checkout(
  p_actor uuid, p_owner uuid, p_environment text, p_plan_code text, p_reference_id text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_owner auth.users;
  v_open billing.billing_checkout_sessions;
  v_plan billing.billing_plans;
  v_checkout_id uuid;
begin
  if not billing.is_active_super_admin(p_actor) then return jsonb_build_object('status', 'forbidden'); end if;
  if p_owner is null or p_environment is null or p_environment not in ('test', 'live')
    or p_plan_code is null or p_plan_code not in ('monthly', 'yearly')
    or coalesce(length(btrim(p_reference_id)), 0) not between 1 and 64 then
    return jsonb_build_object('status', 'invalid_request');
  end if;

  select * into v_owner from auth.users
  where id = p_owner and coalesce(raw_app_meta_data->>'platform_role', 'owner') = 'owner';
  if not found then return jsonb_build_object('status', 'owner_not_found'); end if;
  if nullif(btrim(v_owner.email), '') is null then return jsonb_build_object('status', 'email_missing'); end if;

  insert into billing.billing_accounts (owner_id, environment)
  values (p_owner, p_environment) on conflict (owner_id, environment) do nothing;
  perform 1 from billing.billing_accounts
  where owner_id = p_owner and environment = p_environment for update;

  select * into v_open from billing.billing_checkout_sessions
  where owner_id = p_owner and environment = p_environment and status in ('creating', 'open');
  if found then
    if v_open.payment_mode = 'one_time' and v_open.status = 'creating' then
      return billing.checkout_payload(v_open.id, 'resume');
    end if;
    return jsonb_build_object('status', case when v_open.payment_mode = 'recurring'
      then 'legacy_checkout_open' else 'checkout_open' end);
  end if;

  if exists (
    select 1 from billing.billing_subscriptions
    where owner_id = p_owner and environment = p_environment and status <> 'ended' and renewal_enabled
  ) then return jsonb_build_object('status', 'legacy_renewal_enabled'); end if;
  if exists (
    select 1 from billing.billing_subscriptions
    where owner_id = p_owner and environment = p_environment and status = 'pending'
  ) then return jsonb_build_object('status', 'payment_verifying'); end if;

  select * into v_plan from billing.billing_plans
  where code = p_plan_code and status = 'active' and amount is not null;
  if not found then return jsonb_build_object('status', 'plan_unavailable'); end if;

  insert into billing.billing_checkout_sessions (
    owner_id, environment, plan_id, reference_id, status, amount, currency, payment_mode
  ) values (
    p_owner, p_environment, v_plan.id, p_reference_id, 'creating', v_plan.amount, v_plan.currency, 'one_time'
  ) returning id into v_checkout_id;
  return billing.checkout_payload(v_checkout_id, 'created');
exception when unique_violation then
  return jsonb_build_object('status', 'checkout_open');
end
$$;

create function billing.apply_payment_session(p_environment text, p_session jsonb)
returns text
language plpgsql set search_path = '' as $$
declare
  v_session_id text := nullif(btrim(p_session->>'payment_session_id'), '');
  v_reference text := nullif(btrim(p_session->>'reference_id'), '');
  v_payment_id text := nullif(btrim(p_session->>'payment_id'), '');
  v_status text := upper(coalesce(p_session->>'status', ''));
  v_checkout billing.billing_checkout_sessions;
  v_account billing.billing_accounts;
  v_previous billing.billing_subscriptions;
  v_subscription_id uuid;
  v_paid_at timestamptz;
  v_cycle_id text := 'session:' || v_session_id;
  v_result text;
begin
  if p_session->>'session_type' is distinct from 'PAY' or v_reference is null or v_session_id is null then
    return 'invalid_payload';
  end if;

  select * into v_checkout from billing.billing_checkout_sessions
  where environment = p_environment and reference_id = v_reference and payment_mode = 'one_time';
  if not found then return 'ignored_event'; end if;

  -- Same owner lock as checkout creation. Re-read the checkout after acquiring it.
  select * into v_account from billing.billing_accounts
  where owner_id = v_checkout.owner_id and environment = p_environment for update;
  select * into v_checkout from billing.billing_checkout_sessions where id = v_checkout.id for update;

  if v_checkout.xendit_session_id is distinct from v_session_id then
    if v_checkout.xendit_session_id is not null or v_checkout.status <> 'creating'
      or v_account.xendit_customer_id is null
      or p_session->>'customer_id' is distinct from v_account.xendit_customer_id then
      return 'session_mismatch';
    end if;
  end if;
  if v_account.xendit_customer_id is not null
    and p_session->>'customer_id' is distinct from v_account.xendit_customer_id then
    return 'customer_mismatch';
  end if;

  if v_status in ('EXPIRED', 'CANCELED', 'CANCELLED') then
    if v_checkout.status in ('creating', 'open') then
      update billing.billing_checkout_sessions
      set status = case when v_status = 'EXPIRED' then 'expired' else 'cancelled' end,
          xendit_session_id = v_session_id
      where id = v_checkout.id;
    end if;
    return 'recorded';
  end if;
  if v_status <> 'COMPLETED' then return 'recorded'; end if;
  if v_payment_id is null then return 'payment_id_missing'; end if;
  if p_session->>'currency' is distinct from v_checkout.currency
    or p_session->'amount' is distinct from to_jsonb(v_checkout.amount) then
    return 'amount_mismatch';
  end if;
  if v_checkout.status = 'completed' and exists (
    select 1 from billing.billing_cycles
    where environment = p_environment and xendit_cycle_id = v_cycle_id
      and xendit_payment_id = v_payment_id and subscription_id = v_checkout.subscription_id
      and status = 'succeeded'
  ) then return 'already_applied'; end if;
  if v_checkout.status not in ('creating', 'open') then return 'checkout_status_conflict'; end if;

  if exists (
    select 1 from billing.billing_cycles
    where environment = p_environment and xendit_payment_id = v_payment_id
  ) then return 'duplicate_payment'; end if;

  select * into v_previous from billing.billing_subscriptions
  where owner_id = v_checkout.owner_id and environment = p_environment
    and status in ('active', 'past_due', 'pending') for update;
  if v_previous.renewal_enabled or v_previous.status = 'pending' then return 'legacy_subscription_conflict'; end if;

  begin
    v_paid_at := least(coalesce(nullif(p_session->>'updated', '')::timestamptz, now()), now());
  exception when invalid_datetime_format or datetime_field_overflow then
    return 'invalid_payload';
  end;

  update billing.billing_subscriptions
  set status = 'ended', next_billing_at = null
  where id = v_previous.id;

  -- Keep prior coverage when paid early, with separate period boundaries on the payment row.
  insert into billing.billing_subscriptions (owner_id, environment, plan_id, period_start, period_end)
  values (
    v_checkout.owner_id, p_environment, v_checkout.plan_id,
    case when v_previous.period_end > v_paid_at then v_previous.period_start end,
    case when v_previous.period_end > v_paid_at then v_previous.period_end end
  ) returning id into v_subscription_id;

  update billing.billing_checkout_sessions
  set subscription_id = v_subscription_id, xendit_session_id = v_session_id
  where id = v_checkout.id;

  v_result := billing.apply_cycle(p_environment, jsonb_build_object(
    'id', v_cycle_id, 'reference_id', v_reference, 'status', 'SUCCEEDED',
    'amount', v_checkout.amount, 'currency', v_checkout.currency, 'updated', v_paid_at,
    'attempt_details', jsonb_build_array(jsonb_build_object(
      'status', 'SUCCEEDED', 'payment_id', v_payment_id, 'created', v_paid_at
    ))
  ));
  if v_result is distinct from 'applied' then
    raise exception 'Could not apply checkout payment: %', v_result;
  end if;

  update billing.billing_subscriptions
  set renewal_enabled = false, consented_at = null, next_billing_at = null,
      period_start = case when v_previous.period_end > v_paid_at then v_previous.period_start else period_start end
  where id = v_subscription_id;

  return 'applied';
exception when unique_violation then
  return 'duplicate_payment';
end
$$;

create or replace function billing.apply_xendit_event(p_environment text, p_event_type text, p_data jsonb)
returns text
language plpgsql set search_path = '' as $$
begin
  if jsonb_typeof(p_data) is distinct from 'object' then
    return 'invalid_payload';
  end if;
  if p_event_type like 'recurring.%' and exists (
    select 1 from billing.billing_checkout_sessions where environment = p_environment
      and payment_mode = 'one_time' and reference_id = p_data->>'reference_id'
  ) then return 'ignored_event'; end if;
  if p_event_type like 'recurring.cycle.%' then
    return billing.apply_cycle(p_environment, p_data);
  elsif p_event_type like 'recurring.plan.%' then
    return billing.apply_plan_status(p_environment, p_data);
  elsif p_event_type like 'payment_session.%' then
    if p_data->>'session_type' = 'PAY' then
      if (p_event_type = 'payment_session.completed' and p_data->>'status' = 'COMPLETED')
        or (p_event_type = 'payment_session.expired' and p_data->>'status' = 'EXPIRED') then
        return billing.apply_payment_session(p_environment, p_data);
      end if;
      return 'ignored_event';
    end if;
    -- Only legacy sessions can be updated by a legacy session notification.
    if exists (
      select 1 from billing.billing_checkout_sessions where environment = p_environment
        and xendit_session_id = coalesce(p_data->>'payment_session_id', p_data->>'id')
        and payment_mode = 'one_time'
    ) then return 'ignored_event'; end if;
    return billing.apply_session_status(
      p_environment,
      coalesce(p_data->>'payment_session_id', p_data->>'id'),
      p_data->>'status',
      coalesce(p_data#>>'{subscription,recurring_plan_id}', p_data->>'recurring_plan_id')
    );
  end if;
  return 'ignored_event';
end
$$;

create function public.platform_reconcile_payment_checkout(
  p_actor uuid, p_owner uuid, p_environment text, p_session jsonb
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_result text;
begin
  if not billing.is_active_super_admin(p_actor) then return 'forbidden'; end if;
  if not exists (
    select 1 from billing.billing_checkout_sessions where owner_id = p_owner
      and environment = p_environment and payment_mode = 'one_time'
      and xendit_session_id = p_session->>'payment_session_id'
      and reference_id = p_session->>'reference_id'
  ) then return 'owner_mismatch'; end if;

  v_result := billing.apply_payment_session(p_environment, p_session);
  insert into billing.billing_audit_events (owner_id, environment, actor_id, action, reference_id, outcome)
  values (
    p_owner, p_environment, p_actor, 'xendit_reconciled', p_session->>'payment_session_id',
    case when v_result in ('applied', 'recorded', 'already_applied') then 'success' else 'failure' end
  );
  return v_result;
end
$$;

create or replace function public.platform_get_checkout_context(
  p_actor uuid, p_environment text, p_owner uuid
) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'owner', (
      select jsonb_build_object(
        'id', u.id,
        'email', u.email,
        'name', left(coalesce(
          case when jsonb_typeof(u.raw_user_meta_data->'name') = 'string' then nullif(btrim(u.raw_user_meta_data->>'name'), '') end,
          case when jsonb_typeof(u.raw_user_meta_data->'full_name') = 'string' then nullif(btrim(u.raw_user_meta_data->>'full_name'), '') end,
          split_part(coalesce(u.email, 'Owner'), '@', 1)
        ), 120),
        'xendit_customer_id', a.xendit_customer_id
      )
      from auth.users u
      left join billing.billing_accounts a on a.owner_id = u.id and a.environment = p_environment
      where u.id = p_owner
        and coalesce(u.raw_app_meta_data->>'platform_role', 'owner') = 'owner'
    ),
    'plans', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'code', p.code, 'name', p.name, 'version', p.version,
        'interval_months', p.interval_months, 'amount', p.amount, 'status', p.status
      ) order by p.interval_months)
      from billing.billing_plans p
      where p.status = 'active' and p.amount is not null
    ), '[]'::jsonb),
    'open_checkout', (
      select jsonb_build_object(
        'id', c.id,
        'reference_id', c.reference_id,
        'xendit_session_id', c.xendit_session_id,
        'checkout_url', c.checkout_url,
        'status', c.status,
        'payment_mode', c.payment_mode,
        'amount', c.amount,
        'expires_at', c.expires_at,
        'plan_name', p.name,
        'plan_code', p.code
      )
      from billing.billing_checkout_sessions c
      join billing.billing_plans p on p.id = c.plan_id
      where c.owner_id = p_owner
        and c.environment = p_environment
        and c.status in ('creating', 'open')
      order by c.created_at desc limit 1
    ),
    'current_subscription', (
      select jsonb_build_object(
        'id', s.id,
        'status', s.status,
        'xendit_plan_id', s.xendit_plan_id,
        'renewal_enabled', s.renewal_enabled,
        'period_start', s.period_start,
        'period_end', s.period_end,
        'next_billing_at', s.next_billing_at,
        'plan_code', p.code,
        'plan_name', p.name,
        'amount', p.amount
      )
      from billing.billing_subscriptions s
      join billing.billing_plans p on p.id = s.plan_id
      where s.owner_id = p_owner
        and s.environment = p_environment
        and s.status in ('pending', 'active', 'past_due')
      order by s.created_at desc limit 1
    )
  )
  where p_owner is not null
    and p_environment in ('test', 'live')
    and billing.is_active_super_admin(p_actor)
$$;

revoke all on function billing.apply_payment_session(text,jsonb) from public, anon, authenticated;
revoke all on function public.platform_begin_payment_checkout(uuid,uuid,text,text,text),
  public.platform_reconcile_payment_checkout(uuid,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.platform_begin_payment_checkout(uuid,uuid,text,text,text),
  public.platform_reconcile_payment_checkout(uuid,uuid,text,jsonb) to service_role;

notify pgrst, 'reload schema';
commit;
