-- Modal usaha (modal awal & tambahan modal) per cabang, untuk menghitung balik modal.
-- Additive: tidak mengubah tabel atau data yang sudah ada.
begin;

create table public.capital_entries (
  id          uuid          primary key default gen_random_uuid(),
  business_id uuid          not null references public.businesses(id) on delete cascade,
  date        date          not null,
  kind        text          not null check (kind in ('initial', 'additional')),
  amount      numeric(14,2) not null check (amount > 0),
  note        text          check (note is null or length(note) <= 500),
  created_at  timestamptz   not null default now(),
  updated_at  timestamptz   not null default now()
);

create index capital_entries_business_date_idx on public.capital_entries(business_id, date);

alter table public.capital_entries enable row level security;

create policy "owner all capital_entries" on public.capital_entries
  for all to authenticated
  using (business_id in (select id from public.businesses where owner_id = (select auth.uid())))
  with check (business_id in (select id from public.businesses where owner_id = (select auth.uid())));

revoke all on public.capital_entries from anon, authenticated;
grant select, insert, update, delete on public.capital_entries to authenticated;
grant select, insert, update, delete on public.capital_entries to service_role;

commit;
