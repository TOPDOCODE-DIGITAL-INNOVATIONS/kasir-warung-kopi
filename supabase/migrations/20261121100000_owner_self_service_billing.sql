-- Langganan self-service Owner.
--
-- 1. Owner aktif boleh memakai fungsi checkout/rekonsiliasi yang sama dengan Super Admin,
--    tetapi HANYA untuk akunnya sendiri (p_actor = p_owner). Logika checkout tidak diduplikasi.
-- 2. owner_billing_status: memulai trial otomatis (sekali per Owner per lingkungan) lalu
--    mengembalikan status billing yang dipakai dashboard Owner dan API sync kasir.
--
-- Aditif: tidak mengubah tabel maupun data yang sudah ada. Semua fungsi hanya untuk service_role.
begin;

create or replace function billing.can_manage_billing(p_actor uuid, p_owner uuid)
returns boolean
language sql stable set search_path = '' as $$
  select p_actor is not null and p_owner is not null and (
    billing.is_active_super_admin(p_actor)
    or (p_actor = p_owner and exists (
      select 1 from auth.users u where u.id = p_owner
        and coalesce(u.raw_app_meta_data->>'platform_role', 'owner') = 'owner'
        and coalesce(u.raw_app_meta_data->>'account_status', 'active') = 'active'
    ))
  )
$$;

create or replace function public.platform_begin_checkout(
  p_actor uuid, p_owner uuid, p_environment text, p_plan_code text, p_reference_id text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_email text;
  v_plan billing.billing_plans;
  v_sub billing.billing_subscriptions;
  v_checkout billing.billing_checkout_sessions;
  v_sub_id uuid;
  v_checkout_id uuid;
begin
  if not billing.can_manage_billing(p_actor, p_owner) then
    return jsonb_build_object('status', 'forbidden');
  end if;
  if p_owner is null or p_environment not in ('test', 'live') or p_plan_code not in ('monthly', 'yearly')
    or coalesce(length(p_reference_id), 0) not between 1 and 64 then
    return jsonb_build_object('status', 'invalid_request');
  end if;

  select nullif(btrim(u.email), '') into v_email
  from auth.users u
  where u.id = p_owner
    and coalesce(u.raw_app_meta_data->>'platform_role', 'owner') = 'owner'
    and coalesce(u.raw_app_meta_data->>'account_status', 'active') in ('active', 'inactive');
  if not found then
    return jsonb_build_object('status', 'owner_not_found');
  end if;
  if v_email is null then
    return jsonb_build_object('status', 'email_missing');
  end if;

  perform pg_advisory_xact_lock(hashtext('billing_checkout:' || p_environment || ':' || p_owner::text));

  insert into billing.billing_accounts (owner_id, environment) values (p_owner, p_environment)
  on conflict (owner_id, environment) do nothing;

  update billing.billing_checkout_sessions
  set status = 'expired'
  where owner_id = p_owner and environment = p_environment
    and status = 'open' and expires_at is not null and expires_at <= now();

  select * into v_checkout from billing.billing_checkout_sessions
  where owner_id = p_owner and environment = p_environment and status in ('creating', 'open')
  limit 1;
  if found then
    if v_checkout.status = 'creating' then
      return billing.checkout_payload(v_checkout.id, 'resume');
    end if;
    return jsonb_build_object('status', 'checkout_open');
  end if;

  select * into v_sub from billing.billing_subscriptions
  where owner_id = p_owner and environment = p_environment and status in ('pending', 'active', 'past_due')
  order by created_at desc limit 1;
  if found then
    if v_sub.status in ('active', 'past_due') and v_sub.renewal_enabled then
      return jsonb_build_object('status', 'subscription_active');
    end if;
    if v_sub.status = 'active' and v_sub.period_end > now() then
      return jsonb_build_object('status', 'subscription_active');
    end if;
    if v_sub.status = 'pending' and exists (
      select 1 from billing.billing_checkout_sessions c
      where c.subscription_id = v_sub.id and c.status = 'completed'
    ) then
      return jsonb_build_object('status', 'payment_verifying');
    end if;
    update billing.billing_subscriptions set status = 'ended', renewal_enabled = false, next_billing_at = null
    where id = v_sub.id;
  end if;

  select * into v_plan from billing.billing_plans
  where code = p_plan_code and status = 'active' and amount is not null
  order by version desc limit 1;
  if not found then
    return jsonb_build_object('status', 'plan_unavailable');
  end if;

  insert into billing.billing_subscriptions (owner_id, environment, plan_id, status, renewal_enabled)
  values (p_owner, p_environment, v_plan.id, 'pending', false)
  returning id into v_sub_id;

  insert into billing.billing_checkout_sessions (
    owner_id, environment, plan_id, subscription_id, reference_id, status, amount, currency
  ) values (
    p_owner, p_environment, v_plan.id, v_sub_id, p_reference_id, 'creating', v_plan.amount, 'IDR'
  ) returning id into v_checkout_id;

  return billing.checkout_payload(v_checkout_id, 'created');
exception
  when unique_violation then
    return jsonb_build_object('status', 'checkout_open');
end
$$;

create or replace function public.platform_save_xendit_customer(
  p_actor uuid, p_owner uuid, p_environment text, p_customer_id text
) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if not billing.can_manage_billing(p_actor, p_owner) then return 'forbidden'; end if;
  if nullif(btrim(p_customer_id), '') is null then return 'invalid_request'; end if;
  update billing.billing_accounts
  set xendit_customer_id = coalesce(xendit_customer_id, btrim(p_customer_id))
  where owner_id = p_owner and environment = p_environment;
  return case when found then 'saved' else 'not_found' end;
end
$$;

create or replace function public.platform_attach_checkout_session(
  p_actor uuid, p_environment text, p_reference_id text,
  p_xendit_session_id text, p_xendit_plan_id text, p_checkout_url text, p_expires_at timestamptz
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
  v_sub_id uuid;
begin
  select owner_id into v_owner from billing.billing_checkout_sessions
  where environment = p_environment and reference_id = p_reference_id;
  if not billing.can_manage_billing(p_actor, coalesce(v_owner, p_actor)) then return 'forbidden'; end if;
  if nullif(btrim(p_xendit_session_id), '') is null or nullif(btrim(p_checkout_url), '') is null then
    return 'invalid_request';
  end if;

  update billing.billing_checkout_sessions
  set status = 'open',
      xendit_session_id = btrim(p_xendit_session_id),
      checkout_url = btrim(p_checkout_url),
      expires_at = p_expires_at
  where environment = p_environment and reference_id = p_reference_id and status = 'creating'
  returning owner_id, subscription_id into v_owner, v_sub_id;
  if not found then
    return 'not_found';
  end if;

  if nullif(btrim(p_xendit_plan_id), '') is not null then
    update billing.billing_subscriptions
    set xendit_plan_id = btrim(p_xendit_plan_id)
    where id = v_sub_id and xendit_plan_id is null;
  end if;

  insert into billing.billing_audit_events (owner_id, environment, actor_id, action, reference_id, outcome)
  values (v_owner, p_environment, p_actor, 'checkout_created', p_reference_id, 'success');
  return 'open';
end
$$;

create or replace function public.platform_fail_checkout(
  p_actor uuid, p_environment text, p_reference_id text, p_status text
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
  v_sub_id uuid;
begin
  select owner_id into v_owner from billing.billing_checkout_sessions
  where environment = p_environment and reference_id = p_reference_id;
  if not billing.can_manage_billing(p_actor, coalesce(v_owner, p_actor)) then return 'forbidden'; end if;
  if p_status not in ('failed', 'cancelled') then return 'invalid_request'; end if;

  update billing.billing_checkout_sessions
  set status = p_status
  where environment = p_environment and reference_id = p_reference_id and status = 'creating'
  returning owner_id, subscription_id into v_owner, v_sub_id;
  if not found then
    return 'not_found';
  end if;

  update billing.billing_subscriptions
  set status = 'ended'
  where id = v_sub_id and status = 'pending'
    and not exists (select 1 from billing.billing_cycles c where c.subscription_id = v_sub_id and c.status = 'succeeded');

  insert into billing.billing_audit_events (owner_id, environment, actor_id, action, reference_id, outcome)
  values (v_owner, p_environment, p_actor, 'checkout_' || p_status, p_reference_id, 'failure');
  return p_status;
end
$$;

create or replace function public.platform_reconcile_xendit(
  p_actor uuid, p_owner uuid, p_environment text, p_session jsonb, p_plan jsonb, p_cycles jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_cycle jsonb;
  v_results jsonb := '[]'::jsonb;
  v_result text;
  v_plan_id text := nullif(btrim(coalesce(p_plan->>'id', p_session#>>'{subscription,recurring_plan_id}', p_session->>'recurring_plan_id')), '');
begin
  if not billing.can_manage_billing(p_actor, p_owner) then
    return jsonb_build_object('status', 'forbidden');
  end if;
  if p_environment not in ('test', 'live') then
    return jsonb_build_object('status', 'invalid_request');
  end if;

  if p_session is not null and not exists (
    select 1 from billing.billing_checkout_sessions
    where environment = p_environment and owner_id = p_owner and xendit_session_id = p_session->>'payment_session_id'
  ) then
    return jsonb_build_object('status', 'owner_mismatch');
  end if;
  if p_session is not null then
    v_results := v_results || to_jsonb('session:' || billing.apply_session_status(
      p_environment, p_session->>'payment_session_id', null, v_plan_id));
  end if;
  if v_plan_id is not null and not exists (
    select 1 from billing.billing_subscriptions
    where environment = p_environment and owner_id = p_owner and xendit_plan_id = v_plan_id
  ) then
    return jsonb_build_object('status', 'owner_mismatch');
  end if;

  if jsonb_typeof(p_cycles) = 'array' then
    for v_cycle in select value from jsonb_array_elements(p_cycles) loop
      if v_cycle->>'plan_id' is distinct from v_plan_id then
        v_result := 'plan_mismatch';
      else
        v_result := billing.apply_cycle(p_environment, v_cycle);
      end if;
      v_results := v_results || to_jsonb(coalesce(v_cycle->>'id', '?') || ':' || v_result);
    end loop;
  end if;

  if p_plan is not null then
    v_results := v_results || to_jsonb('plan:' || billing.apply_plan_status(p_environment, p_plan));
  end if;
  if p_session is not null then
    v_results := v_results || to_jsonb('session:' || billing.apply_session_status(
      p_environment, p_session->>'payment_session_id', p_session->>'status', v_plan_id));
  end if;

  insert into billing.billing_audit_events (owner_id, environment, actor_id, action, reference_id, outcome)
  values (p_owner, p_environment, p_actor, 'xendit_reconciled', coalesce(v_plan_id, p_session->>'payment_session_id'), 'success');

  return jsonb_build_object('status', 'ok', 'results', v_results);
end
$$;

-- Status billing satu Owner. Trial otomatis dimulai saat pertama kali dipanggil bila Owner
-- terverifikasi, belum pernah trial, dan belum pernah punya periode berbayar. Owner lama
-- (sebelum fitur ini) otomatis mendapat trial penuh sejak pertama kali membuka dashboard/sync.
create or replace function public.owner_billing_status(p_owner uuid, p_environment text, p_trial_days integer)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_role text;
  v_confirmed timestamptz;
  v_now timestamptz := now();
  v_account billing.billing_accounts;
begin
  if p_owner is null or p_environment not in ('test', 'live') or coalesce(p_trial_days, 0) not between 1 and 365 then
    return jsonb_build_object('status', 'invalid_request');
  end if;

  select coalesce(u.raw_app_meta_data->>'platform_role', 'owner'), u.email_confirmed_at
    into v_role, v_confirmed
  from auth.users u where u.id = p_owner;
  if not found then return jsonb_build_object('status', 'owner_not_found'); end if;
  if v_role <> 'owner' then return jsonb_build_object('status', 'not_owner'); end if;

  if v_confirmed is not null then
    perform pg_advisory_xact_lock(hashtext('billing_trial:' || p_environment || ':' || p_owner::text));
    if not exists (
      select 1 from billing.billing_subscriptions s
      where s.owner_id = p_owner and s.environment = p_environment and s.period_end is not null
    ) then
      insert into billing.billing_accounts as a (owner_id, environment, trial_started_at, trial_ends_at, trial_started_by)
      values (p_owner, p_environment, v_now, v_now + p_trial_days * interval '24 hours', p_owner)
      on conflict (owner_id, environment) do update set
        trial_started_at = excluded.trial_started_at,
        trial_ends_at = excluded.trial_ends_at,
        trial_started_by = excluded.trial_started_by
      where a.trial_started_at is null;
      if found then
        insert into billing.billing_audit_events (owner_id, environment, actor_id, action, outcome, created_at)
        values (p_owner, p_environment, p_owner, 'trial_auto_started', 'success', v_now);
      end if;
    end if;
  end if;

  select * into v_account from billing.billing_accounts
  where owner_id = p_owner and environment = p_environment;

  return jsonb_build_object(
    'status', 'ok',
    'server_time', v_now,
    'trial_started_at', v_account.trial_started_at,
    'trial_ends_at', v_account.trial_ends_at,
    'subscription', (
      select jsonb_build_object(
        'status', s.status, 'plan_code', p.code, 'plan_name', p.name, 'amount', p.amount,
        'period_start', s.period_start, 'period_end', s.period_end,
        'renewal_enabled', s.renewal_enabled, 'next_billing_at', s.next_billing_at,
        'has_plan', s.xendit_plan_id is not null,
        'xendit_plan_id', s.xendit_plan_id
      )
      from billing.billing_subscriptions s join billing.billing_plans p on p.id = s.plan_id
      where s.owner_id = p_owner and s.environment = p_environment
      order by (s.period_end is not null) desc, s.period_end desc nulls last, s.created_at desc
      limit 1
    ),
    'open_checkout', (
      select jsonb_build_object(
        'status', c.status, 'checkout_url', c.checkout_url, 'expires_at', c.expires_at,
        'plan_name', p.name, 'amount', c.amount, 'has_session', c.xendit_session_id is not null,
        'xendit_session_id', c.xendit_session_id
      )
      from billing.billing_checkout_sessions c join billing.billing_plans p on p.id = c.plan_id
      where c.owner_id = p_owner and c.environment = p_environment and c.status in ('creating', 'open')
        and (c.expires_at is null or c.expires_at > v_now)
      order by c.created_at desc limit 1
    ),
    'plans', coalesce((
      select jsonb_agg(jsonb_build_object('code', p.code, 'name', p.name, 'amount', p.amount, 'interval_months', p.interval_months)
        order by p.interval_months)
      from billing.billing_plans p where p.status = 'active' and p.amount is not null
    ), '[]'::jsonb)
  );
end
$$;

-- Harga paket aktif untuk halaman publik (landing). Tidak memuat data akun.
create or replace function public.public_billing_plans()
returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('code', p.code, 'name', p.name, 'amount', p.amount, 'interval_months', p.interval_months)
    order by p.interval_months), '[]'::jsonb)
  from billing.billing_plans p where p.status = 'active' and p.amount is not null
$$;

revoke all on all functions in schema billing from public, anon, authenticated;
revoke all on function
  public.platform_begin_checkout(uuid,uuid,text,text,text),
  public.platform_save_xendit_customer(uuid,uuid,text,text),
  public.platform_attach_checkout_session(uuid,text,text,text,text,text,timestamptz),
  public.platform_fail_checkout(uuid,text,text,text),
  public.platform_reconcile_xendit(uuid,uuid,text,jsonb,jsonb,jsonb),
  public.owner_billing_status(uuid,text,integer),
  public.public_billing_plans()
from public, anon, authenticated;
grant execute on function
  public.platform_begin_checkout(uuid,uuid,text,text,text),
  public.platform_save_xendit_customer(uuid,uuid,text,text),
  public.platform_attach_checkout_session(uuid,text,text,text,text,text,timestamptz),
  public.platform_fail_checkout(uuid,text,text,text),
  public.platform_reconcile_xendit(uuid,uuid,text,jsonb,jsonb,jsonb),
  public.owner_billing_status(uuid,text,integer),
  public.public_billing_plans()
to service_role;

notify pgrst, 'reload schema';
commit;
