begin;

create or replace function public.platform_owner_overview(p_actor uuid)
returns table (owner_count bigint, branch_count bigint, active_owner_count bigint, inactive_owner_count bigint)
language sql stable security definer set search_path = '' as $$
  with owners as (
    select u.id, coalesce(u.raw_app_meta_data->>'account_status', 'active') as status
    from auth.users u
    where coalesce(u.raw_app_meta_data->>'platform_role', 'owner') = 'owner'
      and coalesce(u.raw_app_meta_data->>'account_status', 'active') in ('active', 'inactive')
  ), totals as (
    select count(*) as owners,
      count(*) filter (where status = 'active') as active,
      count(*) filter (where status = 'inactive') as inactive
    from owners
  )
  select totals.owners,
    (select count(*) from public.businesses b join owners o on o.id = b.owner_id),
    totals.active, totals.inactive
  from totals
  where exists (
    select 1 from auth.users actor where actor.id = p_actor
      and actor.raw_app_meta_data->>'platform_role' = 'super_admin'
      and coalesce(actor.raw_app_meta_data->>'account_status', 'active') = 'active'
  )
$$;

create or replace function public.platform_list_owners_with_branches(
  p_actor uuid, p_search text, p_status text, p_offset integer, p_limit integer
)
returns table (
  id uuid, name text, email text, status text, created_at timestamptz, email_confirmed boolean, branch_count bigint
)
language sql stable security definer set search_path = '' as $$
  with owners as materialized (
    select * from public.platform_list_owners(p_actor, p_search, p_status, p_offset, p_limit)
  ), counts as (
    select b.owner_id, count(*) as branch_count
    from public.businesses b join owners o on o.id = b.owner_id
    group by b.owner_id
  )
  select o.id, o.name, o.email, o.status, o.created_at, o.email_confirmed, coalesce(c.branch_count, 0)
  from owners o left join counts c on c.owner_id = o.id
  order by o.created_at desc nulls last, o.id desc
$$;

create or replace function public.platform_get_owner_detail(
  p_actor uuid, p_owner uuid, p_offset integer, p_limit integer
)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', u.id,
    'name', left(coalesce(
      case when jsonb_typeof(u.raw_user_meta_data->'name') = 'string'
        then nullif(btrim(u.raw_user_meta_data->>'name'), '') end,
      case when jsonb_typeof(u.raw_user_meta_data->'full_name') = 'string'
        then nullif(btrim(u.raw_user_meta_data->>'full_name'), '') end
    ), 120),
    'email', u.email,
    'status', coalesce(u.raw_app_meta_data->>'account_status', 'active'),
    'created_at', u.created_at,
    'email_confirmed', u.email_confirmed_at is not null,
    'last_sign_in_at', u.last_sign_in_at,
    'branch_count', (select count(*) from public.businesses b where b.owner_id = u.id),
    'branches', coalesce((
      select jsonb_agg(to_jsonb(branch) order by branch.created_at desc, branch.id desc)
      from (
        select b.id, b.name, b.created_at from public.businesses b
        where b.owner_id = u.id
        order by b.created_at desc, b.id desc
        limit least(greatest(p_limit, 1), 51) offset greatest(p_offset, 0)
      ) branch
    ), '[]'::jsonb)
  )
  from auth.users u
  where u.id = p_owner
    and coalesce(u.raw_app_meta_data->>'platform_role', 'owner') = 'owner'
    and coalesce(u.raw_app_meta_data->>'account_status', 'active') in ('active', 'inactive')
    and exists (
      select 1 from auth.users actor where actor.id = p_actor
        and actor.raw_app_meta_data->>'platform_role' = 'super_admin'
        and coalesce(actor.raw_app_meta_data->>'account_status', 'active') = 'active'
    )
$$;

revoke all on function public.platform_owner_overview(uuid),
  public.platform_list_owners_with_branches(uuid,text,text,integer,integer),
  public.platform_get_owner_detail(uuid,uuid,integer,integer) from public, anon, authenticated;
grant execute on function public.platform_owner_overview(uuid),
  public.platform_list_owners_with_branches(uuid,text,text,integer,integer),
  public.platform_get_owner_detail(uuid,uuid,integer,integer) to service_role;
notify pgrst, 'reload schema';
commit;
