-- Execute with psql -v ON_ERROR_STOP=1. No fixture survives this transaction.
begin;
create function pg_temp.assert_true(ok boolean,message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',message; end if; raise notice 'PASS: %',message; end $$;
create function pg_temp.rejects(statement text,message text) returns void language plpgsql as $$
declare rejected boolean:=false;
begin begin execute statement; exception when others then rejected:=true; end;
  perform pg_temp.assert_true(rejected,message);
end $$;
insert into auth.users(id,email) values
 ('e1100000-0000-0000-0000-000000000001','admin-inventory-test@example.invalid'),
 ('e1100000-0000-0000-0000-000000000002','admin-inventory-other@example.invalid');
insert into public.businesses(id,owner_id,name) values
 ('e1200000-0000-0000-0000-000000000001','e1100000-0000-0000-0000-000000000001','Admin inventory fixture'),
 ('e1200000-0000-0000-0000-000000000002','e1100000-0000-0000-0000-000000000001','Same owner other branch'),
 ('e1200000-0000-0000-0000-000000000003','e1100000-0000-0000-0000-000000000002','Other owner');
insert into public.suppliers(id,owner_id,name) values ('e1700000-0000-0000-0000-000000000001','e1100000-0000-0000-0000-000000000001','Fixture supplier');
insert into public.products(inventory_id,business_id,id,name,base_unit_id,can_buy,can_sell,stock,stock_mode) values
 ('e1300000-0000-0000-0000-000000000001','e1200000-0000-0000-0000-000000000001','milk','Milk',(select id from public.units where code='l'),true,false,10,'self'),
 ('e1300000-0000-0000-0000-000000000002','e1200000-0000-0000-0000-000000000001','ice','Ice',(select id from public.units where code='pcs'),true,false,-1,'none'),
 ('e1300000-0000-0000-0000-000000000003','e1200000-0000-0000-0000-000000000001','sugar','Sugar',(select id from public.units where code='kg'),true,false,8,'self'),
 ('e1300000-0000-0000-0000-000000000004','e1200000-0000-0000-0000-000000000002','other','Other',(select id from public.units where code='pcs'),true,false,5,'self'),
 ('e1300000-0000-0000-0000-000000000005','e1200000-0000-0000-0000-000000000003','foreign','Foreign',(select id from public.units where code='pcs'),true,false,5,'self');
create function pg_temp.stock_line(product uuid,mode text,qty text,reason text default '') returns jsonb language sql as $$
 select jsonb_build_object('product_id',product,'version',updated_at::text,'mode',mode,'quantity',qty,'reason',reason) from public.products where inventory_id=product;
$$;
create function pg_temp.expense_line(line uuid,product uuid,qty text,total text) returns jsonb language sql as $$
 select jsonb_build_object('id',line,'product_id',product,'version',p.updated_at::text,'quantity',qty,'item_unit_id',null,'amount',total,'category','Test expense','note','Fixture') from (values(1)) x(v) left join public.products p on p.inventory_id=product;
$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','e1100000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"e1100000-0000-0000-0000-000000000001","role":"authenticated","user_metadata":{"name":"Test Owner"}}',true);

create temp table first_payload as select jsonb_build_array(
 pg_temp.expense_line('e1400000-0000-0000-0000-000000000001','e1300000-0000-0000-0000-000000000001','5','125000'),
 pg_temp.expense_line('e1400000-0000-0000-0000-000000000002','e1300000-0000-0000-0000-000000000002',null,'20000'),
 pg_temp.expense_line('e1400000-0000-0000-0000-000000000003',null,null,'15000')) as data;
select public.admin_record_expenses('e1200000-0000-0000-0000-000000000001','e1500000-0000-0000-0000-000000000001','2026-11-12','daily',(select data from first_payload));
select pg_temp.assert_true((select count(*)=3 and sum(amount)=160000 from public.expenses where entry_group_id='e1500000-0000-0000-0000-000000000001'),'one input produces three expenses, no duplicate total row');
select pg_temp.assert_true((select stock=15 from public.products where id='milk' and business_id='e1200000-0000-0000-0000-000000000001'),'tracked purchase adds stock');
select pg_temp.assert_true((select stock=-1 from public.products where id='ice' and business_id='e1200000-0000-0000-0000-000000000001'),'untracked nominal-only purchase retains sentinel');
select pg_temp.assert_true((select count(*)=1 and sum(line_total)=125000 from public.purchase_lines where purchase_id='e1500000-0000-0000-0000-000000000001'),'only quantified goods create purchase lines');
select pg_temp.assert_true((select status='posted' and grand_total=125000 from public.purchases where id='e1500000-0000-0000-0000-000000000001'),'purchase is posted atomically');
select pg_temp.assert_true((select bool_and(not from_drawer and shift_id is null) from public.expenses where entry_group_id='e1500000-0000-0000-0000-000000000001'),'admin expenses do not modify drawer shifts');
select public.admin_record_expenses('e1200000-0000-0000-0000-000000000001','e1500000-0000-0000-0000-000000000001','2026-11-12','daily',(select data from first_payload));
select pg_temp.assert_true((select stock=15 from public.products where inventory_id='e1300000-0000-0000-0000-000000000001'),'retry does not add stock again');
select pg_temp.rejects($q$select public.admin_record_expenses('e1200000-0000-0000-0000-000000000001','e1500000-0000-0000-0000-000000000001','2026-11-13','daily',(select data from first_payload))$q$,'changed retry payload rejected');

create temp table bad_batch as select jsonb_build_array(
 pg_temp.expense_line('e1400000-0000-0000-0000-000000000004','e1300000-0000-0000-0000-000000000001','1','10000'),
 pg_temp.expense_line('e1400000-0000-0000-0000-000000000005',null,null,'0')) data;
select pg_temp.rejects($q$select public.admin_record_expenses('e1200000-0000-0000-0000-000000000001','e1500000-0000-0000-0000-000000000002','2026-11-12','daily',(select data from bad_batch))$q$,'invalid last expense rejects entire batch');
select pg_temp.assert_true((select stock=15 from public.products where inventory_id='e1300000-0000-0000-0000-000000000001') and not exists(select 1 from public.expenses where entry_group_id='e1500000-0000-0000-0000-000000000002') and not exists(select 1 from public.purchases where id='e1500000-0000-0000-0000-000000000002'),'failed expense leaves no partial stock, expense, or purchase');

create temp table count_payload as select jsonb_build_array(
 pg_temp.stock_line('e1300000-0000-0000-0000-000000000001','count','4'),
 pg_temp.stock_line('e1300000-0000-0000-0000-000000000003','usage','2','Used manually')) data;
select public.admin_record_stock('e1200000-0000-0000-0000-000000000001','e1600000-0000-0000-0000-000000000001',(select data from count_payload),'Physical count');
select pg_temp.assert_true((select stock=4 from public.products where inventory_id='e1300000-0000-0000-0000-000000000001') and (select stock=6 from public.products where inventory_id='e1300000-0000-0000-0000-000000000003'),'bulk count sets actual remainder and usage subtracts once');
select pg_temp.assert_true((select delta=-11 from public.stock_adjustment_lines where adjustment_id='e1600000-0000-0000-0000-000000000001' and product_id='e1300000-0000-0000-0000-000000000001'),'count stores before/after delta');
select public.admin_record_stock('e1200000-0000-0000-0000-000000000001','e1600000-0000-0000-0000-000000000001',(select data from count_payload),'Physical count');
select pg_temp.assert_true((select stock=6 from public.products where inventory_id='e1300000-0000-0000-0000-000000000003'),'count retry does not repeat consumption');
select pg_temp.rejects($q$select public.admin_record_stock('e1200000-0000-0000-0000-000000000001','e1600000-0000-0000-0000-000000000002',(select data from count_payload))$q$,'stale versions reject another operation');
select pg_temp.rejects($q$select public.admin_record_stock('e1200000-0000-0000-0000-000000000001','e1600000-0000-0000-0000-000000000003',jsonb_build_array(pg_temp.stock_line('e1300000-0000-0000-0000-000000000001','count','1'),pg_temp.stock_line('e1300000-0000-0000-0000-000000000003','damage','99','Damaged'))))$q$,'invalid later stock line rolls back earlier change');
select pg_temp.assert_true((select stock=4 from public.products where inventory_id='e1300000-0000-0000-0000-000000000001') and not exists(select 1 from public.stock_adjustments where id='e1600000-0000-0000-0000-000000000003'),'no partial bulk count remains');
select public.admin_record_stock('e1200000-0000-0000-0000-000000000001','e1600000-0000-0000-0000-000000000004',jsonb_build_array(pg_temp.stock_line('e1300000-0000-0000-0000-000000000001','count','0')));
select pg_temp.assert_true((select stock=0 from public.products where inventory_id='e1300000-0000-0000-0000-000000000001'),'zero count explicitly records empty stock');
select pg_temp.rejects($q$select public.admin_record_stock('e1200000-0000-0000-0000-000000000001','e1600000-0000-0000-0000-000000000005',jsonb_build_array(pg_temp.stock_line('e1300000-0000-0000-0000-000000000001','count','')))$q$,'empty count is not converted into zero');
select pg_temp.rejects($q$select public.admin_record_stock('e1200000-0000-0000-0000-000000000001','e1600000-0000-0000-0000-000000000006',jsonb_build_array(pg_temp.stock_line('e1300000-0000-0000-0000-000000000002','count','2')))$q$,'untracked product cannot be counted');
select pg_temp.rejects($q$select public.admin_record_stock('e1200000-0000-0000-0000-000000000001','e1600000-0000-0000-0000-000000000007',jsonb_build_array(pg_temp.stock_line('e1300000-0000-0000-0000-000000000004','count','2')))$q$,'same-owner other-branch product rejected');
select pg_temp.rejects($q$select public.admin_record_stock('e1200000-0000-0000-0000-000000000003','e1600000-0000-0000-0000-000000000008','[]')$q$,'foreign owner branch rejected');
select pg_temp.rejects($q$delete from public.stock_adjustments where id='e1600000-0000-0000-0000-000000000001'$q$,'authenticated users cannot delete audit documents');

create temp table timestamps as select stock_updated_at from public.products where inventory_id='e1300000-0000-0000-0000-000000000001';
update public.products set name='Milk renamed' where inventory_id='e1300000-0000-0000-0000-000000000001';
select pg_temp.assert_true((select stock_updated_at=(select stock_updated_at from timestamps) from public.products where inventory_id='e1300000-0000-0000-0000-000000000001'),'editing product identity does not change stock update time');
select public.admin_record_stock('e1200000-0000-0000-0000-000000000001','e1600000-0000-0000-0000-000000000009',jsonb_build_array(pg_temp.stock_line('e1300000-0000-0000-0000-000000000001','count','0')));
select pg_temp.assert_true((select stock_updated_at>(select stock_updated_at from timestamps) from public.products where inventory_id='e1300000-0000-0000-0000-000000000001'),'confirming unchanged physical stock still records stock update time');
select public.admin_record_expenses('e1200000-0000-0000-0000-000000000001','e1500000-0000-0000-0000-000000000003','2026-11-12','daily',jsonb_build_array(
 pg_temp.expense_line('e1400000-0000-0000-0000-000000000006','e1300000-0000-0000-0000-000000000001','3','10000'),
 pg_temp.expense_line('e1400000-0000-0000-0000-000000000007','e1300000-0000-0000-0000-000000000002','2','20000')));
select pg_temp.assert_true((select line_total=10000 from public.purchase_lines where id='e1400000-0000-0000-0000-000000000006'),'repeating per-unit price keeps expense and purchase totals exact');
select pg_temp.assert_true((select stock=-1 from public.products where inventory_id='e1300000-0000-0000-0000-000000000002'),'quantified untracked purchase records history without increasing stock');
select pg_temp.rejects($q$select public.admin_record_expenses('e1200000-0000-0000-0000-000000000001','e1500000-0000-0000-0000-000000000004','2026-11-12','daily',jsonb_build_array(pg_temp.expense_line('e1400000-0000-0000-0000-000000000008','e1300000-0000-0000-0000-000000000001',null,'10000')))$q$,'tracked purchase requires quantity');
select pg_temp.rejects($q$select public.admin_record_expenses('e1200000-0000-0000-0000-000000000001','e1500000-0000-0000-0000-000000000005','2026-11-12','daily',jsonb_build_array(pg_temp.expense_line('e1400000-0000-0000-0000-000000000009','e1300000-0000-0000-0000-000000000004','1','10000')))$q$,'expense purchase rejects same-owner product in another branch');
select pg_temp.rejects($q$select public.admin_record_expenses('e1200000-0000-0000-0000-000000000003','e1500000-0000-0000-0000-000000000006','2026-11-12','daily','[]')$q$,'expense purchase rejects foreign-owner branch');
select public.admin_record_expenses('e1200000-0000-0000-0000-000000000001','e1500000-0000-0000-0000-000000000007','2026-11-12','daily',jsonb_build_array(pg_temp.expense_line('e1400000-0000-0000-0000-000000000010',null,null,'15000')),'e1700000-0000-0000-0000-000000000001');
select pg_temp.assert_true((select supplier_name='Fixture supplier' from public.expenses where entry_group_id='e1500000-0000-0000-0000-000000000007'),'supplier persists even without quantified purchase lines');
set local role anon;
select pg_temp.rejects($q$select public.admin_record_stock('e1200000-0000-0000-0000-000000000001','e1600000-0000-0000-0000-000000000010','[]')$q$,'anonymous callers cannot invoke stock RPC');
reset role;
rollback;
