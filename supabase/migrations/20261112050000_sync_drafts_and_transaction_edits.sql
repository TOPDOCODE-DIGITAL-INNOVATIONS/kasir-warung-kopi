-- Integrate the POS changes from main with the migration-based inventory schema.
-- Keep existing products, transactions, JSON snapshots and branch identities.
begin;

alter table public.transactions add column if not exists edit_history jsonb;
comment on column public.transactions.edit_history is
  'POS correction history snapshots, including reason and operator. Not overwritten by an omitted field.';

create table if not exists public.draft_orders (
  business_id uuid not null references public.businesses(id) on delete cascade,
  id text not null,
  label text,
  device_code text,
  raw jsonb not null,
  updated_at timestamptz not null,
  synced_at timestamptz not null default now(),
  primary key (business_id, id)
);
create index if not exists draft_orders_business_synced_idx
  on public.draft_orders(business_id, synced_at);

alter table public.draft_orders enable row level security;
grant select, insert, update, delete on public.draft_orders to anon, authenticated, service_role;

drop policy if exists "owner read draft_orders" on public.draft_orders;
create policy "owner read draft_orders" on public.draft_orders
  for select to authenticated
  using (business_id in (select id from public.businesses where owner_id = (select auth.uid())));

-- The sync client may use the publishable key plus x-sync-token instead of a
-- service-role key. Apply the same branch boundary as the existing POS tables.
drop policy if exists "sync token all draft_orders" on public.draft_orders;
create policy "sync token all draft_orders" on public.draft_orders
  for all to anon, authenticated
  using (business_id = public.sync_token_business_id())
  with check (business_id = public.sync_token_business_id());

notify pgrst, 'reload schema';
commit;
