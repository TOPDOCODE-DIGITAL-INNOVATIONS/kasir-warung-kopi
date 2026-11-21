-- HPP verification, cost from the latest purchase, and purchase correction.
-- * products.cost_verified_at: null = HPP belum dicek (all existing rows start here).
--   Any cost change that does not set a new verification stamp clears it, so a POS
--   menu edit or an unverified write can never keep a stale "sudah dicek" mark.
-- * admin_record_expenses: a product purchase with a quantity sets the product HPP to
--   the purchase price per base unit (verified, real data) and publishes it to the POS.
-- * admin_cancel_purchase: cancels a posted purchase document as a correction. The
--   document stays (status cancelled + reason), stock is reversed through an audited
--   stock adjustment, and its expense rows are removed so they no longer count.
begin;

alter table public.products add column cost_verified_at timestamptz;

create function inventory_private.reset_cost_verification() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.cost_price is distinct from old.cost_price and new.cost_verified_at is not distinct from old.cost_verified_at then
    new.cost_verified_at := null;
  end if;
  return new;
end $$;
create trigger products_reset_cost_verification before update on public.products
  for each row execute function inventory_private.reset_cost_verification();

-- Update one POS product's HPP inside the branch config so the cashier receives it.
create function inventory_private.push_pos_cost(p_business uuid, p_pos_id text, p_cost numeric, p_verified boolean) returns void
language plpgsql set search_path = '' as $$
begin
  update public.businesses b set
    pos_config = jsonb_set(b.pos_config, '{products}', (
      select coalesce(jsonb_agg(case when x.e->>'id' = p_pos_id
        then x.e || jsonb_build_object('costPrice', p_cost, 'costVerified', p_verified) else x.e end order by x.ord), '[]'::jsonb)
      from jsonb_array_elements(b.pos_config->'products') with ordinality x(e, ord))),
    pos_config_updated_at = greatest(clock_timestamp(), coalesce(b.pos_config_updated_at + interval '1 millisecond', clock_timestamp()))
  where b.id = p_business and jsonb_typeof(b.pos_config->'products') = 'array'
    and exists (select 1 from jsonb_array_elements(b.pos_config->'products') e where e->>'id' = p_pos_id);
end $$;

create or replace function public.admin_record_expenses(p_business uuid,p_operation uuid,p_date text,p_scope text,p_lines jsonb,p_supplier uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner uuid:=auth.uid(); payload jsonb; previous public.expenses; item jsonb; p public.products; unit_row public.item_units;
  line_id uuid; pos integer:=0; qty numeric; total numeric; price numeric; discount numeric; base_qty numeric; unit_cost numeric;
  purchase_id uuid; any_purchase boolean:=false; actor text; product_name text; unit_name text; category text; note text; vendor_name text;
begin
  if owner is null or not exists(select 1 from public.businesses where id=p_business and owner_id=owner) then raise exception 'Cabang tidak dapat diakses.'; end if;
  if p_operation is null or p_lines is null or jsonb_typeof(p_lines)<>'array' then raise exception 'Data pengeluaran tidak valid.'; end if;
  if jsonb_array_length(p_lines) not between 1 and 100 then raise exception 'Isi 1 sampai 100 baris pengeluaran.'; end if;
  if p_scope='daily' then
    if p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' or to_char(p_date::date,'YYYY-MM-DD')<>p_date then raise exception 'Tanggal pengeluaran tidak valid.'; end if;
  elsif p_scope='monthly' then
    if p_date is null or p_date !~ '^\d{4}-\d{2}$' or to_char((p_date||'-01')::date,'YYYY-MM')<>p_date then raise exception 'Bulan pengeluaran tidak valid.'; end if;
  else raise exception 'Pilih pengeluaran harian atau bulanan.'; end if;
  if p_supplier is not null and not exists(select 1 from public.suppliers where id=p_supplier and owner_id=owner and is_active) then raise exception 'Supplier tidak dapat diakses.'; end if;
  select name into vendor_name from public.suppliers where id=p_supplier and owner_id=owner;
  payload:=jsonb_build_object('date',p_date,'scope',p_scope,'lines',p_lines,'supplier',p_supplier);
  perform pg_advisory_xact_lock(hashtextextended(p_operation::text,0));
  select * into previous from public.expenses where business_id=p_business and entry_group_id=p_operation and entry_position=0;
  if found then
    if previous.entry_request is distinct from payload or (select count(*) from public.expenses where business_id=p_business and entry_group_id=p_operation)<>jsonb_array_length(p_lines) then raise exception 'Kelompok pengeluaran sudah ada dengan data berbeda atau sudah dihapus sebagian.'; end if;
    return jsonb_build_object('id',p_operation,'replayed',true);
  end if;
  if exists(select 1 from public.expenses where entry_group_id=p_operation) or exists(select 1 from public.purchases where id=p_operation) or exists(select 1 from public.stock_adjustments where id=p_operation) then raise exception 'Identitas operasi sudah digunakan. Buka ulang form.'; end if;
  if exists(select 1 from jsonb_array_elements(p_lines) x group by x->>'id' having count(*)>1) then raise exception 'Identitas baris pengeluaran harus unik.'; end if;
  if exists(select 1 from jsonb_array_elements(p_lines) x where nullif(x->>'product_id','') is not null group by x->>'product_id' having count(*)>1) then raise exception 'Gabungkan jumlah pembelian produk yang sama dalam satu baris.'; end if;
  perform 1 from public.products where business_id=p_business and owner_id=owner
    and inventory_id in (select nullif(x->>'product_id','')::uuid from jsonb_array_elements(p_lines) x) order by inventory_id for update;
  actor:=left(coalesce(auth.jwt()->'user_metadata'->>'name',auth.jwt()->>'email','Owner'),150);
  for item in select value from jsonb_array_elements(p_lines) loop
    line_id:=(item->>'id')::uuid;
    if line_id is null then raise exception 'Identitas baris tidak valid.'; end if;
    total:=inventory_private.admin_number(item->>'amount','Nominal',true);
    if total<>round(total,2) then raise exception 'Nominal pengeluaran maksimal 2 angka desimal.'; end if;
    category:=btrim(coalesce(item->>'category','')); note:=btrim(coalesce(item->>'note',''));
    if category='' or length(category)>100 or length(note)>500 then raise exception 'Kategori wajib diisi; kategori maksimal 100 dan catatan 500 karakter.'; end if;
    p:=null; unit_row:=null; qty:=null; product_name:=null; unit_name:=null;
    if nullif(item->>'product_id','') is not null then
      select * into p from public.products where inventory_id=(item->>'product_id')::uuid and business_id=p_business and owner_id=owner;
      if not found or not p.is_active or not p.can_buy then raise exception 'Pilih produk beli aktif pada cabang ini.'; end if;
      product_name:=p.name;
      if p.raw #>> '{_inventory,pending}' is not null then raise exception '%: selesaikan pembelian tertunda terlebih dahulu.',p.name; end if;
      if nullif(item->>'version','') is null or p.updated_at is distinct from (item->>'version')::timestamptz then raise exception '% sudah berubah. Muat ulang sebelum menyimpan.',p.name; end if;
      if p.stock>=0 and nullif(item->>'quantity','') is null then raise exception '%: jumlah dan satuan wajib untuk stok yang dilacak.',p.name; end if;
      if nullif(item->>'quantity','') is not null then
        qty:=inventory_private.admin_number(item->>'quantity','Jumlah pembelian',true);
        if nullif(item->>'item_unit_id','') is null then
          insert into public.item_units(owner_id,product_id,unit_id,label,factor_to_base)
            select owner,p.inventory_id,u.id,u.code,1 from public.units u where u.id=p.base_unit_id on conflict(product_id,label) do nothing;
          select * into unit_row from public.item_units where product_id=p.inventory_id and unit_id=p.base_unit_id and factor_to_base=1 and is_active order by id limit 1;
        else
          select * into unit_row from public.item_units where id=(item->>'item_unit_id')::uuid and product_id=p.inventory_id and owner_id=owner and is_active;
        end if;
        if unit_row.id is null then raise exception 'Satuan pembelian tidak sesuai produk.'; end if;
        unit_name:=unit_row.label;
        base_qty:=qty*unit_row.factor_to_base;
        if base_qty<>round(base_qty,6) or base_qty>999999999 then raise exception 'Jumlah dalam satuan dasar melebihi presisi atau batas stok.'; end if;
        if p.stock>=0 and p.stock+base_qty>999999999 then raise exception 'Stok akhir melebihi batas.'; end if;
        if not any_purchase then
          purchase_id:=p_operation;
          insert into public.purchases(id,owner_id,business_id,supplier_id,document_number,purchased_at,notes)
            values(purchase_id,owner,p_business,p_supplier,'EXP-'||p_operation,((case when p_scope='monthly' then p_date||'-01' else p_date end)||'T12:00:00+07:00')::timestamptz,'Pembelian dari pengeluaran admin');
          any_purchase:=true;
        end if;
        -- Keep the expense amount exact, even when total/quantity is a repeating fraction.
        price:=ceil(total/qty*1000000)/1000000;
        discount:=round(qty*price,6)-total;
        insert into public.purchase_lines(id,owner_id,business_id,purchase_id,product_id,item_unit_id,quantity,unit_price,discount_amount,notes)
          values(line_id,owner,p_business,purchase_id,p.inventory_id,unit_row.id,qty,price,discount,note);
        if p.stock>=0 then update public.products set stock=stock+base_qty where inventory_id=p.inventory_id; end if;
        -- HPP follows the latest purchase price per base unit.
        unit_cost:=round(total/base_qty,6);
        update public.products set cost_price=unit_cost, cost_verified_at=clock_timestamp() where inventory_id=p.inventory_id;
        if p.can_sell then perform inventory_private.push_pos_cost(p_business,p.id,unit_cost,true); end if;
      end if;
    elsif nullif(item->>'quantity','') is not null or nullif(item->>'item_unit_id','') is not null then raise exception 'Lain-lain tidak memerlukan jumlah atau satuan produk.';
    elsif note='' then raise exception 'Keterangan wajib diisi untuk Lain-lain.';
    end if;
    insert into public.expenses(business_id,id,scope,date,category,amount,note,from_drawer,created_by,created_at,product_id,product_name,quantity,item_unit_id,unit_label,purchase_line_id,entry_group_id,entry_position,entry_request,supplier_id,supplier_name)
      values(p_business,'EXP-ADMIN-'||line_id,p_scope,p_date,category,total,nullif(note,''),false,actor,clock_timestamp(),p.inventory_id,product_name,qty,unit_row.id,unit_name,case when qty is not null then line_id end,p_operation,pos,case when pos=0 then payload end,p_supplier,vendor_name);
    pos:=pos+1;
  end loop;
  if any_purchase then update public.purchases set status='posted' where id=purchase_id; end if;
  return jsonb_build_object('id',p_operation,'replayed',false);
end $$;

alter table public.stock_adjustment_lines drop constraint if exists stock_adjustment_lines_mode_check;
alter table public.stock_adjustment_lines add constraint stock_adjustment_lines_mode_check
  check (mode in ('count','usage','damage','addition','correction'));

create function public.admin_cancel_purchase(p_business uuid, p_purchase uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner uuid := auth.uid(); doc public.purchases; line record; p public.products; reason text := btrim(coalesce(p_reason, ''));
  adjustment uuid := gen_random_uuid(); adjusted boolean := false; latest numeric; stamp timestamptz := clock_timestamp(); removed integer := 0;
begin
  if owner is null or not exists (select 1 from public.businesses where id = p_business and owner_id = owner) then raise exception 'Cabang tidak dapat diakses.'; end if;
  if reason = '' or length(reason) > 300 then raise exception 'Alasan koreksi wajib diisi, maksimal 300 karakter.'; end if;
  select * into doc from public.purchases where id = p_purchase and business_id = p_business and owner_id = owner for update;
  if not found then raise exception 'Dokumen pembelian tidak ditemukan di cabang ini.'; end if;
  if doc.status = 'cancelled' then return jsonb_build_object('id', p_purchase, 'replayed', true); end if;
  if doc.status <> 'posted' then raise exception 'Pembelian ini belum selesai dicatat. Selesaikan melalui Riwayat produk.'; end if;
  if exists (select 1 from public.expenses e join public.purchase_lines pl on pl.id = e.purchase_line_id
             where pl.purchase_id = p_purchase and e.business_id = p_business and e.from_drawer) then
    raise exception 'Pembelian ini dibayar dari laci kasir. Uang laci sudah keluar, jadi koreksinya dilakukan melalui aplikasi kasir.';
  end if;
  perform 1 from public.products where business_id = p_business and owner_id = owner
    and inventory_id in (select product_id from public.purchase_lines where purchase_id = p_purchase) order by inventory_id for update;

  for line in select pl.product_id, sum(pl.quantity_base) as qty from public.purchase_lines pl
              where pl.purchase_id = p_purchase group by pl.product_id loop
    select * into p from public.products where inventory_id = line.product_id and business_id = p_business and owner_id = owner;
    if p.stock >= 0 then
      if p.stock < line.qty then
        raise exception '%: stok tercatat (%) lebih kecil dari jumlah pembelian yang dibatalkan (%). Lakukan Stok Opname dulu, lalu ulangi koreksi.',
          p.name, trim_scale(p.stock), trim_scale(line.qty);
      end if;
      if not adjusted then
        insert into public.stock_adjustments(id, business_id, owner_id, created_by, created_by_name, note, request)
          values (adjustment, p_business, owner, owner, left(coalesce(auth.jwt()->'user_metadata'->>'name', auth.jwt()->>'email', 'Owner'), 150),
            'Koreksi pembelian ' || doc.document_number, jsonb_build_object('purchase', p_purchase, 'reason', reason));
        adjusted := true;
      end if;
      insert into public.stock_adjustment_lines(adjustment_id, business_id, owner_id, product_id, product_name, unit_code, mode, quantity, before_stock, after_stock, reason)
        select adjustment, p_business, owner, p.inventory_id, p.name, u.code, 'correction', line.qty, p.stock, p.stock - line.qty, 'Koreksi pembelian: ' || reason
        from public.units u where u.id = p.base_unit_id;
      update public.products set stock = stock - line.qty, stock_updated_at = stamp where inventory_id = p.inventory_id;
    end if;
  end loop;

  update public.purchases set status = 'cancelled', cancel_reason = reason where id = p_purchase;

  insert into public.deleted_records(business_id, kind, id, deleted_at)
    select e.business_id, 'expense', e.id, stamp from public.expenses e join public.purchase_lines pl on pl.id = e.purchase_line_id
    where pl.purchase_id = p_purchase and e.business_id = p_business
    on conflict (business_id, kind, id) do update set deleted_at = excluded.deleted_at;
  delete from public.expenses e using public.purchase_lines pl
    where pl.id = e.purchase_line_id and pl.purchase_id = p_purchase and e.business_id = p_business;
  get diagnostics removed = row_count;

  -- HPP returns to the latest remaining purchase; without one it must be checked again.
  for line in select distinct product_id from public.purchase_lines where purchase_id = p_purchase loop
    select * into p from public.products where inventory_id = line.product_id and business_id = p_business and owner_id = owner;
    select round(pl.line_total / pl.quantity_base, 6) into latest from public.purchase_lines pl join public.purchases pu on pu.id = pl.purchase_id
      where pl.product_id = p.inventory_id and pl.business_id = p_business and pu.status = 'posted'
      order by pu.purchased_at desc, pl.created_at desc limit 1;
    if latest is not null then
      update public.products set cost_price = latest, cost_verified_at = clock_timestamp() where inventory_id = p.inventory_id;
      if p.can_sell then perform inventory_private.push_pos_cost(p_business, p.id, latest, true); end if;
    else
      update public.products set cost_verified_at = null where inventory_id = p.inventory_id;
      if p.can_sell then perform inventory_private.push_pos_cost(p_business, p.id, p.cost_price, false); end if;
    end if;
  end loop;
  return jsonb_build_object('id', p_purchase, 'replayed', false, 'expenses_removed', removed);
end $$;

revoke all on function public.admin_cancel_purchase(uuid, uuid, text) from public, anon;
grant execute on function public.admin_cancel_purchase(uuid, uuid, text) to authenticated;
revoke all on function inventory_private.reset_cost_verification(), inventory_private.push_pos_cost(uuid, text, numeric, boolean) from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
