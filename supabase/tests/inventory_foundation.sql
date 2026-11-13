-- Execute with psql -v ON_ERROR_STOP=1. All fixtures are rolled back.
begin;
create function pg_temp.assert_true(ok boolean, message text) returns void
language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'FAIL: %', message; end if;
  raise notice 'PASS: %', message;
end $$;
create function pg_temp.rejects(statement text, expected_state text, message text) returns void
language plpgsql as $$
declare rejected boolean := false;
begin
  begin execute statement;
  exception when others then
    if sqlstate <> expected_state then raise exception 'FAIL: %, unexpected SQLSTATE %, %', message, sqlstate, sqlerrm; end if;
    rejected := true;
  end;
  perform pg_temp.assert_true(rejected, message);
end $$;

-- Compare old rows byte-for-byte, including JSON snapshots and sync cursors.
select pg_temp.assert_true(to_regclass('public.branch_product') is null and to_regclass('public.branch_items') is null,
  'branch settings are merged into products');
select pg_temp.assert_true(exists(select 1 from information_schema.columns where table_schema='public' and table_name='recipes' and column_name='product_id'),
  'recipe output references products directly');
select pg_temp.assert_true(to_regclass('public.product') is null,
  'there is only one product master: the original products table');
create temp table inventory_old_rows (table_name text primary key, digest text);
do $$ declare t text; d text;
begin
  foreach t in array array['businesses','products','transactions','expenses','shifts','manual_summaries','book_period_rules','deleted_records'] loop
    execute format('select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text, ''[]'')) from public.%I r', t) into d;
    insert into inventory_old_rows values (t,d);
  end loop;
end $$;

select pg_temp.assert_true(not exists(select 1 from public.products p join public.businesses b on b.id=p.business_id where p.owner_id<>b.owner_id or p.inventory_id is null),
  'every existing product remains attached to its actual branch and owner');

insert into auth.users (id,email) values
 ('f1000000-0000-0000-0000-000000000001','inventory-test-a@example.invalid'),
 ('f1000000-0000-0000-0000-000000000002','inventory-test-b@example.invalid');
insert into public.businesses (id,owner_id,name) values
 ('f2000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001','Inventory test A'),
 ('f2000000-0000-0000-0000-000000000002','f1000000-0000-0000-0000-000000000001','Inventory test A second branch'),
 ('f2000000-0000-0000-0000-000000000003','f1000000-0000-0000-0000-000000000002','Inventory test B');

set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-0000-0000-000000000001',true);
insert into public.products(inventory_id,business_id,id,name,base_unit_id,can_buy,can_sell,price,cost_price,sku) values
 ('f3000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','inventory-bean','Bean','00000000-0000-0000-0000-000000000002',true,false,0,0.16,null),
 ('f3000000-0000-0000-0000-000000000002','f2000000-0000-0000-0000-000000000001','inventory-latte','Latte','00000000-0000-0000-0000-000000000001',false,true,22000,8000,'LATTE'),
 ('f3000000-0000-0000-0000-000000000003','f2000000-0000-0000-0000-000000000001','inventory-milk','Milk','00000000-0000-0000-0000-000000000004',true,false,0,null,null),
 ('f3000000-0000-0000-0000-000000000004','f2000000-0000-0000-0000-000000000002','inventory-latte','Latte','00000000-0000-0000-0000-000000000001',false,true,25000,9000,'LATTE');
select pg_temp.assert_true((select count(*)=2 and min(price)=22000 and max(price)=25000 from public.products where id='inventory-latte'),
  'each branch stores its own product price under the same POS ID and SKU');
select pg_temp.rejects($q$insert into public.products(business_id,id,name,owner_id) values('f2000000-0000-0000-0000-000000000003','forged','Forged','f1000000-0000-0000-0000-000000000001')$q$,
  '23514','cross-owner product origin is rejected');
insert into public.item_units (id,product_id,unit_id,label,factor_to_base) values
 ('f5000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','g',1),
 ('f5000000-0000-0000-0000-000000000002','f3000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','kg',1000),
 ('f5000000-0000-0000-0000-000000000003','f3000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','pcs',1),
 ('f5000000-0000-0000-0000-000000000004','f3000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000006','Milk 1 litre carton',1000);
select pg_temp.rejects($q$insert into public.item_units (product_id,unit_id,label,factor_to_base) values ('f3000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','invalid ml',1)$q$,'23514','mass-to-volume conversion rejected');
select pg_temp.rejects($q$insert into public.item_units (product_id,unit_id,label,factor_to_base) values ('f3000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','wrong kg',100)$q$,'23514','incorrect standard unit factor rejected');
select pg_temp.rejects($q$update public.products set base_unit_id='00000000-0000-0000-0000-000000000003' where inventory_id='f3000000-0000-0000-0000-000000000001'$q$,'23514','changing the base unit cannot rewrite history');
select pg_temp.rejects($q$update public.products set cost_price='NaN' where inventory_id='f3000000-0000-0000-0000-000000000001'$q$,'23514','NaN cannot bypass monetary validation');
select pg_temp.assert_true((select cost_price is null from public.products where inventory_id='f3000000-0000-0000-0000-000000000003'), 'unknown cost remains NULL');

insert into public.suppliers (id,name) values
 ('f6000000-0000-0000-0000-000000000001','Supplier A'),
 ('f6000000-0000-0000-0000-000000000002','Supplier B');
insert into public.product_suppliers (product_id,supplier_id,item_unit_id) values
 ('f3000000-0000-0000-0000-000000000001','f6000000-0000-0000-0000-000000000001','f5000000-0000-0000-0000-000000000002'),
 ('f3000000-0000-0000-0000-000000000001','f6000000-0000-0000-0000-000000000002','f5000000-0000-0000-0000-000000000002'),
 ('f3000000-0000-0000-0000-000000000003','f6000000-0000-0000-0000-000000000001','f5000000-0000-0000-0000-000000000004');
select pg_temp.assert_true((select count(*)=3 from public.product_suppliers), 'supplier and product relation is many-to-many');

insert into public.recipes (id,business_id,product_id,version) values
 ('f7000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000002',1),
 ('f7000000-0000-0000-0000-000000000002','f2000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000001',1);
select pg_temp.rejects($q$insert into public.recipes(business_id,product_id,version) values('f2000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000004',1)$q$,
  '23503','recipe cannot use another branch product even under the same owner');
select pg_temp.rejects($q$update public.recipes set status='active' where id='f7000000-0000-0000-0000-000000000001'$q$,'23514','empty recipe cannot be published');
select pg_temp.rejects($q$insert into public.recipe_lines (business_id,recipe_id,component_product_id,item_unit_id,quantity) values ('f2000000-0000-0000-0000-000000000001','f7000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000002','f5000000-0000-0000-0000-000000000003',1)$q$,'23514','self-referencing recipe rejected');
insert into public.recipe_lines (id,business_id,recipe_id,component_product_id,item_unit_id,quantity) values
 ('f8000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','f7000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000001','f5000000-0000-0000-0000-000000000002',0.02),
 ('f8000000-0000-0000-0000-000000000002','f2000000-0000-0000-0000-000000000001','f7000000-0000-0000-0000-000000000002','f3000000-0000-0000-0000-000000000002','f5000000-0000-0000-0000-000000000003',1);
select pg_temp.assert_true((select quantity_base=20 from public.recipe_lines where id='f8000000-0000-0000-0000-000000000001'), '0.02 kg recipe ingredient converts to 20 g without truncation');
update public.recipes set status='active' where id='f7000000-0000-0000-0000-000000000001';
select pg_temp.rejects($q$update public.recipes set status='active' where id='f7000000-0000-0000-0000-000000000002'$q$,'23514','indirect recipe cycle rejected');
select pg_temp.rejects($q$update public.recipe_lines set quantity=0.03 where id='f8000000-0000-0000-0000-000000000001'$q$,'23514','published recipe ingredients are frozen');
select pg_temp.rejects($q$delete from public.recipes where id='f7000000-0000-0000-0000-000000000001'$q$,'23514','published recipe cannot be deleted');
delete from public.recipes where id='f7000000-0000-0000-0000-000000000002';
select pg_temp.assert_true(not exists(select 1 from public.recipe_lines where recipe_id='f7000000-0000-0000-0000-000000000002'), 'draft recipe can be deleted with its lines');

insert into public.purchases (id,business_id,supplier_id,document_number) values
 ('f9000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','f6000000-0000-0000-0000-000000000001','INV-TEST-1');
select pg_temp.rejects($q$update public.purchases set status='posted' where id='f9000000-0000-0000-0000-000000000001'$q$,'23514','empty purchase cannot be posted');
select pg_temp.rejects($q$insert into public.purchase_lines (business_id,purchase_id,product_id,item_unit_id,quantity,unit_price) values ('f2000000-0000-0000-0000-000000000001','f9000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000002','f5000000-0000-0000-0000-000000000003',1,5000)$q$,'23514','sell-only product cannot be purchased');
insert into public.purchase_lines (id,business_id,purchase_id,product_id,item_unit_id,quantity,unit_price,tax_amount) values
 ('fa000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','f9000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000001','f5000000-0000-0000-0000-000000000002',0.5,160000,8000);
update public.purchases set status='posted',subtotal=999999,tax_amount=999999 where id='f9000000-0000-0000-0000-000000000001';
select pg_temp.assert_true((select subtotal=80000 and tax_amount=8000 and grand_total=88000 and supplier_name='Supplier A' from public.purchases where id='f9000000-0000-0000-0000-000000000001'), 'posting derives exact totals from lines, ignoring forged header totals');
select pg_temp.assert_true((select quantity_base=500 from public.purchase_lines where id='fa000000-0000-0000-0000-000000000001'), '0.5 kg purchase preserves fractional quantity');
select pg_temp.rejects($q$update public.purchase_lines set unit_price=1 where id='fa000000-0000-0000-0000-000000000001'$q$,'23514','posted purchase lines are immutable');
select pg_temp.rejects($q$update public.purchases set subtotal=1 where id='f9000000-0000-0000-0000-000000000001'$q$,'23514','posted purchase header is immutable');
select pg_temp.rejects($q$delete from public.purchases where id='f9000000-0000-0000-0000-000000000001'$q$,'23514','posted purchase cannot be deleted');
update public.item_units set factor_to_base=900 where id='f5000000-0000-0000-0000-000000000004';
select pg_temp.assert_true((select factor_snapshot=1000 from public.purchase_lines where id='fa000000-0000-0000-0000-000000000001'), 'historical conversion snapshot remains fixed');
select pg_temp.rejects($q$update public.purchases set status='cancelled' where id='f9000000-0000-0000-0000-000000000001'$q$,'23514','purchase cancellation requires a reason');
update public.purchases set status='cancelled',cancel_reason='Test cancellation' where id='f9000000-0000-0000-0000-000000000001';
select pg_temp.assert_true((select grand_total=88000 and cancelled_at is not null from public.purchases where id='f9000000-0000-0000-0000-000000000001'), 'cancellation retains purchase history and amounts');
insert into public.purchases (id,business_id,document_number) values
 ('f9000000-0000-0000-0000-000000000002','f2000000-0000-0000-0000-000000000001','INV-TEST-DRAFT');
insert into public.purchase_lines (business_id,purchase_id,product_id,item_unit_id,quantity,unit_price) values
 ('f2000000-0000-0000-0000-000000000001','f9000000-0000-0000-0000-000000000002','f3000000-0000-0000-0000-000000000001','f5000000-0000-0000-0000-000000000002',1,160000);
delete from public.purchases where id='f9000000-0000-0000-0000-000000000002';
select pg_temp.assert_true(not exists(select 1 from public.purchase_lines where purchase_id='f9000000-0000-0000-0000-000000000002'), 'draft purchase can be deleted with its lines');

-- A second owner cannot read or write another owner's inventory, including with a sync token.
select set_config('request.jwt.claim.sub','f1000000-0000-0000-0000-000000000002',true);
select pg_temp.assert_true((select count(*)=0 from public.products), 'another owner sees no first-owner products');
select pg_temp.assert_true((select count(*)=0 from public.purchases), 'another owner sees no first-owner purchase history');
select pg_temp.rejects($q$insert into public.suppliers (owner_id,name) values ('f1000000-0000-0000-0000-000000000001','Forged owner')$q$,'42501','owner spoofing rejected by RLS');
insert into public.suppliers (id,name) values ('f6000000-0000-0000-0000-000000000003','Tenant B supplier');
select set_config('request.jwt.claim.sub','f1000000-0000-0000-0000-000000000001',true);
select pg_temp.rejects($q$insert into public.product_suppliers (product_id,supplier_id,item_unit_id) values ('f3000000-0000-0000-0000-000000000001','f6000000-0000-0000-0000-000000000003','f5000000-0000-0000-0000-000000000002')$q$,'23503','cross-owner supplier FK rejected');
reset role;
select set_config('request.headers',jsonb_build_object('x-sync-token',(select sync_token from public.businesses where id='f2000000-0000-0000-0000-000000000001'))::text,true);
set local role anon;
select pg_temp.rejects($q$update public.products set can_buy=true where business_id='f2000000-0000-0000-0000-000000000001'$q$,
  '42501','sync token cannot edit inventory-only fields');
insert into public.products (business_id,id,name,price,stock) values
 ('f2000000-0000-0000-0000-000000000001','anon-token-pos','Legacy token product',1000,-1);
reset role;
select pg_temp.assert_true((select count(*)=1 from public.products where business_id='f2000000-0000-0000-0000-000000000001' and id='anon-token-pos' and pos_managed), 'legacy token writes go straight into the single products table');

-- The POS still upserts batches directly into products.
insert into public.products (business_id,id,name,price,cost_price,stock,raw,pos_managed) values
 ('f2000000-0000-0000-0000-000000000001','same-pos-id','Legacy A',22000,8000,-1,'{"options":[{"name":"Ice"}]}',true),
 ('f2000000-0000-0000-0000-000000000003','same-pos-id','Legacy B',25000,9000,5,'{}',true);
select pg_temp.assert_true((select count(distinct inventory_id)=2 from public.products where id='same-pos-id'), 'identical POS IDs in different branches remain separate identities');
insert into public.products (business_id,id,name,price,stock) values
 ('f2000000-0000-0000-0000-000000000001','same-pos-id','Legacy A',22500,-1),
 ('f2000000-0000-0000-0000-000000000001','new-batch-id','New batch product',12000,-1)
on conflict (business_id,id) do update set price=excluded.price;
select pg_temp.assert_true((select price=22500 from public.products where business_id='f2000000-0000-0000-0000-000000000001' and id='same-pos-id') and
 (select count(*)=1 from public.products where business_id='f2000000-0000-0000-0000-000000000001' and id='new-batch-id'), 'mixed insert/update batch upsert preserves both transition tables');
update public.products set price=23000 where business_id='f2000000-0000-0000-0000-000000000001' and id='same-pos-id';
select pg_temp.assert_true((select price=23000 from public.products where business_id='f2000000-0000-0000-0000-000000000001' and id='same-pos-id'), 'POS updates the product price directly');
select pg_temp.assert_true((select count(*)=2 from public.products where id='same-pos-id'), 'repeated upserts do not duplicate product identities');
update public.products set pos_sync_enabled=false,price=26000
 where business_id='f2000000-0000-0000-0000-000000000001' and id='same-pos-id';
update public.products set price=24000 where business_id='f2000000-0000-0000-0000-000000000001' and id='same-pos-id';
select pg_temp.assert_true((select price=26000 from public.products where business_id='f2000000-0000-0000-0000-000000000001' and id='same-pos-id'), 'inventory-managed products can opt out of POS overwrites');
update public.products set is_available=false where id='same-pos-id' and business_id in ('f2000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000003');
select pg_temp.assert_true((select count(*)=2 from public.products where id='same-pos-id'), 'changing POS availability retains the product record');

-- Compare pre-existing data only, filtering our two temporary test branches.
do $$ declare t text; d text; expected text;
begin
  for t, expected in select table_name,digest from inventory_old_rows loop
    execute format('select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text, ''[]'')) from public.%I r where %I not in (%L::uuid,%L::uuid,%L::uuid)',
      t,case when t='businesses' then 'id' else 'business_id' end,
      'f2000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000002','f2000000-0000-0000-0000-000000000003') into d;
    perform pg_temp.assert_true(d=expected, 'legacy data unchanged: '||t);
  end loop;
end $$;
rollback;
