-- Run once in the target Supabase SQL Editor after setting the two Vault secrets.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule('kasirku-billing-reconciliation', '*/15 * * * *', $job$
  select net.http_post(
    url := target.decrypted_secret,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || credential.decrypted_secret,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  )
  from vault.decrypted_secrets target
  cross join vault.decrypted_secrets credential
  where target.name = 'kasirku_billing_reconcile_url' and nullif(target.decrypted_secret, '') is not null
    and credential.name = 'kasirku_billing_reconcile_secret' and nullif(credential.decrypted_secret, '') is not null
$job$);
