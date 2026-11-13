-- Preserve row identities, references, policies and grants while adopting the new name.
alter table public.branch_items rename to branch_product;
alter table public.recipes rename column branch_item_id to branch_product_id;

-- PostgreSQL follows table/column OIDs for FKs and indexes. Rename their labels too.
do $$
declare entry record; renamed text;
begin
  for entry in
    select conrelid::regclass as relation, conname
    from pg_constraint
    where (conrelid = 'public.branch_product'::regclass and conname like 'branch_items%')
       or (conrelid = 'public.recipes'::regclass and conname like '%branch_item_id%')
  loop
    renamed := replace(replace(entry.conname, 'branch_items', 'branch_product'), 'branch_item_id', 'branch_product_id');
    execute format('alter table %s rename constraint %I to %I', entry.relation, entry.conname, renamed);
  end loop;
  for entry in
    select c.relname from pg_class c join pg_index i on i.indexrelid = c.oid
    where i.indrelid = 'public.branch_product'::regclass and c.relname like 'branch_items%'
  loop
    execute format('alter index public.%I rename to %I', entry.relname, replace(entry.relname, 'branch_items', 'branch_product'));
  end loop;
end $$;

-- PL/pgSQL bodies contain text references that ALTER TABLE cannot rewrite.
-- Rebuild only these four existing functions, retaining their signatures, security
-- attributes, ownership and privileges. Keep the applied foundation migration intact.
do $$
declare definition text; function_id oid;
begin
  foreach function_id in array array[
    'inventory_private.guard_master()'::regprocedure::oid,
    'inventory_private.guard_document_line()'::regprocedure::oid,
    'inventory_private.guard_recipe()'::regprocedure::oid,
    'inventory_private.sync_legacy_products(jsonb)'::regprocedure::oid
  ] loop
    select pg_get_functiondef(function_id) into strict definition;
    definition := replace(replace(definition, 'branch_items', 'branch_product'), 'branch_item_id', 'branch_product_id');
    execute definition;
  end loop;
end $$;

revoke all on all functions in schema inventory_private from public, anon, authenticated;
comment on table public.branch_product is 'Per-branch product settings and legacy POS mapping; formerly branch_items.';
notify pgrst, 'reload schema';
