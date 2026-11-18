begin;

create or replace function public.platform_list_owners(
  p_actor uuid, p_search text, p_status text, p_offset integer, p_limit integer
)
returns table (
  id uuid, name text, email text, status text, created_at timestamptz, email_confirmed boolean
)
language sql stable security definer set search_path = '' as $$
  select u.id, profile.name, u.email::text, profile.status, u.created_at, u.email_confirmed_at is not null
  from auth.users as u
  cross join lateral (
    select left(coalesce(
      case when jsonb_typeof(u.raw_user_meta_data->'name') = 'string'
        then nullif(btrim(u.raw_user_meta_data->>'name'), '') end,
      case when jsonb_typeof(u.raw_user_meta_data->'full_name') = 'string'
        then nullif(btrim(u.raw_user_meta_data->>'full_name'), '') end
    ), 120) as name,
    coalesce(u.raw_app_meta_data->>'account_status', 'active') as status
  ) as profile
  where exists (
    select 1 from auth.users as actor where actor.id = p_actor
      and actor.raw_app_meta_data->>'platform_role' = 'super_admin'
      and coalesce(actor.raw_app_meta_data->>'account_status', 'active') = 'active'
  )
    and coalesce(u.raw_app_meta_data->>'platform_role', 'owner') = 'owner'
    and profile.status in ('active', 'inactive')
    and (p_status is null or profile.status = p_status)
    and (
      coalesce(p_search, '') = ''
      or strpos(lower(coalesce(profile.name, '')), lower(p_search)) > 0
      or strpos(lower(coalesce(u.email, '')), lower(p_search)) > 0
    )
  order by u.created_at desc nulls last, u.id desc
  limit least(greatest(p_limit, 1), 51) offset greatest(p_offset, 0)
$$;

create or replace function public.platform_set_owner_status(
  p_actor uuid, p_owner uuid, p_expected_status text, p_status text
)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_expected_status is null or p_status is null
    or p_expected_status not in ('active', 'inactive') or p_status not in ('active', 'inactive')
    or p_expected_status = p_status then
    return false;
  end if;

  -- Hold the actor's authorization while applying the status change.
  perform 1 from auth.users
    where id = p_actor and raw_app_meta_data->>'platform_role' = 'super_admin'
      and coalesce(raw_app_meta_data->>'account_status', 'active') = 'active'
    for share;
  if not found then return false; end if;

  update auth.users
    set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('account_status', p_status),
      updated_at = clock_timestamp()
    where id = p_owner
      and coalesce(raw_app_meta_data->>'platform_role', 'owner') = 'owner'
      and coalesce(raw_app_meta_data->>'account_status', 'active') = p_expected_status;
  return found;
end
$$;

revoke all on function public.platform_list_owners(uuid,text,text,integer,integer),
  public.platform_set_owner_status(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.platform_list_owners(uuid,text,text,integer,integer),
  public.platform_set_owner_status(uuid,uuid,text,text) to service_role;
notify pgrst, 'reload schema';
commit;
