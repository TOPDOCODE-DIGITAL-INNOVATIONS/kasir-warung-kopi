-- Gaji pegawai (Fase 1): daftar pegawai + catatan pembayaran gaji per periode.
-- Setiap pembayaran juga membuat satu baris di public.expenses (kategori "Gaji Karyawan"),
-- sehingga rekap, overview, dan balik modal otomatis ikut menghitungnya.
-- Additive: tidak mengubah data yang sudah ada.
begin;

-- ---------------------------------------------------------------------------
-- Pegawai per cabang. Tidak harus sama dengan user kasir (cashier_id opsional).
-- ---------------------------------------------------------------------------
create table public.employees (
  id          uuid          primary key default gen_random_uuid(),
  business_id uuid          not null references public.businesses(id) on delete cascade,
  name        text          not null check (length(btrim(name)) between 1 and 100),
  job_title   text          check (job_title is null or length(job_title) <= 100),
  base_salary numeric(14,2) not null default 0 check (base_salary >= 0 and base_salary <= 999999999),
  -- Disiapkan untuk pengembangan; Fase 1 hanya memakai 'monthly'.
  pay_cycle   text          not null default 'monthly' check (pay_cycle in ('monthly', 'weekly', 'daily')),
  is_active   boolean       not null default true,
  cashier_id  text          check (cashier_id is null or length(cashier_id) <= 200),
  note        text          check (note is null or length(note) <= 500),
  created_at  timestamptz   not null default now(),
  updated_at  timestamptz   not null default now(),
  unique (business_id, id)
);

create index employees_business_idx on public.employees(business_id, is_active, name);

alter table public.employees enable row level security;

create policy "owner all employees" on public.employees
  for all to authenticated
  using (business_id in (select id from public.businesses where owner_id = (select auth.uid())))
  with check (business_id in (select id from public.businesses where owner_id = (select auth.uid())));

revoke all on public.employees from anon, authenticated;
grant select, insert, update, delete on public.employees to authenticated;
grant select, insert, update, delete on public.employees to service_role;

-- ---------------------------------------------------------------------------
-- Pembayaran gaji. Ditulis hanya lewat RPC agar selalu sepasang dengan expenses.
-- ---------------------------------------------------------------------------
create table public.salary_payments (
  id            uuid          primary key,
  business_id   uuid          not null references public.businesses(id) on delete cascade,
  employee_id   uuid          not null,
  employee_name text          not null,
  period        text          not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  amount        numeric(14,2) not null check (amount > 0 and amount <= 999999999),
  paid_date     date          not null,
  note          text          check (note is null or length(note) <= 500),
  created_by    text,
  created_at    timestamptz   not null default now(),
  request       jsonb         not null,
  unique (business_id, id),
  unique (business_id, employee_id, period),
  foreign key (business_id, employee_id) references public.employees(business_id, id)
);

create index salary_payments_period_idx on public.salary_payments(business_id, period);

alter table public.salary_payments enable row level security;

create policy "owner read salary_payments" on public.salary_payments
  for select to authenticated
  using (business_id in (select id from public.businesses where owner_id = (select auth.uid())));

revoke all on public.salary_payments from anon, authenticated;
grant select on public.salary_payments to authenticated;
grant select, insert, update, delete on public.salary_payments to service_role;

alter table public.expenses
  add column salary_payment_id uuid,
  add foreign key (business_id, salary_payment_id) references public.salary_payments(business_id, id),
  add unique (salary_payment_id);

-- ---------------------------------------------------------------------------
-- Pengeluaran gaji hanya boleh dibuat, diubah nominal/periode/kategori, atau dihapus
-- oleh RPC gaji. Catatan (note) tetap boleh diedit dari mana saja.
-- ---------------------------------------------------------------------------
create function public.guard_salary_expense() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_setting('kasirku.payroll_write', true) = 'on' then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' then
    raise exception 'Pengeluaran gaji hanya dapat dicatat dari halaman Gaji Pegawai.';
  end if;
  if tg_op = 'DELETE' then
    -- Cabang dihapus: biarkan cascade berjalan.
    if not exists (select 1 from public.businesses where id = old.business_id) then return old; end if;
    raise exception 'Pengeluaran gaji hanya dapat dibatalkan dari halaman Gaji Pegawai.';
  end if;
  if new.salary_payment_id is distinct from old.salary_payment_id
    or new.business_id <> old.business_id or new.id <> old.id
    or new.amount <> old.amount or new.scope <> old.scope or new.date <> old.date
    or new.category is distinct from old.category or new.from_drawer <> old.from_drawer then
    raise exception 'Pengeluaran gaji: hanya catatan yang dapat diubah. Ubah nominal atau periode dari halaman Gaji Pegawai.';
  end if;
  return new;
end $$;

create trigger expenses_salary_guard_insert before insert on public.expenses
  for each row when (new.salary_payment_id is not null) execute function public.guard_salary_expense();
create trigger expenses_salary_guard_change before update or delete on public.expenses
  for each row when (old.salary_payment_id is not null) execute function public.guard_salary_expense();

revoke all on function public.guard_salary_expense() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Catat pembayaran gaji. Idempoten per p_payment (aman untuk retry/double-click).
-- ---------------------------------------------------------------------------
create function public.admin_record_salary(
  p_business uuid, p_payment uuid, p_employee uuid, p_period text,
  p_amount numeric, p_paid_date date, p_note text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  owner uuid := auth.uid();
  emp public.employees;
  previous public.salary_payments;
  clean_note text := nullif(btrim(coalesce(p_note, '')), '');
  payload jsonb;
  actor text;
begin
  if owner is null or not exists (select 1 from public.businesses where id = p_business and owner_id = owner) then
    raise exception 'Cabang tidak dapat diakses.';
  end if;
  if p_payment is null or p_employee is null then raise exception 'Data pembayaran gaji tidak valid.'; end if;
  if p_period is null or p_period !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Periode gaji tidak valid.'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 999999999 or p_amount <> round(p_amount, 2) then
    raise exception 'Nominal gaji harus lebih dari 0, maksimal Rp 999.999.999, dan maksimal dua angka desimal.';
  end if;
  if p_paid_date is null then raise exception 'Tanggal bayar wajib diisi.'; end if;
  if length(coalesce(clean_note, '')) > 500 then raise exception 'Catatan maksimal 500 karakter.'; end if;

  payload := jsonb_build_object('employee', p_employee, 'period', p_period, 'amount', p_amount,
    'paid_date', p_paid_date, 'note', clean_note);
  perform pg_advisory_xact_lock(hashtextextended(p_payment::text, 0));
  select * into previous from public.salary_payments where id = p_payment;
  if found then
    if previous.business_id <> p_business or previous.request <> payload then
      raise exception 'Identitas pembayaran sudah digunakan. Buka ulang form.';
    end if;
    return jsonb_build_object('id', p_payment, 'replayed', true);
  end if;

  -- Kunci pegawai agar dua pembayaran periode yang sama tidak lolos bersamaan.
  select * into emp from public.employees where id = p_employee and business_id = p_business for update;
  if not found then raise exception 'Pegawai tidak ditemukan pada cabang aktif.'; end if;
  if not emp.is_active then raise exception '% sudah nonaktif. Aktifkan kembali sebelum mencatat gaji.', emp.name; end if;
  if exists (select 1 from public.salary_payments where business_id = p_business and employee_id = p_employee and period = p_period) then
    raise exception 'Gaji % untuk periode ini sudah dicatat. Batalkan dulu jika ingin mengubah.', emp.name;
  end if;

  actor := left(coalesce(auth.jwt()->'user_metadata'->>'name', auth.jwt()->>'email', 'Owner'), 150);
  insert into public.salary_payments(id, business_id, employee_id, employee_name, period, amount, paid_date, note, created_by, request)
    values (p_payment, p_business, p_employee, emp.name, p_period, p_amount, p_paid_date, clean_note, actor, payload);

  perform set_config('kasirku.payroll_write', 'on', true);
  insert into public.expenses(business_id, id, scope, date, category, amount, note, from_drawer, created_by, created_at, salary_payment_id)
    values (p_business, 'EXP-SALARY-' || p_payment, 'monthly', p_period, 'Gaji Karyawan', p_amount,
      left('Gaji ' || emp.name || coalesce(' · ' || clean_note, ''), 500), false, actor, clock_timestamp(), p_payment);
  perform set_config('kasirku.payroll_write', 'off', true);

  return jsonb_build_object('id', p_payment, 'replayed', false);
end $$;

-- ---------------------------------------------------------------------------
-- Batalkan pembayaran gaji: hapus pengeluarannya (dengan tombstone untuk kasir) lalu
-- hapus catatan pembayarannya. Aman dipanggil ulang.
-- ---------------------------------------------------------------------------
create function public.admin_cancel_salary(p_business uuid, p_payment uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  owner uuid := auth.uid();
  removed text;
begin
  if owner is null or not exists (select 1 from public.businesses where id = p_business and owner_id = owner) then
    raise exception 'Cabang tidak dapat diakses.';
  end if;
  if p_payment is null then raise exception 'Pembayaran gaji tidak valid.'; end if;
  perform 1 from public.salary_payments where id = p_payment and business_id = p_business for update;
  if not found then return jsonb_build_object('id', p_payment, 'cancelled', false); end if;

  perform set_config('kasirku.payroll_write', 'on', true);
  delete from public.expenses where business_id = p_business and salary_payment_id = p_payment returning id into removed;
  perform set_config('kasirku.payroll_write', 'off', true);
  if removed is not null then
    -- Agar aplikasi kasir yang sudah menarik pengeluaran ini ikut menghapusnya.
    insert into public.deleted_records(business_id, kind, id, deleted_at) values (p_business, 'expense', removed, now())
      on conflict (business_id, kind, id) do update set deleted_at = excluded.deleted_at;
  end if;
  delete from public.salary_payments where id = p_payment and business_id = p_business;
  return jsonb_build_object('id', p_payment, 'cancelled', true);
end $$;

revoke all on function public.admin_record_salary(uuid, uuid, uuid, text, numeric, date, text) from public, anon;
revoke all on function public.admin_cancel_salary(uuid, uuid) from public, anon;
grant execute on function public.admin_record_salary(uuid, uuid, uuid, text, numeric, date, text) to authenticated;
grant execute on function public.admin_cancel_salary(uuid, uuid) to authenticated;

commit;
