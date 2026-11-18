begin;

-- =====================================================================
-- Xendit Subscriptions: harga paket yang bisa diubah, checkout yang aman
-- dari tagihan ganda, webhook terverifikasi, dan rekonsiliasi.
-- Bukti pembayaran HANYA siklus SUCCEEDED dengan nominal & mata uang cocok.
-- =====================================================================

alter table billing.billing_webhook_events drop constraint if exists billing_webhook_events_status_check;
alter table billing.billing_webhook_events add constraint billing_webhook_events_status_check
  check (status in ('received', 'processed', 'ignored', 'needs_review'));

-- ---------------------------------------------------------------------
-- Harga paket. Paket yang sudah dipakai checkout/langganan tidak diubah;
-- harga baru dibuat sebagai versi baru agar pelanggan lama tetap di harga lama.
-- ---------------------------------------------------------------------
create or replace function billing.set_plan_price(p_code text, p_amount bigint)
returns uuid
language plpgsql set search_path = '' as $$
declare
  v_cur billing.billing_plans;
  v_id uuid;
begin
  if p_code not in ('monthly', 'yearly') or p_amount is null or p_amount < 1000 or p_amount > 100000000 then
    raise exception 'invalid_price';
  end if;

  perform pg_advisory_xact_lock(hashtext('billing_plan_price:' || p_code));

  select * into v_cur from billing.billing_plans
  where code = p_code
  order by (status = 'active') desc, version desc
  limit 1;
  if not found then
    raise exception 'plan_not_found';
  end if;

  if v_cur.status = 'active' and v_cur.amount = p_amount then
    return v_cur.id;
  end if;

  if v_cur.status <> 'archived'
    and not exists (select 1 from billing.billing_subscriptions s where s.plan_id = v_cur.id)
    and not exists (select 1 from billing.billing_checkout_sessions c where c.plan_id = v_cur.id) then
    update billing.billing_plans set amount = p_amount, status = 'active' where id = v_cur.id;
    return v_cur.id;
  end if;

  update billing.billing_plans set status = 'archived' where code = p_code and status = 'active';
  insert into billing.billing_plans (code, version, name, interval_months, amount, status)
  select p_code, max(p.version) + 1, v_cur.name, v_cur.interval_months, p_amount, 'active'
  from billing.billing_plans p where p.code = p_code
  returning id into v_id;
  return v_id;
end
$$;

select billing.set_plan_price('monthly', 20000);
select billing.set_plan_price('yearly', 200000);

create or replace function public.platform_set_plan_price(p_actor uuid, p_code text, p_amount bigint)
returns text
language plpgsql security definer set search_path = '' as $$
begin
  if not billing.is_active_super_admin(p_actor) then
    return 'forbidden';
  end if;
  if p_code not in ('monthly', 'yearly') or p_amount is null or p_amount < 1000 or p_amount > 100000000 then
    return 'invalid_price';
  end if;
  perform billing.set_plan_price(p_code, p_amount);
  return 'updated';
end
$$;

-- ---------------------------------------------------------------------
-- Status tampilan: past_due tetap "Perlu pembayaran" sampai 3 hari setelah
-- akhir periode berbayar, sesudah itu tampil sebagai berakhir.
-- ---------------------------------------------------------------------
create or replace function billing.owner_subscription_rows(p_environment text, p_owner uuid default null)
returns table (
  owner_id uuid, name text, email text, trial_status text, trial_start timestamptz, trial_end timestamptz,
  subscription_status text, plan_name text, period_start timestamptz, period_end timestamptz,
  next_billing_at timestamptz, renewal_enabled boolean, reference_plan_id text
)
language sql stable set search_path = '' as $$
  with latest as (
    select distinct on (s.owner_id) s.*
    from billing.billing_subscriptions s
    where s.environment = p_environment and (p_owner is null or s.owner_id = p_owner)
    order by s.owner_id, (s.status <> 'ended') desc, s.created_at desc, s.id desc
  ), checkout as (
    select c.owner_id, c.plan_id
    from billing.billing_checkout_sessions c
    where c.environment = p_environment and c.status in ('creating', 'open')
      and (c.expires_at is null or c.expires_at > now())
      and (p_owner is null or c.owner_id = p_owner)
  )
  select u.id,
    left(coalesce(
      case when jsonb_typeof(u.raw_user_meta_data->'name') = 'string' then nullif(btrim(u.raw_user_meta_data->>'name'), '') end,
      case when jsonb_typeof(u.raw_user_meta_data->'full_name') = 'string' then nullif(btrim(u.raw_user_meta_data->>'full_name'), '') end
    ), 120),
    u.email::text,
    case when a.trial_started_at is null then 'none'
      when a.trial_started_at > now() then 'scheduled'
      when a.trial_ends_at > now() then 'active' else 'expired' end,
    a.trial_started_at, a.trial_ends_at,
    case when s.status = 'past_due' and now() < coalesce(s.period_end, s.created_at) + interval '3 days' then 'past_due'
      when now() >= s.period_start and now() < s.period_end then 'active'
      when s.status = 'pending' or c.owner_id is not null then 'pending'
      when s.status is not null then 'expired' else 'none' end,
    coalesce(p.name, requested_plan.name), s.period_start, s.period_end, s.next_billing_at, s.renewal_enabled, s.xendit_plan_id
  from auth.users u
  left join billing.billing_accounts a on a.owner_id = u.id and a.environment = p_environment
  left join latest s on s.owner_id = u.id
  left join billing.billing_plans p on p.id = s.plan_id
  left join checkout c on c.owner_id = u.id
  left join billing.billing_plans requested_plan on requested_plan.id = c.plan_id
  where coalesce(u.raw_app_meta_data->>'platform_role', 'owner') = 'owner'
    and coalesce(u.raw_app_meta_data->>'account_status', 'active') in ('active', 'inactive')
    and (p_owner is null or u.id = p_owner)
$$;

-- ---------------------------------------------------------------------
-- Checkout: baris 'creating' dicatat SEBELUM memanggil Xendit, sehingga
-- klik ganda / dua tab tidak bisa membuat dua sesi yang bisa dibayar.
-- Jika panggilan Xendit timeout, percobaan berikutnya memakai reference_id
-- yang sama (idempotency key) alih-alih membuat sesi baru.
-- ---------------------------------------------------------------------
create or replace function billing.checkout_payload(p_checkout_id uuid, p_status text)
returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'status', p_status,
    'checkout_id', c.id,
    'subscription_id', c.subscription_id,
    'reference_id', c.reference_id,
    'created_at', c.created_at,
    'amount', c.amount,
    'plan_code', p.code,
    'plan_name', p.name,
    'interval_months', p.interval_months,
    'owner_email', u.email,
    'owner_name', left(coalesce(
      case when jsonb_typeof(u.raw_user_meta_data->'name') = 'string' then nullif(btrim(u.raw_user_meta_data->>'name'), '') end,
      case when jsonb_typeof(u.raw_user_meta_data->'full_name') = 'string' then nullif(btrim(u.raw_user_meta_data->>'full_name'), '') end,
      split_part(u.email, '@', 1)
    ), 120),
    'xendit_customer_id', a.xendit_customer_id
  )
  from billing.billing_checkout_sessions c
  join billing.billing_plans p on p.id = c.plan_id
  join auth.users u on u.id = c.owner_id
  join billing.billing_accounts a on a.owner_id = c.owner_id and a.environment = c.environment
  where c.id = p_checkout_id
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
  if not billing.is_active_super_admin(p_actor) then
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
  if not billing.is_active_super_admin(p_actor) then return 'forbidden'; end if;
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
  if not billing.is_active_super_admin(p_actor) then return 'forbidden'; end if;
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
  if not billing.is_active_super_admin(p_actor) then return 'forbidden'; end if;
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

-- ---------------------------------------------------------------------
-- Penerapan data Xendit (dipakai webhook dan rekonsiliasi manual).
-- ---------------------------------------------------------------------
create or replace function billing.find_subscription(p_environment text, p_xendit_plan_id text, p_reference_id text)
returns billing.billing_subscriptions
language plpgsql set search_path = '' as $$
declare
  v_sub billing.billing_subscriptions;
begin
  if nullif(btrim(p_xendit_plan_id), '') is not null then
    select * into v_sub from billing.billing_subscriptions
    where environment = p_environment and xendit_plan_id = btrim(p_xendit_plan_id)
    for update;
    if found then return v_sub; end if;
  end if;

  if nullif(btrim(p_reference_id), '') is not null then
    select s.* into v_sub
    from billing.billing_checkout_sessions c
    join billing.billing_subscriptions s on s.id = c.subscription_id
    where c.environment = p_environment and c.reference_id = btrim(p_reference_id)
    for update of s;
    if found then
      if v_sub.xendit_plan_id is null and nullif(btrim(p_xendit_plan_id), '') is not null then
        update billing.billing_subscriptions set xendit_plan_id = btrim(p_xendit_plan_id)
        where id = v_sub.id
        returning * into v_sub;
      end if;
      return v_sub;
    end if;
  end if;

  return null;
end
$$;

create or replace function billing.apply_cycle(p_environment text, p_cycle jsonb)
returns text
language plpgsql set search_path = '' as $$
declare
  v_cycle_id text := nullif(btrim(p_cycle->>'id'), '');
  v_status text := upper(coalesce(p_cycle->>'status', ''));
  v_currency text := upper(coalesce(nullif(p_cycle->>'currency', ''), 'IDR'));
  v_amount numeric;
  v_scheduled timestamptz;
  v_local text;
  v_sub billing.billing_subscriptions;
  v_plan billing.billing_plans;
  v_existing billing.billing_cycles;
  v_payment_id text;
  v_paid_at timestamptz;
  v_start timestamptz;
  v_end timestamptz;
  v_attempts jsonb;
begin
  if v_cycle_id is null then
    return 'invalid_payload';
  end if;

  v_local := case v_status
    when 'SUCCEEDED' then 'succeeded'
    when 'PENDING' then 'pending'
    when 'RETRYING' then 'retrying'
    when 'FAILED' then 'failed'
    when 'CANCELLED' then 'cancelled'
    when 'CANCELED' then 'cancelled'
    when 'SCHEDULED' then 'scheduled'
  end;
  if v_local is null then
    return 'unknown_status';
  end if;

  begin
    v_amount := nullif(p_cycle->>'amount', '')::numeric;
    v_scheduled := nullif(p_cycle->>'scheduled_timestamp', '')::timestamptz;
  exception when others then
    return 'invalid_payload';
  end;

  v_sub := billing.find_subscription(p_environment, p_cycle->>'plan_id', p_cycle->>'reference_id');
  if v_sub.id is null then
    return 'unknown_subscription';
  end if;
  select * into v_plan from billing.billing_plans where id = v_sub.plan_id;

  select * into v_existing from billing.billing_cycles
  where environment = p_environment and xendit_cycle_id = v_cycle_id
  for update;
  if found and v_existing.status = 'succeeded' then
    return 'already_applied';
  end if;
  if found and v_existing.subscription_id <> v_sub.id then
    return 'subscription_mismatch';
  end if;

  if v_local = 'succeeded' then
    if v_currency <> 'IDR' or v_amount is distinct from v_plan.amount::numeric then
      return 'amount_mismatch';
    end if;

    v_attempts := case when jsonb_typeof(p_cycle->'attempt_details') = 'array' then p_cycle->'attempt_details' else '[]'::jsonb end;
    select nullif(a->>'payment_id', ''), nullif(a->>'created', '')::timestamptz
    into v_payment_id, v_paid_at
    from jsonb_array_elements(v_attempts) a
    where upper(coalesce(a->>'status', '')) = 'SUCCEEDED'
    order by coalesce(nullif(a->>'attempt_number', '')::int, 0) desc,
      coalesce(nullif(a->>'action_number', '')::int, 0) desc
    limit 1;

    v_paid_at := least(coalesce(v_paid_at, nullif(p_cycle->>'updated', '')::timestamptz, now()), now());
    -- Perpanjangan melanjutkan periode sebelumnya; jika sudah lewat lebih dari satu
    -- siklus penuh (pemulihan), periode baru dimulai saat pembayaran.
    v_start := case
      when v_sub.period_end is null
        or v_sub.period_end < v_paid_at - make_interval(months => v_plan.interval_months)
      then v_paid_at
      else v_sub.period_end
    end;
    v_end := v_start + make_interval(months => v_plan.interval_months);
  end if;

  insert into billing.billing_cycles (
    subscription_id, environment, xendit_cycle_id, xendit_payment_id, status,
    scheduled_at, period_start, period_end, amount, currency, paid_at
  ) values (
    v_sub.id, p_environment, v_cycle_id, v_payment_id, v_local,
    v_scheduled, v_start, v_end,
    coalesce(case when v_amount > 0 then v_amount::bigint end, v_plan.amount), 'IDR',
    case when v_local = 'succeeded' then v_paid_at end
  )
  on conflict (environment, xendit_cycle_id) do update set
    status = excluded.status,
    xendit_payment_id = coalesce(excluded.xendit_payment_id, billing.billing_cycles.xendit_payment_id),
    scheduled_at = coalesce(excluded.scheduled_at, billing.billing_cycles.scheduled_at),
    period_start = coalesce(excluded.period_start, billing.billing_cycles.period_start),
    period_end = coalesce(excluded.period_end, billing.billing_cycles.period_end),
    paid_at = coalesce(excluded.paid_at, billing.billing_cycles.paid_at)
  where billing.billing_cycles.status <> 'succeeded';

  if v_local = 'succeeded' then
    update billing.billing_subscriptions
    set status = 'active',
        consented_at = coalesce(consented_at, v_paid_at),
        renewal_enabled = case when status = 'pending' then true else renewal_enabled end,
        period_start = v_start,
        period_end = v_end,
        next_billing_at = case when status = 'pending' or renewal_enabled then v_end end
    where id = v_sub.id;

    update billing.billing_checkout_sessions
    set status = 'completed'
    where subscription_id = v_sub.id and status in ('creating', 'open');

    -- Bayar saat trial berjalan: trial berakhir saat periode berbayar dimulai.
    update billing.billing_accounts
    set trial_ends_at = greatest(trial_started_at + interval '1 second', v_paid_at)
    where owner_id = v_sub.owner_id and environment = p_environment
      and trial_started_at is not null and trial_ends_at > v_paid_at;

    insert into billing.billing_audit_events (owner_id, environment, actor_id, action, reference_id, outcome)
    values (v_sub.owner_id, p_environment, null, 'payment_succeeded', v_cycle_id, 'success');
    return 'applied';
  end if;

  if v_local in ('failed', 'retrying') then
    update billing.billing_subscriptions set status = 'past_due'
    where id = v_sub.id and status in ('active', 'past_due');

    insert into billing.billing_audit_events (owner_id, environment, actor_id, action, reference_id, outcome)
    values (v_sub.owner_id, p_environment, null, 'payment_' || v_local, v_cycle_id, 'failure');
  elsif v_local in ('scheduled', 'pending') and v_scheduled is not null then
    update billing.billing_subscriptions set next_billing_at = v_scheduled
    where id = v_sub.id and status in ('active', 'past_due') and renewal_enabled;
  end if;

  return 'recorded';
end
$$;

create or replace function billing.apply_plan_status(p_environment text, p_plan jsonb)
returns text
language plpgsql set search_path = '' as $$
declare
  v_sub billing.billing_subscriptions;
begin
  v_sub := billing.find_subscription(p_environment, p_plan->>'id', p_plan->>'reference_id');
  if v_sub.id is null then
    return 'unknown_subscription';
  end if;

  -- ACTIVE / REQUIRES_ACTION hanya informasi progres, bukan bukti pembayaran.
  if upper(coalesce(p_plan->>'status', '')) <> 'INACTIVE' then
    return 'recorded';
  end if;

  update billing.billing_subscriptions
  set renewal_enabled = false,
      next_billing_at = null,
      status = case
        when status = 'active' and period_end > now() then 'active'
        else 'ended'
      end
  where id = v_sub.id and status in ('pending', 'active', 'past_due');

  update billing.billing_checkout_sessions set status = 'cancelled'
  where subscription_id = v_sub.id and status in ('creating', 'open');

  insert into billing.billing_audit_events (owner_id, environment, actor_id, action, reference_id, outcome)
  values (v_sub.owner_id, p_environment, null, 'renewal_stopped', p_plan->>'id', 'success');
  return 'applied';
end
$$;

create or replace function billing.apply_session_status(
  p_environment text, p_session_id text, p_status text, p_xendit_plan_id text default null
) returns text
language plpgsql set search_path = '' as $$
declare
  v_local text;
  v_sub_id uuid;
begin
  if nullif(btrim(p_session_id), '') is null then
    return 'invalid_payload';
  end if;

  select subscription_id into v_sub_id from billing.billing_checkout_sessions
  where environment = p_environment and xendit_session_id = btrim(p_session_id);
  if not found then
    return 'unknown_session';
  end if;

  if nullif(btrim(p_xendit_plan_id), '') is not null then
    update billing.billing_subscriptions set xendit_plan_id = btrim(p_xendit_plan_id)
    where id = v_sub_id and xendit_plan_id is null;
  end if;

  v_local := case upper(coalesce(p_status, ''))
    when 'COMPLETED' then 'completed'
    when 'EXPIRED' then 'expired'
    when 'CANCELED' then 'cancelled'
    when 'CANCELLED' then 'cancelled'
    when 'FAILED' then 'failed'
  end;
  if v_local is null then
    return 'recorded';
  end if;

  -- Sesi "completed" hanya progres; status lunas tetap menunggu siklus SUCCEEDED.
  update billing.billing_checkout_sessions set status = v_local
  where environment = p_environment and xendit_session_id = btrim(p_session_id) and status in ('creating', 'open');

  if v_local <> 'completed' then
    update billing.billing_subscriptions set status = 'ended'
    where id = v_sub_id and status = 'pending'
      and not exists (select 1 from billing.billing_cycles c where c.subscription_id = v_sub_id and c.status = 'succeeded');
  end if;
  return 'applied';
end
$$;

create or replace function billing.apply_xendit_event(p_environment text, p_event_type text, p_data jsonb)
returns text
language plpgsql set search_path = '' as $$
begin
  if jsonb_typeof(p_data) is distinct from 'object' then
    return 'invalid_payload';
  end if;
  if p_event_type like 'recurring.cycle.%' then
    return billing.apply_cycle(p_environment, p_data);
  elsif p_event_type like 'recurring.plan.%' then
    return billing.apply_plan_status(p_environment, p_data);
  elsif p_event_type like 'payment_session.%' then
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

-- Dipanggil route webhook (service_role) SETELAH token terverifikasi.
create or replace function public.platform_ingest_xendit_webhook(
  p_environment text, p_dedup_key text, p_event_type text, p_object_id text, p_payload jsonb
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_event_id uuid;
  v_result text;
begin
  if p_environment not in ('test', 'live') or coalesce(length(p_dedup_key), 0) not between 1 and 300
    or nullif(btrim(p_event_type), '') is null or jsonb_typeof(p_payload) is distinct from 'object' then
    return 'invalid_request';
  end if;

  insert into billing.billing_webhook_events (environment, event_type, dedup_key, provider_object_id, payload, attempts)
  values (p_environment, left(p_event_type, 100), p_dedup_key, left(p_object_id, 200), p_payload, 1)
  on conflict (environment, dedup_key) do nothing
  returning id into v_event_id;
  if v_event_id is null then
    return 'duplicate';
  end if;

  begin
    v_result := billing.apply_xendit_event(p_environment, p_event_type, p_payload->'data');
  exception when others then
    v_result := 'error_' || sqlstate;
  end;

  update billing.billing_webhook_events
  set status = case
        when v_result in ('applied', 'recorded', 'already_applied') then 'processed'
        when v_result = 'ignored_event' then 'ignored'
        else 'needs_review'
      end,
      last_error_code = case when v_result in ('applied', 'recorded', 'already_applied', 'ignored_event') then null else left(v_result, 100) end,
      processed_at = now()
  where id = v_event_id;

  return v_result;
end
$$;

-- Rekonsiliasi manual dari Super Admin: data sesi, plan, dan siklus yang
-- dibaca server dari API Xendit diterapkan dengan aturan yang sama dengan webhook.
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
  if not billing.is_active_super_admin(p_actor) then
    return jsonb_build_object('status', 'forbidden');
  end if;
  if p_environment not in ('test', 'live') then
    return jsonb_build_object('status', 'invalid_request');
  end if;

  -- Pastikan sesi / plan memang milik Owner ini.
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

-- Fungsi lama yang menandai lunas dari status plan/sesi digantikan fungsi di atas.
drop function if exists public.platform_save_checkout_session(uuid,uuid,text,text,text,text,text,text,text,timestamptz);
drop function if exists public.platform_sync_xendit_status(uuid,uuid,text,text,text,text,text,jsonb);

revoke all on all functions in schema billing from public, anon, authenticated;
revoke all on function
  public.platform_set_plan_price(uuid,text,bigint),
  public.platform_begin_checkout(uuid,uuid,text,text,text),
  public.platform_save_xendit_customer(uuid,uuid,text,text),
  public.platform_attach_checkout_session(uuid,text,text,text,text,text,timestamptz),
  public.platform_fail_checkout(uuid,text,text,text),
  public.platform_ingest_xendit_webhook(text,text,text,text,jsonb),
  public.platform_reconcile_xendit(uuid,uuid,text,jsonb,jsonb,jsonb)
from public, anon, authenticated;
grant execute on function
  public.platform_set_plan_price(uuid,text,bigint),
  public.platform_begin_checkout(uuid,uuid,text,text,text),
  public.platform_save_xendit_customer(uuid,uuid,text,text),
  public.platform_attach_checkout_session(uuid,text,text,text,text,text,timestamptz),
  public.platform_fail_checkout(uuid,text,text,text),
  public.platform_ingest_xendit_webhook(text,text,text,text,jsonb),
  public.platform_reconcile_xendit(uuid,uuid,text,jsonb,jsonb,jsonb)
to service_role;

notify pgrst, 'reload schema';
commit;
