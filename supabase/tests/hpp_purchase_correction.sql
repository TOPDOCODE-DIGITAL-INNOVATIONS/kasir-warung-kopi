-- Execute with psql -v ON_ERROR_STOP=1. No fixture survives this transaction.
begin;
create function pg_temp.assert_true(ok boolean,message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',message; end if; raise notice 'PASS: %',message; end $$;
create function pg_temp.rejects(statement text,message text) returns void language plpgsql as $$
declare rejected boolean:=false;
begin begin execute statement; exception when others then rejected:=true; end;
  perform pg_temp.assert_true(rejected,message);
end $$;
insert into auth.users(id,email) values ('e2100000-0000-0000-0000-000000000001','hpp-correction-test@example.invalid');
insert into public.businesses(id,owner_id,name,pos_config) values
 ('e2200000-0000-0000-0000-000000000001','e2100000-0000-0000-0000-000000000001','HPP fixture',
  '{"products":[{"id":"beans","name":"Beans","price":30000,"costPrice":5000},{"id":"other","name":"Other","price":1000}],"categories":[],"cashiers":[{"id":"c"}],"settings":{}}');
insert into public.products(inventory_id,business_id,id,name,base_unit_id,can_buy,can_sell,stock,stock_mode,cost_price) values
 ('e2300000-0000-0000-0000-000000000001','e2200000-0000-0000-0000-000000000001','beans','Beans',(select id from public.units where code='pcs'),true,true,10,'self',5000);
create function pg_temp.line(line uuid,qty text,total text) returns jsonb language sql as $$
 select jsonb_build_object('id',line,'product_id','e2300000-0000-0000-0000-000000000001','version',p.updated_at::text,'quantity',qty,'item_unit_id',null,'amount',total,'category','Bahan Baku','note','')
 from public.products p where p.inventory_id='e2300000-0000-0000-0000-000000000001';
$$;
create function pg_temp.beans() returns public.products language sql as $$ select * from public.products where inventory_id='e2300000-0000-0000-0000-000000000001' $$;
create function pg_temp.pos_beans() returns jsonb language sql as $$
 select e from public.businesses b, jsonb_array_elements(b.pos_config->'products') e where b.id='e2200000-0000-0000-0000-000000000001' and e->>'id'='beans' $$;

select pg_temp.assert_true((select cost_verified_at is null from pg_temp.beans()),'existing HPP starts as not checked');
update public.products set cost_verified_at=now() where inventory_id='e2300000-0000-0000-0000-000000000001';
update public.products set cost_price=6000 where inventory_id='e2300000-0000-0000-0000-000000000001';
select pg_temp.assert_true((select cost_verified_at is null from pg_temp.beans()),'a cost change without a new verification stamp clears the check');
update public.products set cost_price=6000, cost_verified_at=now() where inventory_id='e2300000-0000-0000-0000-000000000001';
update public.products set name='Beans' where inventory_id='e2300000-0000-0000-0000-000000000001';
select pg_temp.assert_true((select cost_verified_at is not null from pg_temp.beans()),'editing other fields keeps a checked HPP');

set local role authenticated;
select set_config('request.jwt.claim.sub','e2100000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"e2100000-0000-0000-0000-000000000001","role":"authenticated","user_metadata":{"name":"Test Owner"}}',true);

select public.admin_record_expenses('e2200000-0000-0000-0000-000000000001','e2500000-0000-0000-0000-000000000001','2026-11-20','daily',
  jsonb_build_array(pg_temp.line('e2400000-0000-0000-0000-000000000001','4','100000')));
select pg_temp.assert_true((select cost_price=25000 and cost_verified_at is not null and stock=14 from pg_temp.beans()),'purchase sets HPP to the price per base unit and adds stock');
select pg_temp.assert_true((select (e->>'costPrice')::numeric=25000 and (e->>'costVerified')::boolean from pg_temp.pos_beans() e),'new HPP is published to the cashier config');
select public.admin_record_expenses('e2200000-0000-0000-0000-000000000001','e2500000-0000-0000-0000-000000000002','2026-11','monthly',
  jsonb_build_array(pg_temp.line('e2400000-0000-0000-0000-000000000002','2','60000')));
select pg_temp.assert_true((select cost_price=30000 and stock=16 from pg_temp.beans()),'a monthly stock purchase is allowed and updates HPP');

select pg_temp.rejects($q$select public.admin_cancel_purchase('e2200000-0000-0000-0000-000000000001','e2500000-0000-0000-0000-000000000002','  ')$q$,'correction requires a reason');
select public.admin_cancel_purchase('e2200000-0000-0000-0000-000000000001','e2500000-0000-0000-0000-000000000002','Jumlah salah ketik');
select pg_temp.assert_true((select stock=14 and cost_price=25000 and cost_verified_at is not null from pg_temp.beans()),'correction reverses stock and restores HPP from the previous purchase');
select pg_temp.assert_true((select status='cancelled' and cancel_reason='Jumlah salah ketik' from public.purchases where id='e2500000-0000-0000-0000-000000000002'),'purchase document is kept as cancelled with its reason');
select pg_temp.assert_true(not exists(select 1 from public.expenses where entry_group_id='e2500000-0000-0000-0000-000000000002'),'corrected expense leaves the totals');
select pg_temp.assert_true((select mode='correction' and before_stock=16 and after_stock=14 from public.stock_adjustment_lines where product_id='e2300000-0000-0000-0000-000000000001'),'stock reversal is audited as a correction');
select pg_temp.assert_true((select (e->>'costPrice')::numeric=25000 from pg_temp.pos_beans() e),'restored HPP is published to the cashier config');
select pg_temp.assert_true((select (public.admin_cancel_purchase('e2200000-0000-0000-0000-000000000001','e2500000-0000-0000-0000-000000000002','Ulang')->>'replayed')::boolean),'repeating a correction changes nothing');
select pg_temp.assert_true((select stock=14 from pg_temp.beans()),'repeated correction does not reverse stock twice');

select public.admin_record_stock('e2200000-0000-0000-0000-000000000001','e2600000-0000-0000-0000-000000000001',
  jsonb_build_array(jsonb_build_object('product_id','e2300000-0000-0000-0000-000000000001','version',(select updated_at::text from pg_temp.beans()),'mode','count','quantity','1','reason','')));
select pg_temp.rejects($q$select public.admin_cancel_purchase('e2200000-0000-0000-0000-000000000001','e2500000-0000-0000-0000-000000000001','Salah')$q$,'correction cannot push tracked stock below zero');
select pg_temp.assert_true((select stock=1 from pg_temp.beans()) and (select status='posted' from public.purchases where id='e2500000-0000-0000-0000-000000000001'),'rejected correction leaves stock and document unchanged');
select public.admin_record_stock('e2200000-0000-0000-0000-000000000001','e2600000-0000-0000-0000-000000000002',
  jsonb_build_array(jsonb_build_object('product_id','e2300000-0000-0000-0000-000000000001','version',(select updated_at::text from pg_temp.beans()),'mode','count','quantity','4','reason','')));
select public.admin_cancel_purchase('e2200000-0000-0000-0000-000000000001','e2500000-0000-0000-0000-000000000001','Salah supplier');
select pg_temp.assert_true((select stock=0 and cost_price=25000 and cost_verified_at is null from pg_temp.beans()),'without another purchase the HPP must be checked again');
select pg_temp.assert_true((select not (e->>'costVerified')::boolean from pg_temp.pos_beans() e),'cashier config marks the HPP as not checked');

set local role anon;
select pg_temp.rejects($q$select public.admin_cancel_purchase('e2200000-0000-0000-0000-000000000001','e2500000-0000-0000-0000-000000000001','x')$q$,'anonymous callers cannot correct purchases');
reset role;
-- deleted_records is readable only through the branch sync token, so check it as the database owner.
select pg_temp.assert_true(exists(select 1 from public.deleted_records where business_id='e2200000-0000-0000-0000-000000000001' and kind='expense' and id='EXP-ADMIN-e2400000-0000-0000-0000-000000000002'),'the cashier is told the corrected expense was removed');
rollback;
