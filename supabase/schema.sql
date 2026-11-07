-- =====================================================================
-- Skema database Kasir Warung Kopi (Supabase / PostgreSQL)
-- Jalankan sekali di Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Aman dijalankan ulang (idempotent).
--
-- Alur data:
--   * Owner login ke dashboard (Supabase Auth) dan membuat "cabang" (businesses).
--   * Setiap cabang punya sync_token. Token ini diisi di aplikasi kasir.
--   * Kasir mengirim data ke POST /api/sync; server memakai service role key
--     untuk menulis ke tabel di bawah, berdasarkan cabang pemilik token.
--   * Dashboard membaca data lewat RLS: owner hanya melihat cabang miliknya.
-- ID transaksi/produk/pengeluaran berasal dari perangkat kasir (teks), jadi
-- primary key-nya gabungan (business_id, id).
-- =====================================================================

create or replace function public.random_token() returns text
language sql volatile as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
$$;

-- ---------------------------------------------------------------------
-- Cabang usaha
-- ---------------------------------------------------------------------
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  address text,
  sync_token text not null unique default public.random_token(),
  last_synced_at timestamptz,
  last_device_code text,
  created_at timestamptz not null default now()
);
create index if not exists businesses_owner_idx on public.businesses(owner_id);

-- ---------------------------------------------------------------------
-- Produk (cerminan katalog di perangkat kasir)
-- ---------------------------------------------------------------------
create table if not exists public.products (
  business_id uuid not null references public.businesses(id) on delete cascade,
  id text not null,
  name text not null,
  category_id text,
  price numeric(14,2) not null default 0,
  cost_price numeric(14,2),
  stock integer not null default 0, -- -1 = tidak terbatas
  is_available boolean not null default true,
  raw jsonb,
  synced_at timestamptz not null default now(),
  primary key (business_id, id)
);

-- ---------------------------------------------------------------------
-- Transaksi (items disimpan sebagai JSON sesuai struktur keranjang kasir)
-- ---------------------------------------------------------------------
create table if not exists public.transactions (
  business_id uuid not null references public.businesses(id) on delete cascade,
  id text not null,
  created_at timestamptz not null,
  device_code text,
  shift_id text,
  cashier_id text,
  cashier_name text,
  order_type text,
  customer_name text,
  customer_phone text,
  items jsonb not null default '[]'::jsonb,
  subtotal numeric(14,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  discount_reason text,
  tax_amount numeric(14,2) not null default 0,
  grand_total numeric(14,2) not null default 0,
  payment_type text,
  payment_detail text,
  amount_paid numeric(14,2) not null default 0,
  change_amount numeric(14,2) not null default 0,
  status text not null default 'completed', -- completed | cancelled
  cancel_reason text,
  cancelled_at timestamptz,
  cancelled_by text,
  debt_status text, -- unpaid | paid (hanya untuk bon)
  debt_paid_at timestamptz,
  debt_paid_method text,
  notes text,
  synced_at timestamptz not null default now(),
  primary key (business_id, id)
);
create index if not exists transactions_business_created_idx on public.transactions(business_id, created_at desc);

-- ---------------------------------------------------------------------
-- Pengeluaran
-- ---------------------------------------------------------------------
create table if not exists public.expenses (
  business_id uuid not null references public.businesses(id) on delete cascade,
  id text not null,
  scope text not null, -- daily | monthly
  date text not null, -- YYYY-MM-DD (harian) atau YYYY-MM (bulanan)
  category text,
  amount numeric(14,2) not null default 0,
  note text,
  from_drawer boolean not null default false,
  shift_id text,
  created_by text,
  created_at timestamptz,
  synced_at timestamptz not null default now(),
  primary key (business_id, id)
);
create index if not exists expenses_business_date_idx on public.expenses(business_id, date desc);

-- ---------------------------------------------------------------------
-- Shift kasir
-- ---------------------------------------------------------------------
create table if not exists public.shifts (
  business_id uuid not null references public.businesses(id) on delete cascade,
  id text not null,
  cashier_id text,
  cashier_name text,
  start_time timestamptz,
  end_time timestamptz,
  starting_cash numeric(14,2) not null default 0,
  ending_cash_actual numeric(14,2),
  expected_cash numeric(14,2),
  total_sales_cash numeric(14,2) not null default 0,
  total_sales_non_cash numeric(14,2) not null default 0,
  total_sales_debt numeric(14,2) not null default 0,
  expenses_cash numeric(14,2) not null default 0,
  total_transactions integer not null default 0,
  status text,
  raw jsonb,
  synced_at timestamptz not null default now(),
  primary key (business_id, id)
);
create index if not exists shifts_business_start_idx on public.shifts(business_id, start_time desc);

-- ---------------------------------------------------------------------
-- Row Level Security
-- Penulisan dari kasir lewat /api/sync memakai service role (melewati RLS).
-- ---------------------------------------------------------------------
alter table public.businesses enable row level security;
alter table public.products enable row level security;
alter table public.transactions enable row level security;
alter table public.expenses enable row level security;
alter table public.shifts enable row level security;

drop policy if exists "owner select businesses" on public.businesses;
drop policy if exists "owner insert businesses" on public.businesses;
drop policy if exists "owner update businesses" on public.businesses;
drop policy if exists "owner delete businesses" on public.businesses;
create policy "owner select businesses" on public.businesses for select using (owner_id = auth.uid());
create policy "owner insert businesses" on public.businesses for insert with check (owner_id = auth.uid());
create policy "owner update businesses" on public.businesses for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner delete businesses" on public.businesses for delete using (owner_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['products', 'transactions', 'expenses', 'shifts'] loop
    execute format('drop policy if exists "owner read %1$s" on public.%1$I', t);
    execute format(
      'create policy "owner read %1$s" on public.%1$I for select using (business_id in (select id from public.businesses where owner_id = auth.uid()))',
      t
    );
  end loop;
end $$;
