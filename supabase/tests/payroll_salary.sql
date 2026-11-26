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
 ('a9100000-0000-0000-0000-000000000001','payroll-owner@example.invalid'),
 ('a9100000-0000-0000-0000-000000000002','payroll-other@example.invalid');
insert into public.businesses(id,owner_id,name) values
 ('a9200000-0000-0000-0000-000000000001','a9100000-0000-0000-0000-000000000001','Payroll fixture'),
 ('a9200000-0000-0000-0000-000000000002','a9100000-0000-0000-0000-000000000002','Other owner');
insert into public.employees(id,business_id,name,base_salary) values
 ('a9300000-0000-0000-0000-000000000001','a9200000-0000-0000-0000-000000000001','Budi',2500000),
 ('a9300000-0000-0000-0000-000000000002','a9200000-0000-0000-0000-000000000001','Sari',2000000),
 ('a9300000-0000-0000-0000-000000000003','a9200000-0000-0000-0000-000000000002','Foreign',1000000);
update public.employees set is_active=false where id='a9300000-0000-0000-0000-000000000002';

set local role authenticated;
select set_config('request.jwt.claim.sub','a9100000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"a9100000-0000-0000-0000-000000000001","role":"authenticated","user_metadata":{"name":"Payroll Owner"}}',true);

select pg_temp.assert_true((select count(*)=2 from public.employees),'owner only sees own employees');

select public.admin_record_salary('a9200000-0000-0000-0000-000000000001','a9400000-0000-0000-0000-000000000001',
  'a9300000-0000-0000-0000-000000000001','2026-11',2500000,'2026-11-30','Transfer');
select pg_temp.assert_true((select count(*)=1 and min(amount)=2500000 and min(category)='Gaji Karyawan' and min(scope)='monthly' and min(date)='2026-11'
  and min(note)='Gaji Budi · Transfer' and min(created_by)='Payroll Owner'
  from public.expenses where salary_payment_id='a9400000-0000-0000-0000-000000000001'),'payment creates one monthly salary expense');
select pg_temp.assert_true((select (public.admin_record_salary('a9200000-0000-0000-0000-000000000001','a9400000-0000-0000-0000-000000000001',
  'a9300000-0000-0000-0000-000000000001','2026-11',2500000,'2026-11-30','Transfer')->>'replayed')::boolean),'same request replays');
select pg_temp.assert_true((select count(*)=1 from public.salary_payments),'replay does not duplicate');

select pg_temp.rejects($$select public.admin_record_salary('a9200000-0000-0000-0000-000000000001','a9400000-0000-0000-0000-000000000001',
  'a9300000-0000-0000-0000-000000000001','2026-11',100,'2026-11-30',null)$$,'reused payment id with different data is rejected');
select pg_temp.rejects($$select public.admin_record_salary('a9200000-0000-0000-0000-000000000001','a9400000-0000-0000-0000-000000000002',
  'a9300000-0000-0000-0000-000000000001','2026-11',2500000,'2026-11-30',null)$$,'second payment for same employee and period is rejected');
select pg_temp.rejects($$select public.admin_record_salary('a9200000-0000-0000-0000-000000000001','a9400000-0000-0000-0000-000000000003',
  'a9300000-0000-0000-0000-000000000002','2026-11',2000000,'2026-11-30',null)$$,'inactive employee cannot be paid');
select pg_temp.rejects($$select public.admin_record_salary('a9200000-0000-0000-0000-000000000001','a9400000-0000-0000-0000-000000000004',
  'a9300000-0000-0000-0000-000000000003','2026-11',1000000,'2026-11-30',null)$$,'employee from another owner cannot be paid');
select pg_temp.rejects($$select public.admin_record_salary('a9200000-0000-0000-0000-000000000002','a9400000-0000-0000-0000-000000000005',
  'a9300000-0000-0000-0000-000000000003','2026-11',1000000,'2026-11-30',null)$$,'foreign branch is rejected');
select pg_temp.rejects($$select public.admin_record_salary('a9200000-0000-0000-0000-000000000001','a9400000-0000-0000-0000-000000000006',
  'a9300000-0000-0000-0000-000000000001','2026-13',1000,'2026-11-30',null)$$,'invalid period is rejected');
select pg_temp.rejects($$select public.admin_record_salary('a9200000-0000-0000-0000-000000000001','a9400000-0000-0000-0000-000000000007',
  'a9300000-0000-0000-0000-000000000001','2026-12',0,'2026-12-30',null)$$,'zero amount is rejected');
select pg_temp.rejects($$insert into public.salary_payments(id,business_id,employee_id,employee_name,period,amount,paid_date,request)
  values('a9400000-0000-0000-0000-000000000008','a9200000-0000-0000-0000-000000000001','a9300000-0000-0000-0000-000000000001','x','2026-10',1,'2026-10-01','{}')$$,
  'owner cannot write salary_payments directly');
select pg_temp.rejects($$delete from public.employees where id='a9300000-0000-0000-0000-000000000001'$$,'employee with payments cannot be deleted');

-- Direct writes to the salary expense (as the sync token client would) are guarded.
reset role;
select pg_temp.rejects($$update public.expenses set amount=1 where salary_payment_id='a9400000-0000-0000-0000-000000000001'$$,'salary expense amount is locked');
select pg_temp.rejects($$update public.expenses set category='Lain-lain' where salary_payment_id='a9400000-0000-0000-0000-000000000001'$$,'salary expense category is locked');
select pg_temp.rejects($$delete from public.expenses where salary_payment_id='a9400000-0000-0000-0000-000000000001'$$,'salary expense cannot be deleted directly');
select pg_temp.rejects($$insert into public.expenses(business_id,id,scope,date,category,amount,salary_payment_id)
  values('a9200000-0000-0000-0000-000000000001','EXP-FAKE','monthly','2026-11','Gaji Karyawan',1,'a9400000-0000-0000-0000-000000000001')$$,'salary expense cannot be inserted directly');
update public.expenses set note='Gaji Budi · koreksi catatan' where salary_payment_id='a9400000-0000-0000-0000-000000000001';
select pg_temp.assert_true((select note='Gaji Budi · koreksi catatan' from public.expenses where salary_payment_id='a9400000-0000-0000-0000-000000000001'),'salary expense note stays editable');

set local role authenticated;
select pg_temp.assert_true((select (public.admin_cancel_salary('a9200000-0000-0000-0000-000000000001','a9400000-0000-0000-0000-000000000001')->>'cancelled')::boolean),'owner cancels payment');
select pg_temp.assert_true((select count(*)=0 from public.salary_payments) and (select count(*)=0 from public.expenses where id='EXP-SALARY-a9400000-0000-0000-0000-000000000001'),'cancel removes payment and expense');
reset role;
select pg_temp.assert_true((select count(*)=1 from public.deleted_records where kind='expense' and id='EXP-SALARY-a9400000-0000-0000-0000-000000000001'),'cancel leaves a tombstone for POS');
set local role authenticated;
select pg_temp.assert_true((select (public.admin_cancel_salary('a9200000-0000-0000-0000-000000000001','a9400000-0000-0000-0000-000000000001')->>'cancelled')::boolean = false),'repeat cancel is a no-op');

select public.admin_record_salary('a9200000-0000-0000-0000-000000000001','a9400000-0000-0000-0000-000000000009',
  'a9300000-0000-0000-0000-000000000001','2026-11',2600000,'2026-11-30',null);
select pg_temp.assert_true((select count(*)=1 from public.salary_payments where period='2026-11'),'period can be paid again after cancel');

-- Deleting a branch still cascades through the guarded salary expense.
reset role;
delete from public.businesses where id='a9200000-0000-0000-0000-000000000001';
select pg_temp.assert_true((select count(*)=0 from public.expenses where business_id='a9200000-0000-0000-0000-000000000001')
  and (select count(*)=0 from public.employees where business_id='a9200000-0000-0000-0000-000000000001'),'branch deletion cascades');

rollback;
