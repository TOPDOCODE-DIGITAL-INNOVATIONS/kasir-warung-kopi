begin;

-- Coverage is informational. Branch mutations and billing records keep their existing behavior.
create function billing.branch_coverage(p_branch_count bigint, p_subscription_status text)
returns text
language sql immutable set search_path = '' as $$
  select case
    when p_branch_count <= 1 then 'free'
    when p_subscription_status = 'active' then 'covered'
    when p_subscription_status = 'pending' then 'pending'
    else 'uncovered'
  end
$$;
revoke all on function billing.branch_coverage(bigint,text) from public, anon, authenticated;

create or replace function public.platform_billing_overview(
  p_actor uuid, p_environment text, p_search text, p_filter text, p_offset integer, p_limit integer
) returns jsonb
language sql stable security definer set search_path = '' as $$
  with permitted as (
    select 1 where p_environment in ('test','live') and billing.is_active_super_admin(p_actor)
  ), branch_counts as (
    select b.owner_id, count(*) as branch_count from public.businesses b group by b.owner_id
  ), owners as materialized (
    select o.*, coalesce(b.branch_count, 0) as branch_count,
      billing.branch_coverage(coalesce(b.branch_count, 0), o.subscription_status) as branch_coverage
    from permitted cross join billing.owner_subscription_rows(p_environment) o
    left join branch_counts b on b.owner_id = o.owner_id
  ), visible as (
    select o.* from owners o
    where (coalesce(p_search, '') = ''
      or strpos(lower(coalesce(o.name, '')), lower(p_search)) > 0
      or strpos(lower(coalesce(o.email, '')), lower(p_search)) > 0)
      and (p_filter is null
        or (p_filter = 'free_branch' and o.branch_coverage = 'free')
        or (p_filter = 'additional_uncovered' and o.branch_coverage = 'uncovered')
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
      'free_branch', count(*) filter (where branch_coverage = 'free'),
      'additional_uncovered', count(*) filter (where branch_coverage = 'uncovered'),
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
  where p_owner is not null and p_environment in ('test','live') and billing.is_active_super_admin(p_actor)
$$;

notify pgrst, 'reload schema';
commit;
