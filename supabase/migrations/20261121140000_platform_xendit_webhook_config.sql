begin;

create table if not exists billing.billing_webhook_settings (
  environment text primary key check (environment in ('test', 'live')),
  callback_token text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

revoke all on table billing.billing_webhook_settings from public, anon, authenticated;

create or replace function public.platform_set_webhook_token(
  p_actor uuid, p_environment text, p_callback_token text
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_token text := nullif(btrim(coalesce(p_callback_token, '')), '');
begin
  if not billing.is_active_super_admin(p_actor) then
    return 'forbidden';
  end if;
  if p_environment not in ('test', 'live') then
    return 'invalid_environment';
  end if;
  if v_token is not null and (length(v_token) < 8 or length(v_token) > 256) then
    return 'invalid_token';
  end if;

  insert into billing.billing_webhook_settings (environment, callback_token, updated_by, updated_at)
  values (p_environment, v_token, p_actor, now())
  on conflict (environment) do update set
    callback_token = excluded.callback_token,
    updated_by = excluded.updated_by,
    updated_at = now();

  return 'updated';
end
$$;

create or replace function public.platform_get_webhook_tokens()
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'test', (select callback_token from billing.billing_webhook_settings where environment = 'test'),
    'live', (select callback_token from billing.billing_webhook_settings where environment = 'live')
  )
$$;

revoke all on function
  public.platform_set_webhook_token(uuid, text, text),
  public.platform_get_webhook_tokens()
from public, anon, authenticated;

grant execute on function
  public.platform_set_webhook_token(uuid, text, text),
  public.platform_get_webhook_tokens()
to service_role;

notify pgrst, 'reload schema';
commit;
