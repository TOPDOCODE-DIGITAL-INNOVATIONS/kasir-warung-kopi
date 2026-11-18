begin;

create or replace function public.platform_start_trial(
  p_actor uuid, p_owner uuid, p_environment text, p_duration_days integer
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  owner_email_confirmed_at timestamptz;
  started_at timestamptz := now();
begin
  if p_owner is null or p_environment is null or p_environment not in ('test', 'live')
    or p_duration_days is null or p_duration_days <= 0 then
    return 'invalid_request';
  end if;

  perform 1 from auth.users u
    where u.id = p_actor and u.raw_app_meta_data->>'platform_role' = 'super_admin'
      and coalesce(u.raw_app_meta_data->>'account_status', 'active') = 'active'
    for share;
  if not found then return 'forbidden'; end if;

  select u.email_confirmed_at into owner_email_confirmed_at
    from auth.users u where u.id = p_owner
      and coalesce(u.raw_app_meta_data->>'platform_role', 'owner') = 'owner'
      and coalesce(u.raw_app_meta_data->>'account_status', 'active') in ('active', 'inactive')
    for share;
  if not found then return 'owner_not_found'; end if;
  if owner_email_confirmed_at is null then return 'email_unverified'; end if;

  insert into billing.billing_accounts as account (
    owner_id, environment, trial_started_at, trial_ends_at, trial_started_by
  ) values (
    p_owner, p_environment, started_at, started_at + p_duration_days * interval '24 hours', p_actor
  )
  on conflict (owner_id, environment) do update set
    trial_started_at = excluded.trial_started_at,
    trial_ends_at = excluded.trial_ends_at,
    trial_started_by = excluded.trial_started_by
  where account.trial_started_at is null;

  if not found then return 'trial_already_used'; end if;

  insert into billing.billing_audit_events (owner_id, environment, actor_id, action, outcome, created_at)
    values (p_owner, p_environment, p_actor, 'trial_started', 'success', started_at);
  return 'started';
end
$$;

revoke all on function public.platform_start_trial(uuid,uuid,text,integer) from public, anon, authenticated;
grant execute on function public.platform_start_trial(uuid,uuid,text,integer) to service_role;
notify pgrst, 'reload schema';
commit;
