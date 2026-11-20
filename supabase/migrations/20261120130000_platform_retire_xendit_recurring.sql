begin;

-- Live provider plans must be resolved before their backend handler is removed.
do $$
begin
  if exists (
    select 1 from billing.billing_subscriptions
    where environment = 'live' and status <> 'ended'
      and (renewal_enabled or (xendit_plan_id is not null and status = 'pending'))
  ) or exists (
    select 1 from billing.billing_checkout_sessions
    where environment = 'live' and payment_mode = 'recurring' and status in ('creating', 'open')
  ) then
    raise exception 'Resolve active or unsettled Xendit recurring billing in Live before applying this migration';
  end if;
end
$$;

update billing.billing_checkout_sessions set status = 'cancelled'
where payment_mode = 'recurring' and status in ('creating', 'open');

update billing.billing_subscriptions
set renewal_enabled = false, next_billing_at = null,
    status = case
      when status = 'pending' then 'ended'
      when status = 'past_due' and period_end > now() then 'active'
      when status = 'past_due' then 'ended'
      else status
    end
where renewal_enabled or next_billing_at is not null or status in ('pending', 'past_due');

create or replace function public.platform_begin_payment_checkout(
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
  where owner_id = p_owner and environment = p_environment and payment_mode = 'one_time'
    and status in ('creating', 'open');
  if found then
    if v_open.status = 'creating' then
      return billing.checkout_payload(v_open.id, 'resume');
    end if;
    return jsonb_build_object('status', 'checkout_open');
  end if;

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

create or replace function billing.apply_payment_session(p_environment text, p_session jsonb)
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
  v_interval_months integer;
  v_term_start timestamptz;
  v_term_end timestamptz;
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

  begin
    v_paid_at := least(coalesce(nullif(p_session->>'updated', '')::timestamptz, now()), now());
  exception when invalid_datetime_format or datetime_field_overflow then
    return 'invalid_payload';
  end;

  select interval_months into strict v_interval_months
  from billing.billing_plans where id = v_checkout.plan_id;
  v_term_start := greatest(v_paid_at, v_previous.period_end);
  v_term_end := v_term_start + make_interval(months => v_interval_months);

  update billing.billing_subscriptions set status = 'ended' where id = v_previous.id;

  -- The paid term starts after remaining access. The new row preserves continuous access.
  insert into billing.billing_subscriptions (
    owner_id, environment, plan_id, status, period_start, period_end
  ) values (
    v_checkout.owner_id, p_environment, v_checkout.plan_id, 'active',
    case when v_previous.period_end > v_paid_at then v_previous.period_start else v_paid_at end,
    v_term_end
  ) returning id into v_subscription_id;

  insert into billing.billing_cycles (
    subscription_id, environment, xendit_cycle_id, xendit_payment_id, status,
    period_start, period_end, amount, currency, paid_at
  ) values (
    v_subscription_id, p_environment, v_cycle_id, v_payment_id, 'succeeded',
    v_term_start, v_term_end, v_checkout.amount, v_checkout.currency, v_paid_at
  );

  update billing.billing_checkout_sessions
  set status = 'completed', subscription_id = v_subscription_id, xendit_session_id = v_session_id
  where id = v_checkout.id;

  update billing.billing_accounts
  set trial_ends_at = greatest(trial_started_at + interval '1 second', v_paid_at)
  where owner_id = v_checkout.owner_id and environment = p_environment
    and trial_started_at is not null and trial_ends_at > v_paid_at;

  insert into billing.billing_audit_events (owner_id, environment, action, reference_id, outcome)
  values (v_checkout.owner_id, p_environment, 'payment_succeeded', v_payment_id, 'success');

  return 'applied';
exception when unique_violation then
  return 'duplicate_payment';
end
$$;

create or replace function billing.apply_xendit_event(p_environment text, p_event_type text, p_data jsonb)
returns text
language plpgsql set search_path = '' as $$
begin
  if p_data->>'session_type' = 'PAY' and (
    (p_event_type = 'payment_session.completed' and p_data->>'status' = 'COMPLETED')
    or (p_event_type = 'payment_session.expired' and p_data->>'status' = 'EXPIRED')
  ) then
    return billing.apply_payment_session(p_environment, p_data);
  end if;
  return 'ignored_event';
end
$$;

create or replace function public.platform_get_checkout_context(p_actor uuid, p_environment text, p_owner uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'plans', coalesce((
      select jsonb_agg(jsonb_build_object('code', p.code, 'name', p.name, 'amount', p.amount)
        order by p.interval_months)
      from billing.billing_plans p where p.status = 'active' and p.amount is not null
    ), '[]'::jsonb),
    'open_checkout', (
      select jsonb_build_object(
        'reference_id', c.reference_id, 'xendit_session_id', c.xendit_session_id, 'checkout_url', c.checkout_url,
        'amount', c.amount, 'plan_name', p.name, 'plan_code', p.code
      )
      from billing.billing_checkout_sessions c join billing.billing_plans p on p.id = c.plan_id
      where c.owner_id = p_owner and c.environment = p_environment
        and c.payment_mode = 'one_time' and c.status in ('creating', 'open')
    )
  )
  where p_owner is not null and p_environment in ('test', 'live') and billing.is_active_super_admin(p_actor)
$$;

create function public.platform_attach_checkout_session(
  p_actor uuid, p_environment text, p_reference_id text,
  p_xendit_session_id text, p_checkout_url text, p_expires_at timestamptz
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_checkout billing.billing_checkout_sessions;
begin
  if not billing.is_active_super_admin(p_actor) then return 'forbidden'; end if;
  if nullif(btrim(p_xendit_session_id), '') is null or nullif(btrim(p_checkout_url), '') is null
    then return 'invalid_request'; end if;
  update billing.billing_checkout_sessions
  set status = 'open', xendit_session_id = btrim(p_xendit_session_id),
      checkout_url = btrim(p_checkout_url), expires_at = p_expires_at
  where environment = p_environment and reference_id = p_reference_id
    and payment_mode = 'one_time' and status = 'creating'
  returning * into v_checkout;
  if not found then
    select * into v_checkout from billing.billing_checkout_sessions
    where environment = p_environment and reference_id = p_reference_id
      and payment_mode = 'one_time' and xendit_session_id = btrim(p_xendit_session_id);
    return coalesce(v_checkout.status, 'not_found');
  end if;

  insert into billing.billing_audit_events (owner_id, environment, actor_id, action, reference_id, outcome)
  values (v_checkout.owner_id, p_environment, p_actor, 'checkout_created', p_reference_id, 'success');
  return 'open';
end
$$;

create or replace function public.platform_fail_checkout(
  p_actor uuid, p_environment text, p_reference_id text, p_status text
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
begin
  if not billing.is_active_super_admin(p_actor) then return 'forbidden'; end if;
  if p_status is null or p_status not in ('failed', 'cancelled') then return 'invalid_request'; end if;
  update billing.billing_checkout_sessions
  set status = p_status
  where environment = p_environment and reference_id = p_reference_id
    and payment_mode = 'one_time' and status = 'creating'
  returning owner_id into v_owner;
  if not found then return 'not_found'; end if;
  insert into billing.billing_audit_events (owner_id, environment, actor_id, action, reference_id, outcome)
  values (v_owner, p_environment, p_actor, 'checkout_' || p_status, p_reference_id, 'failure');
  return p_status;
end
$$;

alter table billing.billing_checkout_sessions alter column payment_mode set default 'one_time';

drop function public.platform_begin_checkout(uuid,uuid,text,text,text);
drop function public.platform_attach_checkout_session(uuid,text,text,text,text,text,timestamptz);
drop function public.platform_reconcile_xendit(uuid,uuid,text,jsonb,jsonb,jsonb);
drop function billing.apply_cycle(text,jsonb);
drop function billing.apply_plan_status(text,jsonb);
drop function billing.apply_session_status(text,text,text,text);
drop function billing.find_subscription(text,text,text);

revoke all on function public.platform_attach_checkout_session(uuid,text,text,text,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.platform_attach_checkout_session(uuid,text,text,text,text,timestamptz) to service_role;

notify pgrst, 'reload schema';
commit;
