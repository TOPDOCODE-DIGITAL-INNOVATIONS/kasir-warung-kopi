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
 ('e5100000-0000-0000-0000-000000000001','sync-events-owner@example.invalid'),
 ('e5100000-0000-0000-0000-000000000002','sync-events-other@example.invalid');
insert into public.businesses(id,owner_id,name,sync_token) values
 ('e5200000-0000-0000-0000-000000000001','e5100000-0000-0000-0000-000000000001','Sync events fixture','sync-events-token-a'),
 ('e5200000-0000-0000-0000-000000000002','e5100000-0000-0000-0000-000000000002','Other owner branch','sync-events-token-b');

-- Service role (server /api/sync dengan secret key) boleh mencatat token tidak valid.
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select public.record_sync_event(null,'push',401,'Token sync tidak valid');
select public.record_sync_event('e5200000-0000-0000-0000-000000000001','push',500,repeat('x',900),'KSR-1',1200,5,2,40,3,now()-interval '7 hours','Failed to fetch');
select public.record_sync_event('e5200000-0000-0000-0000-000000000002','pull',200);
reset role;

select pg_temp.assert_true((select count(*) from public.sync_events where business_id is null and http_status=401)=1,'service role records an invalid-token attempt');
select pg_temp.assert_true((select not ok and length(error)=500 and pending_tx=40 and client_error='Failed to fetch' from public.sync_events where business_id='e5200000-0000-0000-0000-000000000001'),'failure is stored with truncated error and device backlog');
select pg_temp.assert_true((select ok from public.sync_events where business_id='e5200000-0000-0000-0000-000000000002'),'2xx status is marked ok');
select pg_temp.rejects($$select public.record_sync_event('e5200000-0000-0000-0000-000000000001','sideways',200)$$,'unknown direction is rejected');

-- Client anon (fallback tanpa secret key) hanya boleh mencatat cabang pemilik token di header.
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select set_config('request.headers','{"x-sync-token":"sync-events-token-a"}',true);
select public.record_sync_event('e5200000-0000-0000-0000-000000000001','pull',200,null,'KSR-1');
select pg_temp.rejects($$select public.record_sync_event('e5200000-0000-0000-0000-000000000002','pull',200)$$,'anon cannot record another branch');
select pg_temp.rejects($$select public.record_sync_event(null,'pull',401)$$,'anon cannot record an unattributed event');
select pg_temp.rejects($$select count(*) from public.sync_events$$,'anon cannot read sync events');
select set_config('request.headers','{}',true);
reset role;
select pg_temp.assert_true((select count(*) from public.sync_events where business_id='e5200000-0000-0000-0000-000000000001')=2,'anon with a matching token records its own branch');

-- Owner hanya melihat cabangnya dan tidak dapat menulis langsung.
set local role authenticated;
select set_config('request.jwt.claim.sub','e5100000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"e5100000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select pg_temp.assert_true((select count(*) from public.sync_events)=2,'owner sees only own branch events');
select pg_temp.rejects($$insert into public.sync_events(business_id,direction,http_status) values ('e5200000-0000-0000-0000-000000000001','push',200)$$,'owner cannot insert directly');
select pg_temp.rejects($$select public.record_sync_event('e5200000-0000-0000-0000-000000000001','push',200)$$,'owner session cannot call the recorder');
reset role;

-- Cabang dihapus -> event ikut terhapus.
delete from public.businesses where id='e5200000-0000-0000-0000-000000000002';
select pg_temp.assert_true(not exists(select 1 from public.sync_events where business_id='e5200000-0000-0000-0000-000000000002'),'events cascade with their branch');

rollback;
