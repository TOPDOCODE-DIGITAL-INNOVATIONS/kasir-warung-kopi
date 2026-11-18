begin;

-- Activate default test/live pricing for monthly and yearly plans if still draft without amount
update billing.billing_plans
set amount = case when code = 'monthly' then 99000 else 990000 end,
    status = 'active'
where amount is null;

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
        and (c.expires_at is null or c.expires_at > now())
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

create or replace function public.platform_save_checkout_session(
  p_actor uuid,
  p_owner uuid,
  p_environment text,
  p_plan_code text,
  p_reference_id text,
  p_xendit_customer_id text,
  p_xendit_session_id text,
  p_xendit_plan_id text,
  p_checkout_url text,
  p_expires_at timestamptz
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_plan billing.billing_plans;
  v_sub_id uuid;
  v_checkout_id uuid;
begin
  if not billing.is_active_super_admin(p_actor) then
    raise exception 'Hanya Super Admin aktif yang dapat membuat sesi checkout.';
  end if;
  if p_environment not in ('test', 'live') then
    raise exception 'Lingkungan billing tidak valid.';
  end if;

  select * into v_plan
  from billing.billing_plans
  where code = p_plan_code and status = 'active' and amount is not null
  order by version desc limit 1;

  if not found then
    raise exception 'Paket langganan aktif belum tersedia.';
  end if;

  insert into billing.billing_accounts (owner_id, environment, xendit_customer_id)
  values (p_owner, p_environment, nullif(btrim(p_xendit_customer_id), ''))
  on conflict (owner_id, environment) do update set
    xendit_customer_id = coalesce(billing.billing_accounts.xendit_customer_id, excluded.xendit_customer_id);

  -- Mark expired open checkouts as expired first
  update billing.billing_checkout_sessions
  set status = 'expired'
  where owner_id = p_owner and environment = p_environment
    and status in ('creating', 'open')
    and expires_at is not null and expires_at <= now();

  -- Ensure there is a current pending/active subscription record or create one
  select id into v_sub_id
  from billing.billing_subscriptions
  where owner_id = p_owner and environment = p_environment
    and status in ('pending', 'active', 'past_due')
  order by created_at desc limit 1;

  if v_sub_id is null then
    insert into billing.billing_subscriptions (
      owner_id, environment, plan_id, status, xendit_plan_id, renewal_enabled
    ) values (
      p_owner, p_environment, v_plan.id, 'pending', nullif(btrim(p_xendit_plan_id), ''), false
    ) returning id into v_sub_id;
  else
    update billing.billing_subscriptions
    set plan_id = v_plan.id,
        xendit_plan_id = coalesce(nullif(btrim(p_xendit_plan_id), ''), xendit_plan_id)
    where id = v_sub_id and status = 'pending';
  end if;

  insert into billing.billing_checkout_sessions (
    owner_id, environment, plan_id, subscription_id, reference_id,
    xendit_session_id, checkout_url, status, amount, currency, expires_at
  ) values (
    p_owner, p_environment, v_plan.id, v_sub_id, p_reference_id,
    nullif(btrim(p_xendit_session_id), ''), p_checkout_url, 'open', v_plan.amount, 'IDR', p_expires_at
  ) returning id into v_checkout_id;

  insert into billing.billing_audit_events (
    owner_id, environment, actor_id, action, reference_id, outcome
  ) values (
    p_owner, p_environment, p_actor, 'checkout_created', p_reference_id, 'success'
  );

  return jsonb_build_object(
    'checkout_id', v_checkout_id,
    'subscription_id', v_sub_id,
    'checkout_url', p_checkout_url,
    'reference_id', p_reference_id
  );
end
$$;

create or replace function public.platform_sync_xendit_status(
  p_actor uuid,
  p_owner uuid,
  p_environment text,
  p_xendit_session_id text,
  p_session_status text,
  p_xendit_plan_id text,
  p_plan_status text,
  p_cycles jsonb default '[]'::jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_sub billing.billing_subscriptions;
  v_plan billing.billing_plans;
  v_cycle jsonb;
  v_paid_at timestamptz;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_next_billing timestamptz;
begin
  if not billing.is_active_super_admin(p_actor) then
    raise exception 'Hanya Super Admin aktif yang dapat menyinkronkan status billing.';
  end if;

  if p_xendit_session_id is not null and p_session_status in ('open', 'completed', 'expired', 'cancelled', 'failed') then
    update billing.billing_checkout_sessions
    set status = p_session_status
    where owner_id = p_owner and environment = p_environment and xendit_session_id = p_xendit_session_id;
  end if;

  select * into v_sub
  from billing.billing_subscriptions
  where owner_id = p_owner and environment = p_environment
    and status in ('pending', 'active', 'past_due')
  order by created_at desc limit 1;

  if found then
    select * into v_plan from billing.billing_plans where id = v_sub.plan_id;

    if nullif(btrim(p_xendit_plan_id), '') is not null then
      update billing.billing_subscriptions
      set xendit_plan_id = btrim(p_xendit_plan_id)
      where id = v_sub.id;
    end if;

    -- Upsert cycles if provided
    if jsonb_typeof(p_cycles) = 'array' then
      for v_cycle in select value from jsonb_array_elements(p_cycles) loop
        insert into billing.billing_cycles (
          subscription_id, environment, xendit_cycle_id, xendit_payment_id,
          status, scheduled_at, amount, currency, paid_at
        ) values (
          v_sub.id,
          p_environment,
          v_cycle->>'xendit_cycle_id',
          nullif(v_cycle->>'xendit_payment_id', ''),
          v_cycle->>'status',
          (v_cycle->>'scheduled_at')::timestamptz,
          coalesce((v_cycle->>'amount')::bigint, v_plan.amount, 99000),
          'IDR',
          case when (v_cycle->>'status') = 'succeeded' then coalesce((v_cycle->>'paid_at')::timestamptz, now()) else null end
        )
        on conflict (environment, xendit_cycle_id) do update set
          status = excluded.status,
          xendit_payment_id = coalesce(excluded.xendit_payment_id, billing.billing_cycles.xendit_payment_id),
          paid_at = coalesce(excluded.paid_at, billing.billing_cycles.paid_at),
          scheduled_at = coalesce(excluded.scheduled_at, billing.billing_cycles.scheduled_at);
      end loop;
    end if;

    -- Check if plan is active or has a succeeded cycle or completed session
    select max(paid_at) into v_paid_at
    from billing.billing_cycles
    where subscription_id = v_sub.id and status = 'succeeded';

    select min(scheduled_at) into v_next_billing
    from billing.billing_cycles
    where subscription_id = v_sub.id and status in ('scheduled', 'pending', 'retrying');

    if p_plan_status = 'ACTIVE' or p_session_status = 'completed' or v_paid_at is not null then
      v_period_start := coalesce(v_sub.period_start, v_paid_at, now());
      v_period_end := coalesce(v_sub.period_end, v_period_start + (v_plan.interval_months || ' months')::interval);
      v_next_billing := coalesce(v_next_billing, v_period_end);

      update billing.billing_subscriptions
      set status = 'active',
          consented_at = coalesce(consented_at, now()),
          renewal_enabled = (p_plan_status is distinct from 'INACTIVE'),
          period_start = v_period_start,
          period_end = v_period_end,
          next_billing_at = v_next_billing
      where id = v_sub.id;

      update billing.billing_checkout_sessions
      set status = 'completed'
      where subscription_id = v_sub.id and status in ('creating', 'open');
    elsif p_plan_status = 'INACTIVE' then
      update billing.billing_subscriptions
      set renewal_enabled = false,
          status = case when period_end is not null and period_end > now() then 'active' else 'ended' end
      where id = v_sub.id;
    end if;
  end if;

  insert into billing.billing_audit_events (
    owner_id, environment, actor_id, action, reference_id, outcome
  ) values (
    p_owner, p_environment, p_actor, 'xendit_synced', coalesce(p_xendit_plan_id, p_xendit_session_id), 'success'
  );

  return jsonb_build_object('synced', true);
end
$$;

revoke all on function
  public.platform_get_checkout_context(uuid,text,uuid),
  public.platform_save_checkout_session(uuid,uuid,text,text,text,text,text,text,text,timestamptz),
  public.platform_sync_xendit_status(uuid,uuid,text,text,text,text,text,jsonb)
from public, anon, authenticated;

grant execute on function
  public.platform_get_checkout_context(uuid,text,uuid),
  public.platform_save_checkout_session(uuid,uuid,text,text,text,text,text,text,text,timestamptz),
  public.platform_sync_xendit_status(uuid,uuid,text,text,text,text,text,jsonb)
to service_role;

notify pgrst, 'reload schema';
commit;

