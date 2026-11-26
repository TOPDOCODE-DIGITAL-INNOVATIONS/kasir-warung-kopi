-- Akses Penguji (user testing), penghentian trial oleh Super Admin, dan data insight platform.
--
-- 1. billing_accounts mendapat kolom tester_*: Super Admin dapat memberi akses penuh tanpa
--    pembayaran sampai tanggal tertentu. Akses dihitung di shared/billing-access.ts seperti
--    periode berbayar, sehingga dashboard & kasir tidak dibatasi selama akses penguji berlaku.
-- 2. platform_end_trial: mengakhiri trial sekarang (atau menandai trial terpakai bila belum
--    dimulai) agar trial otomatis tidak dimulai lagi.
-- 3. platform_set_tester_access: memberi/mencabut akses penguji. Memberi akses juga mengakhiri
--    trial yang sedang/akan berjalan.
-- 4. Fungsi baca untuk detail aktivitas Owner dan chart Overview Platform.
--
-- Aditif: tidak menghapus data. Semua fungsi publik hanya dapat dipanggil service_role.
begin;

alter table billing.billing_accounts
  add column if not exists tester_until timestamptz,
  add column if not exists tester_note text,
  add column if not exists tester_granted_by uuid references auth.users(id) on delete set null,
  add column if not exists tester_granted_at timestamptz;

do $$ begin
  alter table billing.billing_accounts add constraint billing_accounts_tester_note_length
    check (tester_note is null or length(tester_note) <= 200);
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------
-- Mutasi Super Admin
-- ---------------------------------------------------------------------

-- Mengakhiri trial tanpa mengubah tanggal mulai yang sudah tercatat. Dipanggil di dalam
-- transaksi yang sudah memegang lock billing_trial Owner.
create or replace function billing.end_trial_now(p_owner uuid, p_environment text, p_actor uuid)
returns boolean
language plpgsql set search_path = '' as $$
declare
  v_now timestamptz := now();
begin
  insert into billing.billing_accounts as a (owner_id, environment, trial_started_at, trial_ends_at, trial_started_by)
  values (p_owner, p_environment, v_now - interval '1 second', v_now, p_actor)
  on conflict (owner_id, environment) do update set
    trial_started_at = least(a.trial_started_at, v_now - interval '1 second'),
    trial_ends_at = v_now,
    trial_started_by = coalesce(a.trial_started_by, excluded.trial_started_by)
  where a.trial_started_at is null or a.trial_ends_at > v_now;
  return found;
end
$$;

create or replace function billing.is_platform_owner(p_owner uuid)
returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1 from auth.users u where u.id = p_owner
      and coalesce(u.raw_app_meta_data->>'platform_role', 'owner') = 'owner'
      and coalesce(u.raw_app_meta_data->>'account_status', 'active') in ('active', 'inactive')
  )
$$;

create or replace function public.platform_end_trial(p_actor uuid, p_owner uuid, p_environment text)
returns text
language plpgsql security definer set search_path = '' as $$
begin
  if not billing.is_active_super_admin(p_actor) then return 'forbidden'; end if;
  if p_owner is null or p_environment is null or p_environment not in ('test', 'live') then
    return 'invalid_request';
  end if;
  if not billing.is_platform_owner(p_owner) then return 'owner_not_found'; end if;

  perform pg_advisory_xact_lock(hashtext('billing_trial:' || p_environment || ':' || p_owner::text));
  if not billing.end_trial_now(p_owner, p_environment, p_actor) then return 'trial_not_active'; end if;

  insert into billing.billing_audit_events (owner_id, environment, actor_id, action, outcome)
  values (p_owner, p_environment, p_actor, 'trial_ended_by_admin', 'success');
  return 'ended';
end
$$;

-- p_until null = cabut akses penguji (berakhir sekarang, Owner tetap mendapat masa toleransi).
create or replace function public.platform_set_tester_access(
  p_actor uuid, p_owner uuid, p_environment text, p_until timestamptz, p_note text
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := now();
  v_note text := left(nullif(btrim(coalesce(p_note, '')), ''), 200);
begin
  if not billing.is_active_super_admin(p_actor) then return 'forbidden'; end if;
  if p_owner is null or p_environment is null or p_environment not in ('test', 'live') then
    return 'invalid_request';
  end if;
  if p_until is not null and (p_until <= v_now or p_until > v_now + interval '3 years') then
    return 'invalid_period';
  end if;
  if not billing.is_platform_owner(p_owner) then return 'owner_not_found'; end if;

  perform pg_advisory_xact_lock(hashtext('billing_trial:' || p_environment || ':' || p_owner::text));

  if p_until is null then
    update billing.billing_accounts set tester_until = v_now
    where owner_id = p_owner and environment = p_environment and tester_until > v_now;
    if not found then return 'not_tester'; end if;
    insert into billing.billing_audit_events (owner_id, environment, actor_id, action, outcome)
    values (p_owner, p_environment, p_actor, 'tester_revoked', 'success');
    return 'revoked';
  end if;

  if billing.end_trial_now(p_owner, p_environment, p_actor) then
    insert into billing.billing_audit_events (owner_id, environment, actor_id, action, outcome)
    values (p_owner, p_environment, p_actor, 'trial_ended_by_admin', 'success');
  end if;

  update billing.billing_accounts
  set tester_until = p_until, tester_note = v_note, tester_granted_by = p_actor, tester_granted_at = v_now
  where owner_id = p_owner and environment = p_environment;

  insert into billing.billing_audit_events (owner_id, environment, actor_id, action, reference_id, outcome)
  values (p_owner, p_environment, p_actor, 'tester_granted', to_char(p_until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'success');
  return 'granted';
end
$$;

-- ---------------------------------------------------------------------
-- Status billing Owner (dashboard + API sync): sekarang menyertakan akses penguji.
-- ---------------------------------------------------------------------
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
    'tester_until', v_account.tester_until,
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

-- ---------------------------------------------------------------------
-- Baris billing per Owner untuk halaman Super Admin (+ kolom penguji).
-- Return type berubah, jadi fungsi dibuat ulang.
-- ---------------------------------------------------------------------
drop function if exists billing.owner_subscription_rows(text, uuid);
create function billing.owner_subscription_rows(p_environment text, p_owner uuid default null)
returns table (
  owner_id uuid, name text, email text, trial_status text, trial_start timestamptz, trial_end timestamptz,
  subscription_status text, plan_name text, period_start timestamptz, period_end timestamptz,
  next_billing_at timestamptz, renewal_enabled boolean, reference_plan_id text,
  tester_status text, tester_until timestamptz, tester_note text, tester_granted_at timestamptz
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
    coalesce(p.name, requested_plan.name), s.period_start, s.period_end, s.next_billing_at, s.renewal_enabled, s.xendit_plan_id,
    case when a.tester_until is null then 'none' when a.tester_until > now() then 'active' else 'expired' end,
    a.tester_until, a.tester_note, a.tester_granted_at
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

create or replace function public.platform_billing_overview(
  p_actor uuid, p_environment text, p_search text, p_filter text, p_offset integer, p_limit integer
) returns jsonb
language sql stable security definer set search_path = '' as $$
  with permitted as (
    select 1 where p_environment in ('test','live') and billing.is_active_super_admin(p_actor)
  ), owners as materialized (
    select o.* from permitted cross join billing.owner_subscription_rows(p_environment) o
  ), visible as (
    select o.* from owners o
    where (coalesce(p_search, '') = ''
      or strpos(lower(coalesce(o.name, '')), lower(p_search)) > 0
      or strpos(lower(coalesce(o.email, '')), lower(p_search)) > 0)
      and (p_filter is null
        or (p_filter = 'trial_active' and o.trial_status = 'active')
        or (p_filter = 'subscription_active' and o.subscription_status = 'active')
        or (p_filter = 'tester_active' and o.tester_status = 'active')
        or (p_filter = 'past_due' and o.subscription_status = 'past_due')
        or (p_filter = 'pending' and o.subscription_status = 'pending')
        or (p_filter = 'not_started' and o.trial_status = 'none' and o.subscription_status = 'none' and o.tester_status = 'none'))
    order by lower(coalesce(o.name, o.email, '')), o.owner_id
    limit least(greatest(p_limit, 1), 51) offset greatest(p_offset, 0)
  ), plans as (
    select distinct on (p.code) p.name, p.code, p.version, p.amount, p.currency, p.status
    from billing.billing_plans p where p.status in ('draft', 'active')
    order by p.code, (p.status = 'active') desc, p.version desc
  )
  select jsonb_build_object(
    'summary', (select jsonb_build_object(
      'trial_active', count(*) filter (where trial_status = 'active'),
      'subscription_active', count(*) filter (where subscription_status = 'active'),
      'tester_active', count(*) filter (where tester_status = 'active'),
      'past_due', count(*) filter (where subscription_status = 'past_due'),
      'not_started', count(*) filter (where trial_status = 'none' and subscription_status = 'none' and tester_status = 'none')
    ) from owners),
    'plans', coalesce((select jsonb_agg(to_jsonb(p) order by p.code) from plans p), '[]'::jsonb),
    'owners', coalesce((select jsonb_agg(to_jsonb(v) - 'reference_plan_id'
      order by lower(coalesce(v.name, v.email, '')), v.owner_id) from visible v), '[]'::jsonb)
  ) from permitted
$$;

-- Riwayat audit billing ditambahkan ke detail (aksi admin, checkout, pembayaran).
create or replace function public.platform_billing_owner_detail(p_actor uuid, p_environment text, p_owner uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'owner', to_jsonb(o),
    'cycles', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.created_at desc, c.id desc)
      from (
        select c.id, c.scheduled_at, c.amount, c.status, c.paid_at, c.xendit_payment_id, c.created_at, p.name as plan_name
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
    ), '[]'::jsonb),
    'audit', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.created_at desc, e.id desc)
      from (
        select e.id, e.action, e.outcome, e.reference_id, e.created_at,
          case when e.actor_id is null then 'Sistem (Xendit)'
            when e.actor_id = o.owner_id then 'Owner'
            else coalesce(nullif(btrim(actor.raw_user_meta_data->>'name'), ''), actor.email::text, 'Super Admin') end as actor
        from billing.billing_audit_events e
        left join auth.users actor on actor.id = e.actor_id
        where e.owner_id = o.owner_id and e.environment = p_environment
        order by e.created_at desc, e.id desc limit 30
      ) e
    ), '[]'::jsonb)
  )
  from billing.owner_subscription_rows(p_environment, p_owner) o
  where p_owner is not null and p_environment in ('test','live') and billing.is_active_super_admin(p_actor)
$$;

-- ---------------------------------------------------------------------
-- Aktivitas satu Owner: ringkasan usaha, tren 30 hari, cabang, dan linimasa aktivitas.
-- Tanggal dikelompokkan dalam WITA (Asia/Makassar), sama dengan tampilan dashboard.
-- ---------------------------------------------------------------------
create or replace function public.platform_owner_activity(p_actor uuid, p_owner uuid, p_environment text)
returns jsonb
language sql stable security definer set search_path = '' as $$
  with permitted as (
    select u.* from auth.users u
    where u.id = p_owner and p_environment in ('test', 'live')
      and billing.is_active_super_admin(p_actor) and billing.is_platform_owner(p_owner)
  ), branches as materialized (
    select b.id, b.name, b.created_at, b.last_synced_at, b.last_device_code
    from public.businesses b join permitted u on b.owner_id = u.id
  ), days as (
    select generate_series(
      date_trunc('day', now() at time zone 'Asia/Makassar') - interval '29 days',
      date_trunc('day', now() at time zone 'Asia/Makassar'),
      interval '1 day') as day
  ), tx as materialized (
    select t.business_id, t.created_at, t.grand_total
    from public.transactions t join branches b on b.id = t.business_id
    where t.status = 'completed'
      and t.created_at >= (date_trunc('day', now() at time zone 'Asia/Makassar') - interval '29 days') at time zone 'Asia/Makassar'
  ), branch_stats as (
    select b.*,
      (select count(*) from tx where tx.business_id = b.id) as transactions_30d,
      (select coalesce(sum(tx.grand_total), 0) from tx where tx.business_id = b.id) as revenue_30d,
      (select max(t.created_at) from public.transactions t where t.business_id = b.id) as last_transaction_at,
      (select count(*) from public.products p where p.business_id = b.id) as product_count,
      (select count(*) from public.shifts s where s.business_id = b.id and s.end_time is null and s.start_time is not null) as open_shifts
    from branches b
  ), events as (
    select u.created_at as at, 'account_created' as kind, null::text as branch, null::text as detail from permitted u
    union all
    select u.email_confirmed_at, 'email_confirmed', null, null from permitted u where u.email_confirmed_at is not null
    union all
    select u.last_sign_in_at, 'signed_in', null, null from permitted u where u.last_sign_in_at is not null
    union all
    select b.created_at, 'branch_created', b.name, null from branches b
    union all
    select b.last_synced_at, 'synced', b.name, b.last_device_code from branches b where b.last_synced_at is not null
    union all
    select * from (
      select s.start_time, 'shift_opened', b.name, s.cashier_name
      from public.shifts s join branches b on b.id = s.business_id
      where s.start_time is not null order by s.start_time desc limit 15
    ) opened
    union all
    select * from (
      select s.end_time, 'shift_closed', b.name,
        concat_ws(' · ', s.cashier_name, s.total_transactions::text || ' transaksi')
      from public.shifts s join branches b on b.id = s.business_id
      where s.end_time is not null order by s.end_time desc limit 15
    ) closed
    union all
    select * from (
      select e.created_at, 'billing:' || e.action, null, e.reference_id
      from billing.billing_audit_events e
      where e.owner_id = p_owner and e.environment = p_environment
      order by e.created_at desc limit 20
    ) audit
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'branches', (select count(*) from branches),
      'active_branches_7d', (select count(*) from branches where last_synced_at > now() - interval '7 days'),
      'transactions_30d', (select count(*) from tx),
      'revenue_30d', (select coalesce(sum(grand_total), 0) from tx),
      'transactions_total', (select count(*) from public.transactions t join branches b on b.id = t.business_id where t.status = 'completed'),
      'last_transaction_at', (select max(last_transaction_at) from branch_stats),
      'last_synced_at', (select max(last_synced_at) from branches),
      'products', (select coalesce(sum(product_count), 0) from branch_stats)
    ),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', to_char(d.day, 'YYYY-MM-DD'),
        'transactions', (select count(*) from tx where date_trunc('day', tx.created_at at time zone 'Asia/Makassar') = d.day),
        'revenue', (select coalesce(sum(grand_total), 0) from tx where date_trunc('day', tx.created_at at time zone 'Asia/Makassar') = d.day)
      ) order by d.day), '[]'::jsonb) from days d
    ),
    'branches', (
      select coalesce(jsonb_agg(to_jsonb(b) order by b.created_at desc, b.id desc), '[]'::jsonb) from branch_stats b
    ),
    'events', (
      select coalesce(jsonb_agg(to_jsonb(e) order by e.at desc), '[]'::jsonb)
      from (select * from events order by at desc limit 40) e
    )
  ) from permitted
$$;

-- ---------------------------------------------------------------------
-- Insight Overview Platform: deret waktu + KPI + Owner teraktif + aktivitas terbaru.
-- p_range: '30d' (harian), '90d' (mingguan), '12m' (bulanan).
-- ---------------------------------------------------------------------
create or replace function public.platform_insights(p_actor uuid, p_environment text, p_range text)
returns jsonb
language sql stable security definer set search_path = '' as $$
  with cfg as (
    select
      case p_range when '12m' then 'month' when '90d' then 'week' else 'day' end as unit,
      case p_range
        when '12m' then date_trunc('month', now() at time zone 'Asia/Makassar') - interval '11 months'
        when '90d' then date_trunc('week', now() at time zone 'Asia/Makassar') - interval '12 weeks'
        else date_trunc('day', now() at time zone 'Asia/Makassar') - interval '29 days' end as start_local,
      case p_range when '12m' then interval '1 month' when '90d' then interval '1 week' else interval '1 day' end as step
    where p_environment in ('test', 'live') and p_range in ('30d', '90d', '12m')
      and billing.is_active_super_admin(p_actor)
  ), bounds as (
    select cfg.*, cfg.start_local at time zone 'Asia/Makassar' as start_at from cfg
  ), buckets as (
    select generate_series(b.start_local, date_trunc(b.unit, now() at time zone 'Asia/Makassar'), b.step) as bucket
    from bounds b
  ), owners as materialized (
    select u.id, u.created_at,
      left(coalesce(nullif(btrim(u.raw_user_meta_data->>'name'), ''), nullif(btrim(u.raw_user_meta_data->>'full_name'), '')), 120) as name,
      u.email::text as email
    from auth.users u
    where coalesce(u.raw_app_meta_data->>'platform_role', 'owner') = 'owner'
      and coalesce(u.raw_app_meta_data->>'account_status', 'active') in ('active', 'inactive')
  ), branches as materialized (
    select b.id, b.owner_id, b.created_at, b.last_synced_at from public.businesses b join owners o on o.id = b.owner_id
  ), tx as materialized (
    select br.owner_id, date_trunc((select unit from bounds), t.created_at at time zone 'Asia/Makassar') as bucket, t.grand_total
    from public.transactions t join branches br on br.id = t.business_id
    where t.status = 'completed' and t.created_at >= (select start_at from bounds)
  ), paid as materialized (
    select date_trunc((select unit from bounds), c.paid_at at time zone 'Asia/Makassar') as bucket, c.amount
    from billing.billing_cycles c
    where c.environment = p_environment and c.status = 'succeeded' and c.paid_at >= (select start_at from bounds)
  ), new_owners as (
    select date_trunc((select unit from bounds), o.created_at at time zone 'Asia/Makassar') as bucket, count(*) as n
    from owners o where o.created_at >= (select start_at from bounds) group by 1
  ), new_branches as (
    select date_trunc((select unit from bounds), b.created_at at time zone 'Asia/Makassar') as bucket, count(*) as n
    from branches b where b.created_at >= (select start_at from bounds) group by 1
  ), tx_bucket as (
    select bucket, count(*) as n, sum(grand_total) as gmv from tx group by 1
  ), paid_bucket as (
    select bucket, sum(amount) as amount from paid group by 1
  ), recent as (
    select * from (
      select e.created_at as at, 'billing:' || e.action as kind, e.owner_id, o.name, o.email
      from billing.billing_audit_events e join owners o on o.id = e.owner_id
      where e.environment = p_environment and e.action <> 'xendit_reconciled'
      order by e.created_at desc limit 12
    ) a
    union all
    select * from (
      select o.created_at, 'account_created', o.id, o.name, o.email from owners o order by o.created_at desc limit 12
    ) s
  )
  select jsonb_build_object(
    'range', p_range,
    'unit', (select unit from bounds),
    'series', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'bucket', to_char(k.bucket, 'YYYY-MM-DD'),
        'new_owners', coalesce(no.n, 0),
        'new_branches', coalesce(nb.n, 0),
        'transactions', coalesce(tb.n, 0),
        'gmv', coalesce(tb.gmv, 0),
        'billing_revenue', coalesce(pb.amount, 0)
      ) order by k.bucket), '[]'::jsonb)
      from buckets k
      left join new_owners no on no.bucket = k.bucket
      left join new_branches nb on nb.bucket = k.bucket
      left join tx_bucket tb on tb.bucket = k.bucket
      left join paid_bucket pb on pb.bucket = k.bucket
    ),
    'kpis', jsonb_build_object(
      'new_owners', (select count(*) from owners where created_at >= (select start_at from bounds)),
      'transactions', (select count(*) from tx),
      'gmv', (select coalesce(sum(grand_total), 0) from tx),
      'billing_revenue', (select coalesce(sum(amount), 0) from paid),
      'active_branches_7d', (select count(*) from branches where last_synced_at > now() - interval '7 days'),
      'active_owners_7d', (select count(distinct owner_id) from branches where last_synced_at > now() - interval '7 days'),
      'transacting_owners', (select count(distinct owner_id) from tx)
    ),
    'top_owners', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.transactions desc, t.gmv desc), '[]'::jsonb)
      from (
        select o.id as owner_id, o.name, o.email, count(*) as transactions, sum(tx.grand_total) as gmv,
          (select count(*) from branches b where b.owner_id = o.id) as branches
        from tx join owners o on o.id = tx.owner_id
        group by o.id, o.name, o.email
        order by count(*) desc, sum(tx.grand_total) desc limit 5
      ) t
    ),
    'recent', (
      select coalesce(jsonb_agg(to_jsonb(r) order by r.at desc), '[]'::jsonb)
      from (select * from recent order by at desc limit 12) r
    )
  ) from bounds
$$;

revoke all on all functions in schema billing from public, anon, authenticated;
revoke all on function
  public.platform_end_trial(uuid,uuid,text),
  public.platform_set_tester_access(uuid,uuid,text,timestamptz,text),
  public.owner_billing_status(uuid,text,integer),
  public.platform_billing_overview(uuid,text,text,text,integer,integer),
  public.platform_billing_owner_detail(uuid,text,uuid),
  public.platform_owner_activity(uuid,uuid,text),
  public.platform_insights(uuid,text,text)
from public, anon, authenticated;
grant execute on function
  public.platform_end_trial(uuid,uuid,text),
  public.platform_set_tester_access(uuid,uuid,text,timestamptz,text),
  public.owner_billing_status(uuid,text,integer),
  public.platform_billing_overview(uuid,text,text,text,integer,integer),
  public.platform_billing_owner_detail(uuid,text,uuid),
  public.platform_owner_activity(uuid,uuid,text),
  public.platform_insights(uuid,text,text)
to service_role;

notify pgrst, 'reload schema';
commit;
