begin;

create function public.platform_billing_schema_ready()
returns boolean
language sql stable set search_path = '' as $$
  select to_regprocedure('public.platform_begin_payment_checkout(uuid,uuid,text,text,text)') is not null
    and to_regprocedure('public.platform_attach_checkout_session(uuid,text,text,text,text,timestamptz)') is not null
    and to_regprocedure('public.platform_ingest_xendit_webhook(text,text,text,text,jsonb)') is not null
    and to_regprocedure('public.platform_claim_payment_reconciliation(text,integer,uuid,uuid)') is not null
    and to_regprocedure('public.platform_finish_payment_reconciliation(text,uuid,timestamptz,uuid,jsonb,text)') is not null
$$;

revoke all on function public.platform_billing_schema_ready() from public, anon, authenticated;
grant execute on function public.platform_billing_schema_ready() to service_role;

notify pgrst, 'reload schema';
commit;
