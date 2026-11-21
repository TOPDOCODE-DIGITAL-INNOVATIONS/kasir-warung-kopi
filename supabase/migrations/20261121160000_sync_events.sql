-- Monitoring sinkronisasi kasir: satu baris per permintaan /api/sync (push & pull).
-- Additive: tidak mengubah tabel atau data yang sudah ada.
-- Baris lebih dari 30 hari dibersihkan oleh record_sync_event (tanpa pg_cron).
begin;

create table public.sync_events (
  id                bigint       generated always as identity primary key,
  business_id       uuid         references public.businesses(id) on delete cascade,
  created_at        timestamptz  not null default now(),
  direction         text         not null check (direction in ('push', 'pull')),
  http_status       integer      not null check (http_status between 100 and 599),
  ok                boolean      generated always as (http_status < 400) stored,
  error             text         check (error is null or length(error) <= 500),
  device_code       text         check (device_code is null or length(device_code) <= 100),
  duration_ms       integer      check (duration_ms is null or duration_ms >= 0),
  tx_count          integer      not null default 0 check (tx_count >= 0),
  expense_count     integer      not null default 0 check (expense_count >= 0),
  -- Antrean di perangkat saat push dimulai (dilaporkan kasir).
  pending_tx        integer      check (pending_tx is null or pending_tx >= 0),
  pending_expenses  integer      check (pending_expenses is null or pending_expenses >= 0),
  oldest_pending_at timestamptz,
  -- Error terakhir di perangkat sebelum push ini (mis. offline / timeout yang tidak sampai ke server).
  client_error      text         check (client_error is null or length(client_error) <= 500)
);

create index sync_events_business_created_idx on public.sync_events(business_id, created_at desc);
create index sync_events_failed_idx on public.sync_events(created_at desc) where http_status >= 400;

alter table public.sync_events enable row level security;

create policy "owner read sync_events" on public.sync_events
  for select to authenticated
  using (business_id in (select id from public.businesses where owner_id = (select auth.uid())));

revoke all on public.sync_events from anon, authenticated;
grant select on public.sync_events to authenticated;
grant select, insert, delete on public.sync_events to service_role;

-- Penulisan hanya lewat fungsi ini. Service role boleh mencatat token tidak valid (business null);
-- client anon dengan header x-sync-token hanya boleh mencatat cabangnya sendiri.
create or replace function public.record_sync_event(
  p_business uuid,
  p_direction text,
  p_http_status integer,
  p_error text default null,
  p_device_code text default null,
  p_duration_ms integer default null,
  p_tx_count integer default 0,
  p_expense_count integer default 0,
  p_pending_tx integer default null,
  p_pending_expenses integer default null,
  p_oldest_pending_at timestamptz default null,
  p_client_error text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if p_business is null or p_business is distinct from public.sync_token_business_id() then
      raise exception 'sync event tidak diizinkan' using errcode = '42501';
    end if;
  end if;

  insert into public.sync_events(
    business_id, direction, http_status, error, device_code, duration_ms,
    tx_count, expense_count, pending_tx, pending_expenses, oldest_pending_at, client_error
  ) values (
    p_business, p_direction, p_http_status, left(p_error, 500), left(p_device_code, 100),
    greatest(p_duration_ms, 0), greatest(coalesce(p_tx_count, 0), 0), greatest(coalesce(p_expense_count, 0), 0),
    greatest(p_pending_tx, 0), greatest(p_pending_expenses, 0), p_oldest_pending_at, left(p_client_error, 500)
  );

  -- Retensi 30 hari, dibersihkan sesekali agar tidak menambah beban tiap request.
  if random() < 0.01 then
    delete from public.sync_events where created_at < now() - interval '30 days';
  end if;
end $$;

revoke all on function public.record_sync_event(uuid, text, integer, text, text, integer, integer, integer, integer, integer, timestamptz, text) from public;
grant execute on function public.record_sync_event(uuid, text, integer, text, text, integer, integer, integer, integer, integer, timestamptz, text) to anon, service_role;

commit;
