-- Additive inventory foundation. Keep products, transactions.items and pos_config intact.
-- The old POS remains the writer for explicitly linked legacy products until cutover.
create schema if not exists inventory_private;
revoke all on schema inventory_private from public, anon, authenticated;

alter table public.businesses add constraint businesses_id_owner_key unique (id, owner_id);

create table public.units (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (btrim(code) <> ''),
  name text not null check (btrim(name) <> ''),
  dimension text not null check (dimension in ('count', 'mass', 'volume', 'package')),
  reference_factor numeric(18,6) not null default 1 check (reference_factor > 0),
  allows_fraction boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.units (id, code, name, dimension, reference_factor, allows_fraction) values
  ('00000000-0000-0000-0000-000000000001', 'pcs', 'Buah / porsi', 'count', 1, false),
  ('00000000-0000-0000-0000-000000000002', 'g', 'Gram', 'mass', 1, true),
  ('00000000-0000-0000-0000-000000000003', 'kg', 'Kilogram', 'mass', 1000, true),
  ('00000000-0000-0000-0000-000000000004', 'ml', 'Mililiter', 'volume', 1, true),
  ('00000000-0000-0000-0000-000000000005', 'l', 'Liter', 'volume', 1000, true),
  ('00000000-0000-0000-0000-000000000006', 'pack', 'Kemasan', 'package', 1, false),
  ('00000000-0000-0000-0000-000000000007', 'box', 'Karton / dus', 'package', 1, false),
  ('00000000-0000-0000-0000-000000000008', 'bottle', 'Botol', 'package', 1, false);

create table public.product (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  sku text check (sku is null or btrim(sku) <> ''),
  name text not null check (btrim(name) <> ''),
  description text,
  base_unit_id uuid not null references public.units(id),
  can_buy boolean not null default false,
  can_sell boolean not null default true,
  is_active boolean not null default true,
  pos_attributes jsonb not null default '{}'::jsonb check (jsonb_typeof(pos_attributes) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  unique (owner_id, sku)
);
create index product_owner_name_idx on public.product (owner_id, name);
create index product_base_unit_idx on public.product (base_unit_id);

create table public.item_units (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  product_id uuid not null,
  unit_id uuid not null references public.units(id),
  label text not null check (btrim(label) <> ''),
  factor_to_base numeric(18,6) not null check (factor_to_base > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (product_id, owner_id) references public.product(id, owner_id),
  unique (id, product_id, owner_id),
  unique (product_id, label)
);
create index item_units_owner_idx on public.item_units (owner_id);
create index item_units_unit_idx on public.item_units (unit_id);

create table public.branch_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  business_id uuid not null,
  product_id uuid not null,
  legacy_pos_product_id text,
  legacy_sync_enabled boolean not null default false,
  sell_price numeric(18,6) check (sell_price >= 0),
  manual_unit_cost numeric(18,6) check (manual_unit_cost >= 0),
  cost_source text not null default 'manual' check (cost_source in ('manual', 'recipe', 'inventory')),
  stock_mode text not null default 'none' check (stock_mode in ('none', 'self', 'recipe')),
  legacy_stock_quantity numeric(18,6) check (legacy_stock_quantity >= 0),
  min_stock numeric(18,6) not null default 0 check (min_stock >= 0),
  is_available boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (business_id, owner_id) references public.businesses(id, owner_id),
  foreign key (product_id, owner_id) references public.product(id, owner_id),
  unique (business_id, product_id),
  unique (business_id, product_id, owner_id),
  unique (business_id, legacy_pos_product_id),
  unique (id, business_id, owner_id),
  check (not legacy_sync_enabled or legacy_pos_product_id is not null)
);
create index branch_items_owner_idx on public.branch_items (owner_id);
create index branch_items_product_idx on public.branch_items (product_id, owner_id);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  code text check (code is null or btrim(code) <> ''),
  name text not null check (btrim(name) <> ''),
  contact_name text,
  email text,
  phone text,
  address text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  unique (owner_id, code)
);
create index suppliers_owner_name_idx on public.suppliers (owner_id, name);

create table public.product_suppliers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  product_id uuid not null,
  supplier_id uuid not null,
  item_unit_id uuid not null,
  supplier_sku text,
  reference_price numeric(18,6) check (reference_price >= 0),
  currency_code text not null default 'IDR' check (currency_code ~ '^[A-Z]{3}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (product_id, owner_id) references public.product(id, owner_id),
  foreign key (supplier_id, owner_id) references public.suppliers(id, owner_id),
  foreign key (item_unit_id, product_id, owner_id) references public.item_units(id, product_id, owner_id),
  unique (product_id, supplier_id, item_unit_id)
);
create index product_suppliers_owner_idx on public.product_suppliers (owner_id);
create index product_suppliers_supplier_idx on public.product_suppliers (supplier_id, owner_id);
create index product_suppliers_unit_idx on public.product_suppliers (item_unit_id, product_id, owner_id);

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  business_id uuid not null,
  branch_item_id uuid not null,
  version integer not null check (version > 0),
  name text,
  output_quantity numeric(18,6) not null default 1 check (output_quantity > 0),
  labor_cost numeric(18,6) not null default 0 check (labor_cost >= 0),
  overhead_cost numeric(18,6) not null default 0 check (overhead_cost >= 0),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  effective_from timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (branch_item_id, business_id, owner_id) references public.branch_items(id, business_id, owner_id),
  unique (branch_item_id, version),
  unique (id, business_id, owner_id)
);
create unique index recipes_one_active_idx on public.recipes (branch_item_id) where status = 'active';
create index recipes_owner_business_idx on public.recipes (owner_id, business_id);

create table public.recipe_lines (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  business_id uuid not null,
  recipe_id uuid not null,
  component_product_id uuid not null,
  item_unit_id uuid not null,
  quantity numeric(18,6) not null check (quantity > 0),
  factor_snapshot numeric(18,6) not null check (factor_snapshot > 0),
  quantity_base numeric(24,6) generated always as (quantity * factor_snapshot) stored,
  product_name text not null,
  unit_code text not null,
  sort_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (recipe_id, business_id, owner_id) references public.recipes(id, business_id, owner_id) on delete cascade,
  foreign key (business_id, component_product_id, owner_id) references public.branch_items(business_id, product_id, owner_id),
  foreign key (item_unit_id, component_product_id, owner_id) references public.item_units(id, product_id, owner_id)
);
create index recipe_lines_recipe_idx on public.recipe_lines (recipe_id, business_id, owner_id);
create index recipe_lines_component_idx on public.recipe_lines (business_id, component_product_id, owner_id);
create index recipe_lines_unit_idx on public.recipe_lines (item_unit_id, component_product_id, owner_id);
create index recipe_lines_owner_idx on public.recipe_lines (owner_id);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  business_id uuid not null,
  supplier_id uuid,
  document_number text not null check (btrim(document_number) <> ''),
  supplier_invoice_number text,
  purchased_at timestamptz not null default now(),
  status text not null default 'draft' check (status in ('draft', 'posted', 'cancelled')),
  currency_code text not null default 'IDR' check (currency_code ~ '^[A-Z]{3}$'),
  supplier_name text,
  subtotal numeric(24,6) not null default 0 check (subtotal >= 0),
  discount_amount numeric(24,6) not null default 0 check (discount_amount >= 0),
  tax_amount numeric(24,6) not null default 0 check (tax_amount >= 0),
  additional_cost numeric(24,6) not null default 0 check (additional_cost >= 0),
  grand_total numeric(24,6) generated always as (subtotal - discount_amount + tax_amount + additional_cost) stored,
  posted_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (business_id, owner_id) references public.businesses(id, owner_id),
  foreign key (supplier_id, owner_id) references public.suppliers(id, owner_id),
  unique (business_id, document_number),
  unique (id, business_id, owner_id),
  check (grand_total >= 0),
  check (status <> 'posted' or posted_at is not null),
  check (status <> 'cancelled' or (cancelled_at is not null and nullif(btrim(cancel_reason), '') is not null))
);
create index purchases_owner_business_date_idx on public.purchases (owner_id, business_id, purchased_at desc);
create index purchases_supplier_idx on public.purchases (supplier_id, owner_id);

create table public.purchase_lines (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  business_id uuid not null,
  purchase_id uuid not null,
  product_id uuid not null,
  item_unit_id uuid not null,
  quantity numeric(18,6) not null check (quantity > 0),
  factor_snapshot numeric(18,6) not null check (factor_snapshot > 0),
  quantity_base numeric(24,6) generated always as (quantity * factor_snapshot) stored,
  unit_price numeric(18,6) not null check (unit_price >= 0),
  discount_amount numeric(24,6) not null default 0 check (discount_amount >= 0 and discount_amount <= quantity * unit_price),
  tax_amount numeric(24,6) not null default 0 check (tax_amount >= 0),
  line_total numeric(24,6) generated always as (quantity * unit_price - discount_amount + tax_amount) stored,
  product_name text not null,
  unit_code text not null,
  sort_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (purchase_id, business_id, owner_id) references public.purchases(id, business_id, owner_id) on delete cascade,
  foreign key (business_id, product_id, owner_id) references public.branch_items(business_id, product_id, owner_id),
  foreign key (item_unit_id, product_id, owner_id) references public.item_units(id, product_id, owner_id)
);
create index purchase_lines_purchase_idx on public.purchase_lines (purchase_id, business_id, owner_id);
create index purchase_lines_product_idx on public.purchase_lines (business_id, product_id, owner_id);
create index purchase_lines_unit_idx on public.purchase_lines (item_unit_id, product_id, owner_id);
create index purchase_lines_owner_idx on public.purchase_lines (owner_id);

-- The catalog's unit is an identity, not an editable label. Repackage via item_units.
create function inventory_private.guard_master() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.owner_id <> old.owner_id then
      raise exception 'Inventory identity and owner cannot be changed' using errcode = '23514';
    end if;
    if tg_table_name = 'product' then
      if new.base_unit_id <> old.base_unit_id then
        raise exception 'Base unit is immutable; create a conversion or a new product' using errcode = '23514';
      end if;
    elsif tg_table_name = 'branch_items' then
      if new.business_id <> old.business_id or new.product_id <> old.product_id then
        raise exception 'Branch item identity is immutable' using errcode = '23514';
      end if;
    end if;
    new.updated_at := clock_timestamp();
  end if;
  return new;
end $$;

create function inventory_private.guard_item_unit() returns trigger
language plpgsql set search_path = '' as $$
declare base public.units; chosen public.units;
begin
  if tg_op = 'UPDATE' and (new.product_id <> old.product_id or new.unit_id <> old.unit_id) then
    raise exception 'Create a new item unit instead of changing its identity' using errcode = '23514';
  end if;
  select u.* into strict base from public.product p join public.units u on u.id = p.base_unit_id
    where p.id = new.product_id and p.owner_id = new.owner_id;
  select * into strict chosen from public.units where id = new.unit_id;
  if chosen.id = base.id then
    if new.factor_to_base <> 1 then raise exception 'Base unit factor must be 1' using errcode = '23514'; end if;
  elsif chosen.dimension <> 'package' then
    if base.dimension <> chosen.dimension or
       new.factor_to_base <> round(chosen.reference_factor / base.reference_factor, 6) then
      raise exception 'Unit dimension or conversion factor is invalid' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger item_units_validate before insert or update on public.item_units
  for each row execute function inventory_private.guard_item_unit();

-- Lock the parent before editing lines: publishing and line edits serialize.
create function inventory_private.guard_document_line() returns trigger
language plpgsql set search_path = '' as $$
declare r record; unit_row record; target uuid; tenant uuid; branch uuid; item uuid;
begin
  if tg_op = 'DELETE' then target := old.id; tenant := old.owner_id; branch := old.business_id;
  else target := new.id; tenant := new.owner_id; branch := new.business_id; end if;
  if tg_op = 'UPDATE' then
    if new.business_id <> old.business_id then
      raise exception 'Moving a document line is not allowed' using errcode = '23514';
    end if;
    if tg_table_name = 'recipe_lines' then
      if new.recipe_id <> old.recipe_id then raise exception 'Moving a recipe line is not allowed' using errcode = '23514'; end if;
    else
      if new.purchase_id <> old.purchase_id then raise exception 'Moving a purchase line is not allowed' using errcode = '23514'; end if;
    end if;
  end if;
  if tg_table_name = 'recipe_lines' then
    select h.status, b.product_id into r from public.recipes h
      join public.branch_items b on b.id = h.branch_item_id
      where h.id = case when tg_op = 'DELETE' then old.recipe_id else new.recipe_id end
        and h.owner_id = tenant and h.business_id = branch for update of h;
    if tg_op <> 'DELETE' then item := new.component_product_id; end if;
  else
    select h.status into r from public.purchases h
      where h.id = case when tg_op = 'DELETE' then old.purchase_id else new.purchase_id end
        and h.owner_id = tenant and h.business_id = branch for update;
    if tg_op <> 'DELETE' then item := new.product_id; end if;
  end if;
  if not found then
    -- A draft parent's ON DELETE CASCADE reaches here after removing the parent.
    if tg_op = 'DELETE' then return old; end if;
    raise exception 'Document not found or not accessible' using errcode = '23503';
  end if;
  if r.status <> 'draft' then raise exception 'Published document lines are immutable' using errcode = '23514'; end if;
  if tg_op = 'DELETE' then return old; end if;
  if tg_table_name = 'recipe_lines' then
    if r.product_id = item then raise exception 'A recipe cannot contain itself' using errcode = '23514'; end if;
  elsif not exists (select 1 from public.product where id = item and owner_id = tenant and can_buy and is_active) then
    raise exception 'Purchase lines require an active buyable product' using errcode = '23514';
  end if;
  select iu.factor_to_base, u.code, p.name into strict unit_row
    from public.item_units iu join public.units u on u.id = iu.unit_id
    join public.product p on p.id = iu.product_id and p.owner_id = iu.owner_id
    where iu.id = new.item_unit_id and iu.product_id = item and iu.owner_id = tenant and iu.is_active;
  new.factor_snapshot := unit_row.factor_to_base;
  new.unit_code := unit_row.code;
  new.product_name := unit_row.name;
  return new;
end $$;

create function inventory_private.guard_recipe() returns trigger
language plpgsql set search_path = '' as $$
declare output_product uuid; has_cycle boolean;
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then raise exception 'Archive published recipes instead of deleting' using errcode = '23514'; end if;
    return old;
  end if;
  if tg_op = 'INSERT' and new.status <> 'draft' then
    raise exception 'Create a draft recipe before publishing' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    if new.branch_item_id <> old.branch_item_id or new.business_id <> old.business_id then
      raise exception 'Recipe output and branch are immutable' using errcode = '23514';
    end if;
    if old.status <> 'draft' then
      if old.status = 'active' and new.status = 'archived' and
         (to_jsonb(new) - array['status','updated_at']) = (to_jsonb(old) - array['status','updated_at']) then return new; end if;
      raise exception 'Published recipes are immutable; create a new version' using errcode = '23514';
    end if;
  end if;
  if new.status = 'active' then
    -- Serialize recipe graph changes for this owner, including different outputs.
    perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text, 0));
    if not exists (select 1 from public.recipe_lines where recipe_id = new.id) then
      raise exception 'Cannot publish an empty recipe' using errcode = '23514';
    end if;
    select product_id into strict output_product from public.branch_items where id = new.branch_item_id;
    with recursive edges as (
      select b.product_id as parent, l.component_product_id as child
      from public.recipes h join public.branch_items b on b.id = h.branch_item_id
      join public.recipe_lines l on l.recipe_id = h.id
      where h.business_id = new.business_id and h.owner_id = new.owner_id and h.status = 'active' and h.id <> new.id
      union
      select output_product, component_product_id from public.recipe_lines where recipe_id = new.id
    ), walk(node) as (
      select child from edges where parent = output_product
      union
      select e.child from walk w join edges e on e.parent = w.node
    ) select exists (select 1 from walk where node = output_product) into has_cycle;
    if has_cycle then raise exception 'Recipe cycle detected' using errcode = '23514'; end if;
    new.effective_from := coalesce(new.effective_from, now());
  end if;
  return new;
end $$;

create function inventory_private.guard_purchase() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then raise exception 'Cancel posted purchases instead of deleting' using errcode = '23514'; end if;
    return old;
  end if;
  if tg_op = 'INSERT' and new.status <> 'draft' then
    raise exception 'Create a draft purchase before posting' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    if new.business_id <> old.business_id then raise exception 'Purchase branch is immutable' using errcode = '23514'; end if;
    if old.status <> 'draft' then
      if old.status = 'posted' and new.status = 'cancelled' and nullif(btrim(new.cancel_reason), '') is not null and
         (to_jsonb(new) - array['status','updated_at','cancelled_at','cancel_reason','grand_total']) =
         (to_jsonb(old) - array['status','updated_at','cancelled_at','cancel_reason','grand_total']) then
        new.cancelled_at := now(); return new;
      end if;
      raise exception 'Posted purchases are immutable' using errcode = '23514';
    end if;
  end if;
  if new.status = 'posted' then
    if not exists (select 1 from public.purchase_lines where purchase_id = new.id) then
      raise exception 'Cannot post an empty purchase' using errcode = '23514';
    end if;
    select sum(quantity * unit_price - discount_amount), sum(tax_amount) into new.subtotal, new.tax_amount
      from public.purchase_lines where purchase_id = new.id;
    if new.discount_amount > new.subtotal then raise exception 'Purchase discount exceeds subtotal' using errcode = '23514'; end if;
    select name into new.supplier_name from public.suppliers where id = new.supplier_id and owner_id = new.owner_id;
    new.posted_at := now();
  elsif new.status = 'cancelled' then new.cancelled_at := now();
  end if;
  return new;
end $$;

create trigger recipes_validate before insert or update or delete on public.recipes
  for each row execute function inventory_private.guard_recipe();
create trigger purchases_validate before insert or update or delete on public.purchases
  for each row execute function inventory_private.guard_purchase();
create trigger recipe_lines_validate before insert or update or delete on public.recipe_lines
  for each row execute function inventory_private.guard_document_line();
create trigger purchase_lines_validate before insert or update or delete on public.purchase_lines
  for each row execute function inventory_private.guard_document_line();

do $$ declare t text;
begin
  foreach t in array array['product','branch_items','item_units','suppliers','product_suppliers','recipes','recipe_lines','purchases','purchase_lines'] loop
    execute format('create trigger inventory_identity before update on public.%I for each row execute function inventory_private.guard_master()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('create policy inventory_owner on public.%I for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', t);
    -- PostgreSQL numeric accepts NaN even with a typmod and a >= 0 check.
    -- Reject it for every quantity, conversion, price and monetary amount.
    declare c record;
    begin
      for c in select column_name from information_schema.columns
        where table_schema = 'public' and table_name = t and data_type = 'numeric' loop
        execute format('alter table public.%I add check (%I <> ''NaN''::numeric)', t, c.column_name);
      end loop;
    end;
  end loop;
end $$;
alter table public.units enable row level security;
alter table public.units add check (reference_factor <> 'NaN'::numeric);
revoke all on public.units from public, anon, authenticated;
grant select on public.units to authenticated;
grant all on public.units to service_role;
create policy inventory_units_read on public.units for select to authenticated using (true);

-- Bulk bridge. No per-product network queries, no writes to old POS data, no delete propagation.
-- A mapping can opt out before the new inventory UI takes ownership of it.
create function inventory_private.sync_legacy_products(payload jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if payload is null then return; end if;
  with incoming as (
    select p.*, b.owner_id, md5('inventory-product:' || p.business_id::text || ':' || p.id)::uuid as master_id
    from jsonb_populate_recordset(null::public.products, payload) p
    join public.businesses b on b.id = p.business_id
    where not exists (select 1 from public.branch_items bi where bi.business_id = p.business_id
      and bi.legacy_pos_product_id = p.id and not bi.legacy_sync_enabled)
  )
  insert into public.product (id, owner_id, name, description, base_unit_id, can_buy, can_sell, pos_attributes)
    select master_id, owner_id, coalesce(nullif(btrim(name), ''), '(tanpa nama)'), raw->>'description',
      '00000000-0000-0000-0000-000000000001'::uuid, false, true,
      coalesce(raw, '{}'::jsonb) - array['imageUrl','pin','pinHash','pinSalt'] from incoming
  on conflict (id) do update set name = excluded.name, description = excluded.description,
    pos_attributes = excluded.pos_attributes where product.owner_id = excluded.owner_id;

  with incoming as (
    select p.*, b.owner_id, md5('inventory-product:' || p.business_id::text || ':' || p.id)::uuid as master_id
    from jsonb_populate_recordset(null::public.products, payload) p join public.businesses b on b.id = p.business_id
  )
  insert into public.branch_items (owner_id, business_id, product_id, legacy_pos_product_id, legacy_sync_enabled,
    sell_price, manual_unit_cost, stock_mode, legacy_stock_quantity, is_available)
    select owner_id, business_id, master_id, id, true, price, cost_price,
      case when stock < 0 then 'none' else 'self' end, case when stock < 0 then null else stock end, is_available
    from incoming
  on conflict (business_id, legacy_pos_product_id) do update set sell_price = excluded.sell_price,
    manual_unit_cost = excluded.manual_unit_cost, stock_mode = excluded.stock_mode,
    legacy_stock_quantity = excluded.legacy_stock_quantity, is_available = excluded.is_available
    where branch_items.legacy_sync_enabled;

  insert into public.item_units (owner_id, product_id, unit_id, label, factor_to_base)
    select p.owner_id, p.id, p.base_unit_id, u.code, 1 from public.product p
    join public.units u on u.id = p.base_unit_id
    where p.id in (select md5('inventory-product:' || (r->>'business_id') || ':' || (r->>'id'))::uuid
      from jsonb_array_elements(payload) r)
  on conflict (product_id, label) do nothing;
end $$;

-- Include config-only products without modifying the old mirror. Mirror rows take precedence.
select inventory_private.sync_legacy_products(coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb))
  from public.products p;
select inventory_private.sync_legacy_products(coalesce(jsonb_agg(s.row_data), '[]'::jsonb)) from (
  select distinct on (b.id, j->>'id') jsonb_build_object(
    'business_id', b.id, 'id', j->>'id', 'name', j->>'name', 'category_id', j->>'categoryId',
    'price', coalesce((j->>'price')::numeric, 0), 'cost_price', (j->>'costPrice')::numeric,
    'stock', coalesce((j->>'stock')::integer, -1), 'is_available', coalesce((j->>'isAvailable')::boolean, true), 'raw', j
  ) as row_data from public.businesses b
  cross join lateral jsonb_array_elements(case when jsonb_typeof(b.pos_config->'products') = 'array'
    then b.pos_config->'products' else '[]'::jsonb end) j
  where nullif(j->>'id', '') is not null
    and not exists (select 1 from public.products p where p.business_id = b.id and p.id = j->>'id')
  order by b.id, j->>'id'
) s;

create function inventory_private.bridge_legacy_products() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform inventory_private.sync_legacy_products((select jsonb_agg(to_jsonb(r)) from inventory_legacy_rows r));
  return null;
end $$;
create trigger inventory_legacy_products_insert after insert on public.products
  referencing new table as inventory_legacy_rows for each statement execute function inventory_private.bridge_legacy_products();
create trigger inventory_legacy_products_update after update on public.products
  referencing new table as inventory_legacy_rows for each statement execute function inventory_private.bridge_legacy_products();

revoke all on all functions in schema inventory_private from public, anon, authenticated;
comment on table public.product is 'Owner inventory master; separate from the legacy POS products mirror.';
comment on column public.branch_items.legacy_stock_quantity is 'Legacy POS quantity snapshot, not an inventory ledger balance. NULL represents unlimited/unknown legacy stock.';
comment on column public.branch_items.legacy_sync_enabled is 'Disable explicitly when switching this mapping to inventory-managed master data; POS export adapter required for two-way edits.';
comment on table public.purchases is 'Purchase documents only. Posting freezes snapshots/totals; stock valuation and payments require later modules.';
notify pgrst, 'reload schema';
