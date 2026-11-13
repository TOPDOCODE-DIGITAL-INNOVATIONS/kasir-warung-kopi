-- Products are branch-scoped already. Keep one row for identity and settings.
begin;
lock table public.products, public.branch_product, public.recipes,
  public.recipe_lines, public.purchase_lines in share row exclusive mode;

-- Do not silently lose cross-branch associations or conflicting values.
do $$ begin
  if exists (select 1 from public.branch_product b join public.products p on p.inventory_id=b.product_id
    where b.business_id<>p.business_id or b.owner_id<>p.owner_id or
      b.sell_price is distinct from p.price or b.manual_unit_cost is distinct from p.cost_price or
      b.is_available is distinct from p.is_available or b.is_active is distinct from p.is_active or
      b.legacy_stock_quantity is distinct from case when p.stock<0 then null else p.stock end or
      (b.legacy_pos_product_id is not null and b.legacy_pos_product_id<>p.id)) then
    raise exception 'Reconcile conflicting branch settings before merging products';
  end if;
end $$;

drop trigger inventory_products_insert on public.products;
drop trigger inventory_products_update on public.products;
drop function inventory_private.products_changed();
drop function inventory_private.refresh_branch_products(jsonb);

alter table public.products
  add column cost_source text not null default 'manual' check(cost_source in ('manual','recipe','inventory')),
  add column stock_mode text not null default 'none' check(stock_mode in ('none','self','recipe')),
  add column min_stock numeric(18,6) not null default 0 check(min_stock>=0 and min_stock<>'NaN'::numeric),
  add column pos_sync_enabled boolean not null default true,
  add constraint products_branch_inventory_owner_key unique(business_id,inventory_id,owner_id);

-- Copy settings without changing product IDs, timestamps or existing POS fields.
alter table public.products disable trigger inventory_product_identity;
update public.products p set cost_source=b.cost_source,stock_mode=b.stock_mode,
  min_stock=b.min_stock,pos_sync_enabled=b.legacy_sync_enabled
from public.branch_product b where b.product_id=p.inventory_id and b.business_id=p.business_id;
alter table public.products enable trigger inventory_product_identity;

-- SKU, like the existing text POS ID, belongs to a branch in this model.
alter table public.products drop constraint products_owner_sku_key;
alter table public.products add constraint products_business_sku_key unique(business_id,sku);

alter table public.recipes drop constraint recipes_branch_product_id_business_id_owner_id_fkey;
alter table public.recipe_lines drop constraint recipe_lines_business_id_component_product_id_owner_id_fkey;
alter table public.purchase_lines drop constraint purchase_lines_business_id_product_id_owner_id_fkey;

-- Repoint even published recipes without mutating their version or snapshots.
alter table public.recipes disable trigger recipes_validate;
alter table public.recipes disable trigger inventory_identity;
update public.recipes r set branch_product_id=b.product_id from public.branch_product b where b.id=r.branch_product_id;
alter table public.recipes rename column branch_product_id to product_id;
alter table public.recipes rename constraint recipes_branch_product_id_version_key to recipes_product_id_version_key;
alter table public.recipes enable trigger inventory_identity;
alter table public.recipes enable trigger recipes_validate;
alter table public.recipes add foreign key(business_id,product_id,owner_id)
  references public.products(business_id,inventory_id,owner_id);
alter table public.recipe_lines add foreign key(business_id,component_product_id,owner_id)
  references public.products(business_id,inventory_id,owner_id);
alter table public.purchase_lines add foreign key(business_id,product_id,owner_id)
  references public.products(business_id,inventory_id,owner_id);

create or replace function inventory_private.guard_product() returns trigger
language plpgsql security definer set search_path='' as $$
declare actual_owner uuid; from_pos boolean;
begin
  from_pos:=coalesce(public.sync_token_business_id()=new.business_id,false);
  if tg_op='INSERT' then
    select owner_id into strict actual_owner from public.businesses where id=new.business_id;
    if new.owner_id is not null and new.owner_id<>actual_owner then
      raise exception 'Product owner must match its branch' using errcode='23514';
    end if;
    new.owner_id:=actual_owner;
    if from_pos then
      new.pos_managed:=true;
      new.stock_mode:=case when new.stock<0 then 'none' else 'self' end;
    end if;
  else
    if new.business_id<>old.business_id or new.id<>old.id or new.inventory_id<>old.inventory_id or new.owner_id<>old.owner_id then
      raise exception 'Product identity and owner are immutable' using errcode='23514';
    end if;
    if new.base_unit_id<>old.base_unit_id then
      raise exception 'Base unit is immutable; create a conversion or a new product' using errcode='23514';
    end if;
    if from_pos then
      -- Inventory-admin records can opt out of POS writes without a second table.
      if not old.pos_sync_enabled then return old; end if;
      if new.stock_mode<>'recipe' then
        new.stock_mode:=case when new.stock<0 then 'none' else 'self' end;
      end if;
    end if;
    new.updated_at:=clock_timestamp();
  end if;
  return new;
end $$;

create or replace function inventory_private.guard_document_line() returns trigger
language plpgsql set search_path='' as $$
declare r record; unit_row record; tenant uuid; branch uuid; item uuid;
begin
  if tg_op='DELETE' then tenant:=old.owner_id; branch:=old.business_id;
  else tenant:=new.owner_id; branch:=new.business_id; end if;
  if tg_op='UPDATE' then
    if new.business_id<>old.business_id then raise exception 'Moving a document line is not allowed' using errcode='23514'; end if;
    if tg_table_name='recipe_lines' then
      if new.recipe_id<>old.recipe_id then raise exception 'Moving a recipe line is not allowed' using errcode='23514'; end if;
    else
      if new.purchase_id<>old.purchase_id then raise exception 'Moving a purchase line is not allowed' using errcode='23514'; end if;
    end if;
  end if;
  if tg_table_name='recipe_lines' then
    select h.status,h.product_id into r from public.recipes h
      where h.id=case when tg_op='DELETE' then old.recipe_id else new.recipe_id end
        and h.owner_id=tenant and h.business_id=branch for update;
    if tg_op<>'DELETE' then item:=new.component_product_id; end if;
  else
    select h.status into r from public.purchases h
      where h.id=case when tg_op='DELETE' then old.purchase_id else new.purchase_id end
        and h.owner_id=tenant and h.business_id=branch for update;
    if tg_op<>'DELETE' then item:=new.product_id; end if;
  end if;
  if not found then
    if tg_op='DELETE' then return old; end if;
    raise exception 'Document not found or not accessible' using errcode='23503';
  end if;
  if r.status<>'draft' then raise exception 'Published document lines are immutable' using errcode='23514'; end if;
  if tg_op='DELETE' then return old; end if;
  if tg_table_name='recipe_lines' then
    if r.product_id=item then raise exception 'A recipe cannot contain itself' using errcode='23514'; end if;
  elsif not exists(select 1 from public.products where inventory_id=item and owner_id=tenant and can_buy and is_active) then
    raise exception 'Purchase lines require an active buyable product' using errcode='23514';
  end if;
  select iu.factor_to_base,u.code,p.name into strict unit_row
    from public.item_units iu join public.units u on u.id=iu.unit_id
    join public.products p on p.inventory_id=iu.product_id and p.owner_id=iu.owner_id
    where iu.id=new.item_unit_id and iu.product_id=item and iu.owner_id=tenant and iu.is_active;
  new.factor_snapshot:=unit_row.factor_to_base;
  new.unit_code:=unit_row.code;
  new.product_name:=unit_row.name;
  return new;
end $$;

create or replace function inventory_private.guard_recipe() returns trigger
language plpgsql set search_path='' as $$
declare has_cycle boolean;
begin
  if tg_op='DELETE' then
    if old.status<>'draft' then raise exception 'Archive published recipes instead of deleting' using errcode='23514'; end if;
    return old;
  end if;
  if tg_op='INSERT' and new.status<>'draft' then
    raise exception 'Create a draft recipe before publishing' using errcode='23514';
  end if;
  if tg_op='UPDATE' then
    if new.product_id<>old.product_id or new.business_id<>old.business_id then
      raise exception 'Recipe output and branch are immutable' using errcode='23514';
    end if;
    if old.status<>'draft' then
      if old.status='active' and new.status='archived' and
        (to_jsonb(new)-array['status','updated_at'])=(to_jsonb(old)-array['status','updated_at']) then return new; end if;
      raise exception 'Published recipes are immutable; create a new version' using errcode='23514';
    end if;
  end if;
  if new.status='active' then
    perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text,0));
    if not exists(select 1 from public.recipe_lines where recipe_id=new.id) then
      raise exception 'Cannot publish an empty recipe' using errcode='23514';
    end if;
    with recursive edges as (
      select h.product_id as parent,l.component_product_id as child
      from public.recipes h join public.recipe_lines l on l.recipe_id=h.id
      where h.business_id=new.business_id and h.owner_id=new.owner_id and h.status='active' and h.id<>new.id
      union select new.product_id,component_product_id from public.recipe_lines where recipe_id=new.id
    ),walk(node) as (
      select child from edges where parent=new.product_id
      union select e.child from walk w join edges e on e.parent=w.node
    ) select exists(select 1 from walk where node=new.product_id) into has_cycle;
    if has_cycle then raise exception 'Recipe cycle detected' using errcode='23514'; end if;
    new.effective_from:=coalesce(new.effective_from,now());
  end if;
  return new;
end $$;

-- Only provision base units for POS products; no branch-settings copies remain.
create function inventory_private.ensure_pos_product_units() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.item_units(owner_id,product_id,unit_id,label,factor_to_base)
  select p.owner_id,p.inventory_id,p.base_unit_id,u.code,1
    from inventory_product_rows p join public.units u on u.id=p.base_unit_id where p.pos_managed
  on conflict(product_id,label) do nothing;
  return null;
end $$;
create trigger inventory_products_insert after insert on public.products referencing new table as inventory_product_rows
  for each statement execute function inventory_private.ensure_pos_product_units();
create trigger inventory_products_update after update on public.products referencing new table as inventory_product_rows
  for each statement execute function inventory_private.ensure_pos_product_units();

drop table public.branch_product;
revoke all on all functions in schema inventory_private from public,anon,authenticated;
comment on table public.products is 'Branch-scoped product master and inventory settings. Existing POS business_id + id keys remain unchanged.';
comment on column public.products.business_id is 'Branch owning this product and its prices, costs and stock.';
comment on column public.products.pos_sync_enabled is 'When false, POS-token writes do not overwrite this product; inventory-owner updates remain permitted.';
notify pgrst,'reload schema';
commit;
