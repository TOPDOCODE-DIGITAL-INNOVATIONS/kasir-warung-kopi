begin;

-- Owners may manage their own checkout through the server. Platform operators keep their existing access.
create function billing.can_manage_owner(p_actor uuid, p_owner uuid)
returns boolean
language sql stable set search_path = '' as $$
  select billing.is_active_super_admin(p_actor) or (coalesce(p_actor = p_owner, false) and exists (
    select 1 from auth.users u where u.id = p_actor
      and coalesce(u.raw_app_meta_data->>'platform_role', 'owner') = 'owner'
      and coalesce(u.raw_app_meta_data->>'account_status', 'active') = 'active'
  ))
$$;
revoke all on function billing.can_manage_owner(uuid,uuid) from public, anon, authenticated;

create or replace function public.platform_billing_owner_detail(p_actor uuid, p_environment text, p_owner uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'owner', to_jsonb(o) || jsonb_build_object(
      'branch_count', branches.branch_count,
      'branch_coverage', billing.branch_coverage(branches.branch_count, o.subscription_status)
    ),
    'cycles', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.created_at desc, c.id desc)
      from (
        select c.id, c.scheduled_at, c.period_start, c.period_end, c.amount, c.status, c.paid_at,
          c.xendit_payment_id, c.created_at, p.name as plan_name
        from billing.billing_cycles c
        join billing.billing_subscriptions s on s.id = c.subscription_id and s.environment = c.environment
        join billing.billing_plans p on p.id = s.plan_id
        where s.owner_id = o.owner_id and s.environment = p_environment
        order by c.created_at desc, c.id desc limit 25
      ) c
    ), '[]'::jsonb),
    'checkouts', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.created_at desc, c.id desc)
      from (
        select c.id, c.reference_id,
          case when c.status = 'open' and c.expires_at <= now() then 'expired' else c.status end as status,
          c.amount, c.created_at, c.expires_at, p.name as plan_name
        from billing.billing_checkout_sessions c join billing.billing_plans p on p.id = c.plan_id
        where c.owner_id = o.owner_id and c.environment = p_environment
        order by c.created_at desc, c.id desc limit 25
      ) c
    ), '[]'::jsonb)
  )
  from billing.owner_subscription_rows(p_environment, p_owner) o
  cross join lateral (
    select count(*) as branch_count from public.businesses b where b.owner_id = o.owner_id
  ) branches
  where p_owner is not null and p_environment in ('test','live') and billing.can_manage_owner(p_actor, p_owner)
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
  where p_owner is not null and p_environment in ('test', 'live') and billing.can_manage_owner(p_actor, p_owner)
$$;

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
  if not billing.can_manage_owner(p_actor, p_owner) then return jsonb_build_object('status', 'forbidden'); end if;
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

create or replace function public.platform_save_xendit_customer(
  p_actor uuid, p_owner uuid, p_environment text, p_customer_id text
) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if not billing.can_manage_owner(p_actor, p_owner) then return 'forbidden'; end if;
  if nullif(btrim(p_customer_id), '') is null then return 'invalid_request'; end if;
  update billing.billing_accounts
  set xendit_customer_id = coalesce(xendit_customer_id, btrim(p_customer_id))
  where owner_id = p_owner and environment = p_environment;
  return case when found then 'saved' else 'not_found' end;
end
$$;

create or replace function public.platform_attach_checkout_session(
  p_actor uuid, p_environment text, p_reference_id text,
  p_xendit_session_id text, p_checkout_url text, p_expires_at timestamptz
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_checkout billing.billing_checkout_sessions;
begin
  if nullif(btrim(p_xendit_session_id), '') is null or nullif(btrim(p_checkout_url), '') is null
    then return 'invalid_request'; end if;
  update billing.billing_checkout_sessions
  set status = 'open', xendit_session_id = btrim(p_xendit_session_id),
      checkout_url = btrim(p_checkout_url), expires_at = p_expires_at
  where environment = p_environment and reference_id = p_reference_id
    and billing.can_manage_owner(p_actor, owner_id)
    and payment_mode = 'one_time' and status = 'creating'
  returning * into v_checkout;
  if not found then
    select * into v_checkout from billing.billing_checkout_sessions
    where environment = p_environment and reference_id = p_reference_id
    and billing.can_manage_owner(p_actor, owner_id)
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
  if p_status is null or p_status not in ('failed', 'cancelled') then return 'invalid_request'; end if;
  update billing.billing_checkout_sessions
  set status = p_status
  where environment = p_environment and reference_id = p_reference_id
    and billing.can_manage_owner(p_actor, owner_id)
    and payment_mode = 'one_time' and status = 'creating'
  returning owner_id into v_owner;
  if not found then return 'not_found'; end if;
  insert into billing.billing_audit_events (owner_id, environment, actor_id, action, reference_id, outcome)
  values (v_owner, p_environment, p_actor, 'checkout_' || p_status, p_reference_id, 'failure');
  return p_status;
end
$$;

create or replace function public.platform_reconcile_payment_checkout(
  p_actor uuid, p_owner uuid, p_environment text, p_session jsonb
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_result text;
begin
  if not billing.can_manage_owner(p_actor, p_owner) then return 'forbidden'; end if;
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

notify pgrst, 'reload schema';
commit;
