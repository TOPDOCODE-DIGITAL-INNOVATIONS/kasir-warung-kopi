-- Additive rollout: no business data, ownership, policies or sessions are changed.
begin;
-- Abort rather than queue behind a busy production Auth table indefinitely.
set local lock_timeout = '5s';

create schema if not exists platform_private;
revoke all on schema platform_private from public, anon, authenticated;

-- Only missing/null application fields receive defaults. In particular, never
-- copy user-editable raw_user_meta_data.role into a trusted platform role.
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object(
    'platform_role', coalesce(raw_app_meta_data->>'platform_role', 'owner'),
    'account_status', coalesce(raw_app_meta_data->>'account_status', 'active')
  )
where raw_app_meta_data->>'platform_role' is null
   or raw_app_meta_data->>'account_status' is null;

create or replace function platform_private.initialize_account()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Auth Admin API may supply trusted metadata; ordinary signup cannot.
  new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb)
    || pg_catalog.jsonb_build_object(
      'platform_role', coalesce(new.raw_app_meta_data->>'platform_role', 'owner'),
      'account_status', coalesce(new.raw_app_meta_data->>'account_status', 'active')
    );
  return new;
end;
$$;

revoke all on function platform_private.initialize_account() from public, anon, authenticated;
drop trigger if exists platform_initialize_account on auth.users;
create trigger platform_initialize_account
  before insert on auth.users
  for each row execute function platform_private.initialize_account();

commit;
