-- Correct the foundation: extend the existing products table instead of keeping
-- a second product master. POS IDs, business IDs and transaction snapshots remain.
begin;
lock table public.products, public.product, public.branch_product in share row exclusive mode;
drop trigger inventory_legacy_products_insert on public.products;
drop trigger inventory_legacy_products_update on public.products;
drop function inventory_private.bridge_legacy_products();
drop function inventory_private.sync_legacy_products(jsonb);

alter table public.products
  add column inventory_id uuid not null default gen_random_uuid(),
  add column owner_id uuid references auth.users(id),
  add column sku text check (sku is null or btrim(sku) <> ''),
  add column description text,
  add column base_unit_id uuid not null default '00000000-0000-0000-0000-000000000001' references public.units(id),
  add column can_buy boolean not null default false,
  add column can_sell boolean not null default true,
  add column is_active boolean not null default true,
  add column pos_managed boolean not null default false,
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now();

-- Materialize any previously backfilled config-only rows in the actual products
-- table, keeping the same POS ID. Nothing is replaced or recreated.
insert into public.products (business_id,id,name,category_id,price,cost_price,stock,is_available,raw)
select b.business_id,b.legacy_pos_product_id,m.name,m.pos_attributes->>'categoryId',
  coalesce(b.sell_price,0),b.manual_unit_cost,coalesce(b.legacy_stock_quantity,-1),b.is_available,m.pos_attributes
from public.branch_product b join public.product m on m.id=b.product_id
where b.legacy_pos_product_id is not null
on conflict (business_id,id) do nothing;

-- Abort rather than discard an inventory-only master lacking an origin row, or
-- silently merge identities which somebody has already manually consolidated.
do $$ begin
  if exists (select 1 from public.product m where not exists (
    select 1 from public.branch_product b join public.products p
      on p.business_id=b.business_id and p.id=b.legacy_pos_product_id where b.product_id=m.id
  )) then raise exception 'Link every existing inventory product to its origin product before consolidation'; end if;
  if exists (select b.product_id from public.branch_product b join public.products p
    on p.business_id=b.business_id and p.id=b.legacy_pos_product_id
    group by b.product_id having count(*)>1) then
    raise exception 'Existing shared mappings need an explicit origin before consolidation';
  end if;
end $$;

update public.products p set inventory_id=m.id,owner_id=m.owner_id,sku=m.sku,
  description=m.description,base_unit_id=m.base_unit_id,can_buy=m.can_buy,can_sell=m.can_sell,
  is_active=m.is_active,pos_managed=b.legacy_sync_enabled,created_at=m.created_at,updated_at=m.updated_at
from public.branch_product b join public.product m on m.id=b.product_id
where p.business_id=b.business_id and p.id=b.legacy_pos_product_id;
update public.products p set owner_id=b.owner_id,pos_managed=true
from public.businesses b where b.id=p.business_id and p.owner_id is null;

-- Preserve extra master metadata without overwriting existing POS payload values.
-- Conflicting edits are intentionally reported instead of silently discarded.
do $$ begin
  if exists (select 1 from public.products p join public.product m on m.id=p.inventory_id
    where p.name is distinct from m.name or
      exists(select 1 from jsonb_each(m.pos_attributes) a
        where p.raw ? a.key and p.raw->a.key is distinct from a.value)) then
    raise exception 'Conflicting product metadata must be reconciled before consolidation';
  end if;
end $$;
update public.products p set raw=coalesce(p.raw,'{}'::jsonb)||m.pos_attributes
from public.product m where m.id=p.inventory_id
  and not (coalesce(p.raw,'{}'::jsonb) @> m.pos_attributes);

alter table public.products
  alter column owner_id set not null,
  alter column price type numeric(18,6),
  alter column cost_price type numeric(18,6),
  alter column stock type numeric(18,6),
  add constraint products_inventory_id_key unique(inventory_id),
  add constraint products_inventory_owner_key unique(inventory_id,owner_id),
  add constraint products_owner_sku_key unique(owner_id,sku),
  add check (price>=0 and price<>'NaN'::numeric),
  add check (cost_price>=0 and cost_price<>'NaN'::numeric),
  add check (stock>=-1 and stock<>'NaN'::numeric);
create index products_owner_name_idx on public.products(owner_id,name);
create index products_base_unit_idx on public.products(base_unit_id);

-- The UUIDs already referenced by inventory documents now belong to products.
do $$ declare c record;
begin
  for c in select conrelid::regclass as relation,conname from pg_constraint
    where confrelid='public.product'::regclass and contype='f' loop
    execute format('alter table %s drop constraint %I',c.relation,c.conname);
  end loop;
end $$;
alter table public.item_units add foreign key(product_id,owner_id) references public.products(inventory_id,owner_id);
alter table public.branch_product add foreign key(product_id,owner_id) references public.products(inventory_id,owner_id);
alter table public.product_suppliers add foreign key(product_id,owner_id) references public.products(inventory_id,owner_id);

create function inventory_private.guard_product() returns trigger
language plpgsql security definer set search_path='' as $$
declare actual_owner uuid;
begin
  if tg_op='INSERT' then
    select owner_id into strict actual_owner from public.businesses where id=new.business_id;
    if new.owner_id is not null and new.owner_id<>actual_owner then
      raise exception 'Product owner must match its origin branch' using errcode='23514';
    end if;
    new.owner_id:=actual_owner;
    if public.sync_token_business_id()=new.business_id then new.pos_managed:=true; end if;
  else
    if new.business_id<>old.business_id or new.id<>old.id or new.inventory_id<>old.inventory_id or new.owner_id<>old.owner_id then
      raise exception 'Product identity and owner are immutable' using errcode='23514';
    end if;
    if new.base_unit_id<>old.base_unit_id then
      raise exception 'Base unit is immutable; create a conversion or a new product' using errcode='23514';
    end if;
    new.updated_at:=clock_timestamp();
  end if;
  return new;
end $$;
create trigger inventory_product_identity before insert or update on public.products
  for each row execute function inventory_private.guard_product();

-- Retarget the two validation functions; their callers and document UUIDs stay.
do $$ declare definition text;
begin
  select pg_get_functiondef('inventory_private.guard_item_unit()'::regprocedure) into definition;
  definition:=replace(definition,'public.product p','public.products p');
  definition:=replace(definition,'p.id = new.product_id','p.inventory_id = new.product_id');
  execute definition;
  select pg_get_functiondef('inventory_private.guard_document_line()'::regprocedure) into definition;
  definition:=replace(definition,'public.product p','public.products p');
  definition:=replace(definition,'p.id = iu.product_id','p.inventory_id = iu.product_id');
  definition:=replace(definition,'public.product where id = item','public.products where inventory_id = item');
  execute definition;
end $$;

-- This function only maintains branch settings/conversions from the actual rows;
-- it does not create or synchronize a second product catalog.
create function inventory_private.refresh_branch_products(payload jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
  if payload is null then return; end if;
  insert into public.branch_product(owner_id,business_id,product_id,legacy_pos_product_id,legacy_sync_enabled,
    sell_price,manual_unit_cost,stock_mode,legacy_stock_quantity,is_available)
  select p.owner_id,p.business_id,p.inventory_id,p.id,p.pos_managed,p.price,p.cost_price,
    case when p.stock<0 then 'none' else 'self' end,case when p.stock<0 then null else p.stock end,p.is_available
  from jsonb_populate_recordset(null::public.products,payload) p where p.pos_managed
  on conflict(business_id,product_id) do update set sell_price=excluded.sell_price,
    manual_unit_cost=excluded.manual_unit_cost,stock_mode=excluded.stock_mode,
    legacy_stock_quantity=excluded.legacy_stock_quantity,is_available=excluded.is_available
    where branch_product.legacy_sync_enabled;
  insert into public.item_units(owner_id,product_id,unit_id,label,factor_to_base)
  select p.owner_id,p.inventory_id,p.base_unit_id,u.code,1
  from jsonb_populate_recordset(null::public.products,payload) p join public.units u on u.id=p.base_unit_id where p.pos_managed
  on conflict(product_id,label) do nothing;
end $$;
create function inventory_private.products_changed() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform inventory_private.refresh_branch_products((select jsonb_agg(to_jsonb(p)) from inventory_product_rows p));
  return null;
end $$;
create trigger inventory_products_insert after insert on public.products referencing new table as inventory_product_rows
  for each statement execute function inventory_private.products_changed();
create trigger inventory_products_update after update on public.products referencing new table as inventory_product_rows
  for each statement execute function inventory_private.products_changed();

create policy inventory_owner_products on public.products for all to authenticated
  using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
-- Token-only POS clients retain their old write columns; they cannot edit the
-- inventory UUID, owner, purchase flags, units or SKU by guessing column names.
revoke insert,update on public.products from anon;
grant insert(business_id,id,name,category_id,price,cost_price,stock,is_available,raw,synced_at),
  update(business_id,id,name,category_id,price,cost_price,stock,is_available,raw,synced_at) on public.products to anon;

-- All master metadata and UUID references have been copied above. No CASCADE.
drop table public.product;
revoke all on all functions in schema inventory_private from public,anon,authenticated;
comment on table public.products is 'Single product master, extending the existing POS table. No separate product catalog.';
comment on column public.products.inventory_id is 'Stable internal UUID for inventory foreign keys. Existing business_id + id POS keys remain unchanged.';
comment on column public.products.business_id is 'Origin branch for legacy POS identity; branch_product can associate this product with other branches of the same owner.';
notify pgrst,'reload schema';
commit;
