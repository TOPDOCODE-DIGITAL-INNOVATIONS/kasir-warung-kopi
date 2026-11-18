begin;

create schema if not exists billing;
revoke all on schema billing from public, anon, authenticated;

create table if not exists billing.billing_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code in ('monthly', 'yearly')),
  version integer not null check (version > 0),
  name text not null,
  interval_months integer not null check (
    (code = 'monthly' and interval_months = 1) or (code = 'yearly' and interval_months = 12)
  ),
  amount bigint check (amount > 0),
  currency text not null default 'IDR' check (currency = 'IDR'),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  created_at timestamptz not null default now(),
  unique (code, version),
  check (status <> 'active' or amount is not null)
);
create unique index if not exists billing_one_active_plan_per_term on billing.billing_plans(code) where status = 'active';
insert into billing.billing_plans (code, version, name, interval_months) values
  ('monthly', 1, 'Bulanan', 1), ('yearly', 1, 'Tahunan', 12)
on conflict (code, version) do nothing;

create table if not exists billing.billing_accounts (
  owner_id uuid not null references auth.users(id) on delete restrict,
  environment text not null check (environment in ('test', 'live')),
  xendit_customer_id text,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  trial_started_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (owner_id, environment),
  unique (environment, xendit_customer_id),
  check ((trial_started_at is null and trial_ends_at is null) or
    (trial_started_at is not null and trial_ends_at is not null and trial_ends_at > trial_started_at))
);

create table if not exists billing.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  environment text not null,
  plan_id uuid not null references billing.billing_plans(id),
  status text not null default 'pending' check (status in ('pending', 'active', 'past_due', 'ended')),
  xendit_plan_id text,
  renewal_enabled boolean not null default false,
  consented_at timestamptz,
  period_start timestamptz,
  period_end timestamptz,
  next_billing_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (owner_id, environment) references billing.billing_accounts(owner_id, environment),
  unique (environment, xendit_plan_id),
  unique (id, environment),
  unique (id, owner_id, environment, plan_id),
  check ((period_start is null and period_end is null) or
    (period_start is not null and period_end is not null and period_end > period_start)),
  check (status <> 'active' or period_end is not null),
  check (not renewal_enabled or consented_at is not null)
);
create unique index if not exists billing_one_current_subscription on billing.billing_subscriptions(owner_id, environment)
  where status in ('pending', 'active', 'past_due');
create index if not exists billing_subscription_history_idx on billing.billing_subscriptions(environment, owner_id, created_at desc, id desc);

create table if not exists billing.billing_checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  environment text not null,
  plan_id uuid not null references billing.billing_plans(id),
  subscription_id uuid,
  reference_id text not null check (length(reference_id) between 1 and 64),
  xendit_session_id text,
  checkout_url text,
  status text not null default 'creating' check (status in ('creating', 'open', 'completed', 'expired', 'cancelled', 'failed')),
  amount bigint not null check (amount > 0),
  currency text not null default 'IDR' check (currency = 'IDR'),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (owner_id, environment) references billing.billing_accounts(owner_id, environment),
  foreign key (subscription_id, owner_id, environment, plan_id)
    references billing.billing_subscriptions(id, owner_id, environment, plan_id),
  unique (environment, reference_id),
  unique (environment, xendit_session_id)
);
create unique index if not exists billing_one_open_checkout on billing.billing_checkout_sessions(owner_id, environment)
  where status in ('creating', 'open');
create index if not exists billing_checkout_history_idx on billing.billing_checkout_sessions(environment, owner_id, created_at desc, id desc);

create table if not exists billing.billing_cycles (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null,
  environment text not null,
  xendit_cycle_id text not null,
  xendit_payment_id text,
  status text not null check (status in ('scheduled', 'pending', 'retrying', 'failed', 'succeeded', 'cancelled')),
  scheduled_at timestamptz,
  period_start timestamptz,
  period_end timestamptz,
  amount bigint not null check (amount > 0),
  currency text not null default 'IDR' check (currency = 'IDR'),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (subscription_id, environment) references billing.billing_subscriptions(id, environment),
  unique (environment, xendit_cycle_id),
  unique (environment, xendit_payment_id),
  check ((period_start is null and period_end is null) or
    (period_start is not null and period_end is not null and period_end > period_start)),
  check (status <> 'succeeded' or paid_at is not null)
);
create index if not exists billing_cycle_history_idx on billing.billing_cycles(subscription_id, created_at desc, id desc);

create table if not exists billing.billing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  environment text not null check (environment in ('test', 'live')),
  event_type text not null,
  dedup_key text not null,
  provider_object_id text,
  payload jsonb not null,
  status text not null default 'received' check (status in ('received', 'processed', 'needs_review')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error_code text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (environment, dedup_key)
);

create table if not exists billing.billing_audit_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  environment text not null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  reference_id text,
  outcome text not null,
  created_at timestamptz not null default now(),
  foreign key (owner_id, environment) references billing.billing_accounts(owner_id, environment)
);

create or replace function billing.is_active_super_admin(p_actor uuid)
returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1 from auth.users u where u.id = p_actor
      and u.raw_app_meta_data->>'platform_role' = 'super_admin'
      and coalesce(u.raw_app_meta_data->>'account_status', 'active') = 'active'
  )
$$;

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
    case when s.status = 'past_due' then 'past_due'
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
        or (p_filter = 'past_due' and o.subscription_status = 'past_due')
        or (p_filter = 'pending' and o.subscription_status = 'pending')
        or (p_filter = 'not_started' and o.trial_status = 'none' and o.subscription_status = 'none'))
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
      'past_due', count(*) filter (where subscription_status = 'past_due'),
      'not_started', count(*) filter (where trial_status = 'none' and subscription_status = 'none')
    ) from owners),
    'plans', coalesce((select jsonb_agg(to_jsonb(p) order by p.code) from plans p), '[]'::jsonb),
    'owners', coalesce((select jsonb_agg(to_jsonb(v) - 'reference_plan_id'
      order by lower(coalesce(v.name, v.email, '')), v.owner_id) from visible v), '[]'::jsonb)
  ) from permitted
$$;

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
    ), '[]'::jsonb)
  )
  from billing.owner_subscription_rows(p_environment, p_owner) o
  where p_owner is not null and p_environment in ('test','live') and billing.is_active_super_admin(p_actor)
$$;

revoke all on all tables in schema billing from public, anon, authenticated;
revoke all on all functions in schema billing from public, anon, authenticated;
revoke all on function public.platform_billing_overview(uuid,text,text,text,integer,integer),
  public.platform_billing_owner_detail(uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.platform_billing_overview(uuid,text,text,text,integer,integer),
  public.platform_billing_owner_detail(uuid,text,uuid) to service_role;
notify pgrst, 'reload schema';
commit;
