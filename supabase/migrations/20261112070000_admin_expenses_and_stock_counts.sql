-- Admin-only expense batches and physical stock counts. POS sync is unchanged.
begin;

alter table public.products add column stock_updated_at timestamptz;
alter table public.products add constraint products_branch_inventory_key unique(business_id,inventory_id);
alter table public.purchase_lines add constraint purchase_lines_branch_product_key unique(business_id,product_id,id);
alter table public.item_units add constraint item_units_product_pair_key unique(id,product_id);
alter table public.expenses
  add column product_id uuid,
  add column product_name text,
  add column quantity numeric(18,6) check(quantity>0 and quantity<>'NaN'::numeric),
  add column item_unit_id uuid,
  add column unit_label text,
  add column purchase_line_id uuid,
  add column entry_group_id uuid,
  add column entry_position integer check(entry_position>=0),
  add column entry_request jsonb,
  add column supplier_id uuid references public.suppliers(id),
  add column supplier_name text,
  add foreign key(business_id,product_id) references public.products(business_id,inventory_id),
  add foreign key(item_unit_id,product_id) references public.item_units(id,product_id),
  add foreign key(business_id,product_id,purchase_line_id) references public.purchase_lines(business_id,product_id,id),
  add unique(business_id,entry_group_id,entry_position);
create index expenses_product_idx on public.expenses(business_id,product_id) where product_id is not null;
create index expenses_group_idx on public.expenses(business_id,entry_group_id) where entry_group_id is not null;

create table public.stock_adjustments (
  id uuid primary key,
  business_id uuid not null,
  owner_id uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid not null,
  created_by_name text not null,
  note text not null default '',
  request jsonb not null,
  foreign key(business_id,owner_id) references public.businesses(id,owner_id) on delete cascade,
  unique(id,business_id,owner_id)
);
create table public.stock_adjustment_lines (
  id uuid primary key default gen_random_uuid(),
  adjustment_id uuid not null,
  business_id uuid not null,
  owner_id uuid not null,
  product_id uuid not null,
  product_name text not null,
  unit_code text not null,
  mode text not null check(mode in ('count','usage','damage','addition')),
  quantity numeric(18,6) not null check(quantity>=0 and quantity<>'NaN'::numeric),
  before_stock numeric(18,6) not null check(before_stock>=0),
  after_stock numeric(18,6) not null check(after_stock>=0),
  delta numeric(18,6) generated always as (after_stock-before_stock) stored,
  reason text not null,
  created_at timestamptz not null default now(),
  unique(adjustment_id,product_id),
  foreign key(adjustment_id,business_id,owner_id) references public.stock_adjustments(id,business_id,owner_id) on delete cascade,
  foreign key(business_id,product_id,owner_id) references public.products(business_id,inventory_id,owner_id)
);
create index stock_adjustments_branch_date_idx on public.stock_adjustments(business_id,created_at desc,id);
create index stock_adjustment_lines_product_idx on public.stock_adjustment_lines(business_id,product_id,adjustment_id);
alter table public.stock_adjustments enable row level security;
alter table public.stock_adjustment_lines enable row level security;
create policy "owner read stock adjustments" on public.stock_adjustments for select to authenticated using(owner_id=(select auth.uid()));
create policy "owner read stock lines" on public.stock_adjustment_lines for select to authenticated using(owner_id=(select auth.uid()));
revoke all on public.stock_adjustments,public.stock_adjustment_lines from anon,authenticated;
grant select on public.stock_adjustments,public.stock_adjustment_lines to authenticated;
grant select,insert,update,delete on public.stock_adjustments,public.stock_adjustment_lines to service_role;

create function inventory_private.stamp_stock_update() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_op='INSERT' then
    new.stock_updated_at:=case when new.stock>=0 then clock_timestamp() else null end;
  elsif new.stock is distinct from old.stock or new.stock_updated_at is distinct from old.stock_updated_at then new.stock_updated_at:=clock_timestamp();
  else new.stock_updated_at:=old.stock_updated_at;
  end if;
  return new;
end $$;
create trigger products_stamp_stock before insert or update on public.products
  for each row execute function inventory_private.stamp_stock_update();

create function inventory_private.admin_number(value text, label text, positive boolean default false) returns numeric
language plpgsql immutable set search_path='' as $$
declare result numeric;
begin
  if value is null or value !~ '^\d{1,9}(\.\d{1,6})?$' then raise exception '%: gunakan angka dengan maksimal 6 desimal.',label; end if;
  result:=value::numeric;
  if result>999999999 or (positive and result=0) then raise exception '% di luar batas yang diperbolehkan.',label; end if;
  return result;
end $$;

create function public.admin_record_stock(p_business uuid,p_operation uuid,p_lines jsonb,p_note text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner uuid:=auth.uid(); payload jsonb; previous public.stock_adjustments; item jsonb; p public.products;
  qty numeric; after_qty numeric; mode text; reason text; stamp timestamptz:=clock_timestamp();
begin
  if owner is null or not exists(select 1 from public.businesses where id=p_business and owner_id=owner) then raise exception 'Cabang tidak dapat diakses.'; end if;
  if p_operation is null or jsonb_typeof(p_lines)<>'array' or p_lines is null then raise exception 'Data perubahan stok tidak valid.'; end if;
  if jsonb_array_length(p_lines) not between 1 and 1000 or length(coalesce(p_note,''))>500 then raise exception 'Isi 1 sampai 1000 produk dan catatan maksimal 500 karakter.'; end if;
  payload:=jsonb_build_object('lines',p_lines,'note',coalesce(p_note,''));
  perform pg_advisory_xact_lock(hashtextextended(p_operation::text,0));
  select * into previous from public.stock_adjustments where id=p_operation;
  if found then
    if previous.owner_id<>owner or previous.business_id<>p_business or previous.request<>payload then raise exception 'Identitas operasi sudah digunakan dengan data berbeda.'; end if;
    return jsonb_build_object('id',p_operation,'replayed',true);
  end if;
  if exists(select 1 from jsonb_array_elements(p_lines) x group by x->>'product_id' having count(*)>1) then raise exception 'Satu produk hanya boleh muncul sekali dalam satu opname.'; end if;
  -- Acquire all product locks in deterministic order before processing the document.
  perform 1 from public.products where business_id=p_business and owner_id=owner
    and inventory_id in (select (x->>'product_id')::uuid from jsonb_array_elements(p_lines) x) order by inventory_id for update;
  insert into public.stock_adjustments(id,business_id,owner_id,created_by,created_by_name,note,request)
    values(p_operation,p_business,owner,owner,left(coalesce(auth.jwt()->'user_metadata'->>'name',auth.jwt()->>'email','Owner'),150),coalesce(p_note,''),payload);
  for item in select value from jsonb_array_elements(p_lines) loop
    select * into p from public.products where inventory_id=(item->>'product_id')::uuid and business_id=p_business and owner_id=owner;
    if not found or not p.is_active then raise exception 'Produk tidak ditemukan pada cabang aktif.'; end if;
    if p.stock<0 then raise exception '%: pelacakan stok tidak aktif.',p.name; end if;
    if p.raw #>> '{_inventory,pending}' is not null then raise exception '%: selesaikan pembelian tertunda terlebih dahulu.',p.name; end if;
    if nullif(item->>'version','') is null or p.updated_at is distinct from (item->>'version')::timestamptz then raise exception '% sudah berubah. Muat ulang sebelum menyimpan.',p.name; end if;
    mode:=item->>'mode'; reason:=btrim(coalesce(item->>'reason',''));
    if mode is null or mode not in ('count','usage','damage','addition') or length(reason)>500 then raise exception 'Jenis pencatatan atau alasan tidak valid.'; end if;
    if mode<>'count' and reason='' then raise exception 'Alasan wajib diisi untuk pemakaian, kerusakan, atau penambahan.'; end if;
    qty:=inventory_private.admin_number(item->>'quantity','Jumlah',mode<>'count');
    after_qty:=case mode when 'count' then qty when 'addition' then p.stock+qty else p.stock-qty end;
    if after_qty<0 or after_qty>999999999 then raise exception '%: stok akhir di luar batas yang diperbolehkan.',p.name; end if;
    insert into public.stock_adjustment_lines(adjustment_id,business_id,owner_id,product_id,product_name,unit_code,mode,quantity,before_stock,after_stock,reason)
      select p_operation,p_business,owner,p.inventory_id,p.name,u.code,mode,qty,p.stock,after_qty,coalesce(nullif(reason,''),'Hitung fisik') from public.units u where u.id=p.base_unit_id;
    update public.products set stock=after_qty,stock_updated_at=stamp where inventory_id=p.inventory_id;
    -- A count that confirms the same balance is still a stock update event.
  end loop;
  return jsonb_build_object('id',p_operation,'replayed',false);
end $$;

create function public.admin_record_expenses(p_business uuid,p_operation uuid,p_date text,p_scope text,p_lines jsonb,p_supplier uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner uuid:=auth.uid(); payload jsonb; previous public.expenses; item jsonb; p public.products; unit_row public.item_units;
  line_id uuid; pos integer:=0; qty numeric; total numeric; price numeric; discount numeric; base_qty numeric;
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

revoke all on function public.admin_record_stock(uuid,uuid,jsonb,text) from public,anon;
revoke all on function public.admin_record_expenses(uuid,uuid,text,text,jsonb,uuid) from public,anon;
grant execute on function public.admin_record_stock(uuid,uuid,jsonb,text),public.admin_record_expenses(uuid,uuid,text,text,jsonb,uuid) to authenticated;
revoke all on function inventory_private.stamp_stock_update(),inventory_private.admin_number(text,text,boolean) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
