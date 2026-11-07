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
-- Kelebihan: kembalian yang diganti permen / tidak dikembalikan (uang tetap di laci).
alter table public.transactions add column if not exists overpay_amount numeric(14,2) not null default 0;

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
-- Rekap manual (data lama sebelum memakai aplikasi kasir)
-- Hanya total penjualan & pengeluaran per hari atau per bulan, diisi owner
-- dari dashboard. Satu baris per (cabang, jenis, tanggal) agar tidak dobel.
-- ---------------------------------------------------------------------
create table if not exists public.manual_summaries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  period text not null check (period in ('day', 'month')),
  date text not null, -- YYYY-MM-DD (day) atau YYYY-MM (month)
  sales numeric(14,2) not null default 0 check (sales >= 0),
  expenses numeric(14,2) not null default 0 check (expenses >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, period, date),
  check (
    (period = 'day' and date ~ '^\d{4}-\d{2}-\d{2}$')
    or (period = 'month' and date ~ '^\d{4}-\d{2}$')
  )
);
create index if not exists manual_summaries_business_date_idx on public.manual_summaries(business_id, date desc);
alter table public.manual_summaries add column if not exists overpay numeric(14,2) not null default 0 check (overpay >= 0);

-- ---------------------------------------------------------------------
-- Aturan periode buku (tutup buku) per cabang, dengan riwayat.
-- start_day = tanggal buka buku baru (1-28). Contoh: 26 => periode 26 s/d 25.
-- effective_from = berlaku sejak tanggal ini; aturan lama tetap dipakai untuk
-- periode sebelum tanggal itu, jadi laporan lama tidak bergeser bila diubah.
-- Cabang tanpa aturan = periode kalender (tanggal 1 s/d akhir bulan).
-- ---------------------------------------------------------------------
create table if not exists public.book_period_rules (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  start_day integer not null check (start_day between 1 and 28),
  effective_from date not null default date '2000-01-01',
  created_at timestamptz not null default now(),
  unique (business_id, effective_from)
);

-- ---------------------------------------------------------------------
-- Sync dua arah antar perangkat kasir
--   * pos_config: data master bersama (menu, kategori, kasir, pengaturan toko),
--     versi terakhir diubah = pos_config_updated_at (yang terbaru menang).
--   * deleted_records: catatan hapus agar perangkat lain ikut menghapus.
--   * index synced_at: perangkat menarik data yang berubah sejak tarikan terakhir.
-- ---------------------------------------------------------------------
alter table public.businesses add column if not exists pos_config jsonb;
alter table public.businesses add column if not exists pos_config_updated_at timestamptz;
alter table public.transactions add column if not exists debt_paid_shift_id text;

create table if not exists public.deleted_records (
  business_id uuid not null references public.businesses(id) on delete cascade,
  kind text not null, -- expense
  id text not null,
  deleted_at timestamptz not null default now(),
  primary key (business_id, kind, id)
);
create index if not exists deleted_records_business_deleted_idx on public.deleted_records(business_id, deleted_at);
-- Hanya diakses server (service role); tanpa policy = tertutup untuk klien biasa.
alter table public.deleted_records enable row level security;

create index if not exists transactions_business_synced_idx on public.transactions(business_id, synced_at);
create index if not exists expenses_business_synced_idx on public.expenses(business_id, synced_at);
create index if not exists shifts_business_synced_idx on public.shifts(business_id, synced_at);

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

alter table public.manual_summaries enable row level security;
drop policy if exists "owner all manual_summaries" on public.manual_summaries;
create policy "owner all manual_summaries" on public.manual_summaries for all
  using (business_id in (select id from public.businesses where owner_id = auth.uid()))
  with check (business_id in (select id from public.businesses where owner_id = auth.uid()));

alter table public.book_period_rules enable row level security;
drop policy if exists "owner all book_period_rules" on public.book_period_rules;
create policy "owner all book_period_rules" on public.book_period_rules for all
  using (business_id in (select id from public.businesses where owner_id = auth.uid()))
  with check (business_id in (select id from public.businesses where owner_id = auth.uid()));

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

-- Tanggal acuan untuk teks tanggal: 'YYYY-MM-DD' apa adanya, 'YYYY-MM' => tanggal 1
-- (data bulanan masuk ke periode buku yang memuat tanggal 1 bulan itu).
create or replace function public.anchor_date(p text)
returns date
language sql
immutable
as $$
  select case
    when p ~ '^\d{4}-\d{2}-\d{2}$' then p::date
    when p ~ '^\d{4}-\d{2}$' then (p || '-01')::date
  end
$$;

-- ---------------------------------------------------------------------
-- Periode buku yang memuat tanggal d untuk sebuah cabang.
-- Saat aturan berganti di tengah siklus, terbentuk satu periode transisi
-- (lebih pendek) yang berakhir sehari sebelum aturan baru berlaku.
-- ---------------------------------------------------------------------
create or replace function public.book_period(p_business uuid, d date)
returns table (start_date date, end_date date)
language sql
stable
security invoker
set search_path = public
as $$
  with r as (
    select
      coalesce(cur.start_day, 1) as sd,
      coalesce(cur.effective_from, date '-infinity') as ef,
      (select min(n.effective_from) from public.book_period_rules n
        where n.business_id = p_business and n.effective_from > d) as next_ef
    from (select 1) one
    left join lateral (
      select start_day, effective_from from public.book_period_rules
      where business_id = p_business and effective_from <= d
      order by effective_from desc limit 1
    ) cur on true
  ),
  s as (
    select sd, next_ef,
      greatest(
        case when d < date_trunc('month', d)::date + (sd - 1)
          then (date_trunc('month', d) - interval '1 month')::date + (sd - 1)
          else date_trunc('month', d)::date + (sd - 1)
        end,
        ef
      ) as st
    from r
  )
  select st,
    least(
      case when date_trunc('month', st)::date + (sd - 1) > st
        then date_trunc('month', st)::date + (sd - 1)
        else (date_trunc('month', st) + interval '1 month')::date + (sd - 1)
      end,
      coalesce(next_ef, date 'infinity')
    ) - 1
  from s
$$;

revoke execute on function public.book_period(uuid, date) from public, anon;
grant execute on function public.book_period(uuid, date) to authenticated;

-- ---------------------------------------------------------------------
-- Ringkasan dashboard (dihitung di database, tidak terkena batas 1000 baris API)
-- security invoker: tetap tunduk pada RLS, jadi owner hanya melihat cabangnya.
-- ---------------------------------------------------------------------
create or replace function public.dashboard_summary(p_business uuid, p_days integer default 7)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with params as (
    select
      (now() at time zone 'Asia/Jakarta')::date as today,
      (now() at time zone 'Asia/Jakarta')::date - (greatest(p_days, 1) - 1) as first_day
  ),
  tx as (
    select t.*, (t.created_at at time zone 'Asia/Jakarta')::date as day
    from public.transactions t, params
    where t.status = 'completed'
      and (p_business is null or t.business_id = p_business)
      and t.created_at >= (params.first_day::timestamp at time zone 'Asia/Jakarta')
  ),
  days as (
    select d::date as day from params, generate_series(params.first_day, params.today, interval '1 day') d
  ),
  manual_day as (
    select m.date::date as day, sum(m.sales) as sales
    from public.manual_summaries m, params
    where m.period = 'day'
      and (p_business is null or m.business_id = p_business)
      and m.date >= to_char(params.first_day, 'YYYY-MM-DD')
    group by 1
  ),
  daily as (
    select days.day,
      coalesce(sum(tx.grand_total), 0) + coalesce((select md.sales from manual_day md where md.day = days.day), 0) as sales,
      count(tx.id) as count
    from days left join tx on tx.day = days.day
    group by days.day
  ),
  top as (
    select coalesce(item->'product'->>'name', 'Lainnya') as name, sum(coalesce((item->>'quantity')::numeric, 0)) as qty
    from tx, jsonb_array_elements(tx.items) item
    group by 1
    order by 2 desc
    limit 5
  ),
  cur_period as (
    select b.id as business_id, p.start_date, p.end_date
    from public.businesses b, params, lateral public.book_period(b.id, params.today) p
    where (p_business is null or b.id = p_business)
  )
  select jsonb_build_object(
    'today', (select today from params),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'sales', sales, 'count', count) order by day), '[]'::jsonb) from daily),
    'top_products', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'qty', qty)), '[]'::jsonb) from top),
    'unpaid_debt', (
      select coalesce(sum(grand_total), 0) from public.transactions
      where payment_type = 'hutang' and debt_status = 'unpaid' and status = 'completed'
        and (p_business is null or business_id = p_business)
    ),
    'period_start', (select case when count(*) = 1 then min(start_date) end from cur_period),
    'period_end', (select case when count(*) = 1 then min(end_date) end from cur_period),
    'period_sales', (
      select coalesce(sum(t.grand_total), 0)
      from public.transactions t join cur_period c on c.business_id = t.business_id
      where t.status = 'completed'
        and (t.created_at at time zone 'Asia/Jakarta')::date between c.start_date and c.end_date
    ) + (
      select coalesce(sum(m.sales), 0)
      from public.manual_summaries m join cur_period c on c.business_id = m.business_id
      where public.anchor_date(m.date) between c.start_date and c.end_date
    ),
    'period_overpay', (
      select coalesce(sum(t.overpay_amount), 0)
      from public.transactions t join cur_period c on c.business_id = t.business_id
      where t.status = 'completed'
        and (t.created_at at time zone 'Asia/Jakarta')::date between c.start_date and c.end_date
    ) + (
      select coalesce(sum(m.overpay), 0)
      from public.manual_summaries m join cur_period c on c.business_id = m.business_id
      where public.anchor_date(m.date) between c.start_date and c.end_date
    ),
    'month_expenses', (
      select coalesce(sum(e.amount), 0)
      from public.expenses e join cur_period c on c.business_id = e.business_id
      where public.anchor_date(e.date) between c.start_date and c.end_date
    ) + (
      select coalesce(sum(m.expenses), 0)
      from public.manual_summaries m join cur_period c on c.business_id = m.business_id
      where public.anchor_date(m.date) between c.start_date and c.end_date
    )
  )
$$;

revoke execute on function public.dashboard_summary(uuid, integer) from public, anon;
grant execute on function public.dashboard_summary(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------
-- Rekap per periode buku: transaksi kasir + pengeluaran kasir + rekap manual.
-- ---------------------------------------------------------------------
drop function if exists public.monthly_recap(uuid, integer);
-- Tipe kembalian berubah (kolom kelebihan), jadi fungsi lama dihapus dulu.
drop function if exists public.book_recap(uuid, integer);

create or replace function public.book_recap(p_business uuid, p_limit integer default 36)
returns table (
  start_date date,
  end_date date,
  sales_pos numeric,
  sales_manual numeric,
  expenses_pos numeric,
  expenses_manual numeric,
  overpay_pos numeric,
  overpay_manual numeric,
  tx_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with rows_by_day as (
    select business_id, (created_at at time zone 'Asia/Jakarta')::date as d,
      sum(grand_total) as sp, 0::numeric as sm, 0::numeric as ep, 0::numeric as em,
      sum(overpay_amount) as op, 0::numeric as om, count(*) as c
    from public.transactions
    where status = 'completed' and (p_business is null or business_id = p_business)
    group by 1, 2
    union all
    select business_id, public.anchor_date(date), 0, 0, sum(amount), 0, 0, 0, 0
    from public.expenses
    where (p_business is null or business_id = p_business) and public.anchor_date(date) is not null
    group by 1, 2
    union all
    select business_id, public.anchor_date(date), 0, sum(sales), 0, sum(expenses), 0, sum(overpay), 0
    from public.manual_summaries
    where (p_business is null or business_id = p_business)
    group by 1, 2
  )
  select p.start_date, p.end_date,
    sum(r.sp), sum(r.sm), sum(r.ep), sum(r.em), sum(r.op), sum(r.om), sum(r.c)::bigint
  from rows_by_day r, lateral public.book_period(r.business_id, r.d) p
  group by 1, 2
  order by 1 desc
  limit greatest(p_limit, 1)
$$;

revoke execute on function public.book_recap(uuid, integer) from public, anon;
grant execute on function public.book_recap(uuid, integer) to authenticated;
