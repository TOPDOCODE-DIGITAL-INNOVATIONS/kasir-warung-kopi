begin;

-- NULL identifies transactions already stored before POS stock accounting.
alter table public.transactions add column pos_stock_applied jsonb;

create table inventory_private.pos_stock_edits (
  product_id uuid not null references public.products(inventory_id) on delete cascade,
  operation_id uuid not null,
  primary key (product_id, operation_id)
);

-- A POS catalog snapshot carries the device's displayed balance. An existing
-- product changes stock through a sale, purchase, count, or explicit stock edit.
create function inventory_private.keep_pos_catalog_stock() returns trigger
language plpgsql set search_path = '' as $$
begin
  if public.sync_token_business_id() = old.business_id then
    new.stock := old.stock;
    new.stock_mode := old.stock_mode;
    new.stock_updated_at := old.stock_updated_at;
  end if;
  return new;
end $$;

create trigger keep_pos_catalog_stock before update on public.products
  for each row execute function inventory_private.keep_pos_catalog_stock();

create function inventory_private.pos_sale_quantities(items jsonb) returns table (product_id text, quantity numeric)
language sql immutable set search_path = '' as $$
  select item #>> '{product,id}', sum((item->>'quantity')::numeric)
  from jsonb_array_elements(case when jsonb_typeof(items) = 'array' then items else '[]'::jsonb end) as items(item)
  where item #>> '{product,id}' is not null and item->>'quantity' ~ '^[1-9][0-9]{0,8}$'
  group by 1
$$;

create function inventory_private.keep_pos_sale_state() returns trigger
language plpgsql set search_path = '' as $$
begin
  if public.sync_token_business_id() is distinct from new.business_id then return new; end if;
  if tg_op = 'INSERT' then
    new.pos_stock_applied := null;
    return new;
  end if;

  new.pos_stock_applied := old.pos_stock_applied;
  -- A retry from an older device must not restore a cancelled or corrected receipt.
  if old.status = 'cancelled' then return old; end if;
  if old.edit_history->-1->>'at' is not null
    and coalesce(new.edit_history->-1->>'at', '') < old.edit_history->-1->>'at' then
    if new.status = 'cancelled' then
      old.status := new.status;
      old.cancel_reason := new.cancel_reason;
      old.cancelled_at := new.cancelled_at;
      old.cancelled_by := new.cancelled_by;
      old.synced_at := new.synced_at;
    end if;
    return old;
  end if;
  return new;
end $$;

create trigger keep_pos_sale_state before insert or update on public.transactions
  for each row execute function inventory_private.keep_pos_sale_state();

create function inventory_private.apply_pos_sale_stock() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  headers text := current_setting('request.headers', true);
  applied jsonb := '{}'::jsonb;
  before_items jsonb := '[]'::jsonb;
  after_items jsonb := '[]'::jsonb;
  entry record;
  taken numeric;
  difference numeric;
begin
  if public.sync_token_business_id() is distinct from new.business_id then return null; end if;
  if tg_op = 'UPDATE' then
    if old.pos_stock_applied is null then return null; end if;
    if new.items is not distinct from old.items and new.status is not distinct from old.status then return null; end if;
    applied := old.pos_stock_applied;
    if old.status = 'completed' then before_items := old.items; end if;
  end if;
  if new.status = 'completed' then after_items := new.items; end if;

  -- This is a stock movement computed from a verified branch transaction.
  perform set_config('request.headers', (headers::jsonb - 'x-sync-token')::text, true);
  for entry in
    select p.id, p.inventory_id, p.stock, p.can_sell and p.is_active as sellable, coalesce(after_sale.quantity, 0) as new_qty,
      coalesce(before_sale.quantity, 0) as old_qty
    from inventory_private.pos_sale_quantities(before_items) before_sale
    full join inventory_private.pos_sale_quantities(after_items) after_sale using (product_id)
    join public.products p on p.id = coalesce(after_sale.product_id, before_sale.product_id)
      and p.business_id = new.business_id
    where coalesce(after_sale.quantity, 0) <> coalesce(before_sale.quantity, 0)
      and p.stock >= 0
      and ((p.can_sell and p.is_active) or applied ? p.id)
    order by p.inventory_id for update of p
  loop
    taken := coalesce((applied->>entry.id)::numeric, 0);
    if entry.new_qty > entry.old_qty then
      if not entry.sellable then continue; end if;
      difference := least(entry.stock, entry.new_qty - entry.old_qty);
    else
      difference := -greatest(0, taken - entry.new_qty);
    end if;

    if difference <> 0 then
      update public.products set stock = stock - difference where inventory_id = entry.inventory_id;
      taken := taken + difference;
      applied := case when taken = 0 then applied - entry.id
        else jsonb_set(applied, array[entry.id], to_jsonb(taken)) end;
    end if;
  end loop;

  if applied is distinct from new.pos_stock_applied then
    update public.transactions set pos_stock_applied = applied
      where business_id = new.business_id and id = new.id;
  end if;
  perform set_config('request.headers', headers, true);
  return null;
end $$;

create trigger apply_pos_sale_stock after insert or update of items, status on public.transactions
  for each row execute function inventory_private.apply_pos_sale_stock();

create function public.record_pos_stock_edits(p_business uuid, p_edits jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  headers text := current_setting('request.headers', true);
  entry record;
  balance numeric;
  operation uuid;
  amount numeric;
begin
  if public.sync_token_business_id() is distinct from p_business or p_business is null then
    raise exception 'Cabang tidak dapat diakses.';
  end if;
  if jsonb_typeof(p_edits) is distinct from 'array' or jsonb_array_length(p_edits) > 500 then
    raise exception 'Data penyesuaian stok tidak valid.';
  end if;

  perform set_config('request.headers', (headers::jsonb - 'x-sync-token')::text, true);
  for entry in
    select edit, p.inventory_id from jsonb_array_elements(p_edits) with ordinality as edits(edit, position)
    join public.products p on p.id = edit->>'productId' and p.business_id = p_business
    where p.pos_sync_enabled and p.can_sell and p.is_active
    order by p.inventory_id, position for update of p
  loop
    operation := (entry.edit->>'operationId')::uuid;
    amount := (entry.edit->>'amount')::numeric;
    if operation is null or amount is null or abs(amount) > 999999999 or
      (entry.edit->>'kind' = 'set' and amount < -1) or
      coalesce(entry.edit->>'kind', '') not in ('adjust', 'set') then
      raise exception 'Data penyesuaian stok tidak valid.';
    end if;
    insert into inventory_private.pos_stock_edits(product_id, operation_id)
      values (entry.inventory_id, operation) on conflict do nothing;
    if not found then continue; end if;

    select stock into balance from public.products where inventory_id = entry.inventory_id;
    if entry.edit->>'kind' = 'adjust' and balance < 0 then continue; end if;
    balance := case when entry.edit->>'kind' = 'set' then amount else greatest(0, balance + amount) end;
    update public.products set stock = balance,
      stock_mode = case when balance < 0 then 'none' else 'self' end
      where inventory_id = entry.inventory_id;
  end loop;
  perform set_config('request.headers', headers, true);
end $$;

revoke all on function public.record_pos_stock_edits(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.record_pos_stock_edits(uuid,jsonb) to service_role;
revoke all on function inventory_private.keep_pos_catalog_stock(), inventory_private.pos_sale_quantities(jsonb),
  inventory_private.keep_pos_sale_state(), inventory_private.apply_pos_sale_stock() from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
