begin;

-- The sync API validates the branch token before using this service-role function.
create or replace function public.record_pos_expense_purchases(p_business uuid, p_expenses jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner uuid;
  batch record;
  item jsonb;
  product public.products;
  existing public.expenses;
  operation uuid;
  original jsonb;
  expense_ids text[];
  line_id uuid;
  line jsonb;
  lines jsonb;
  supplier uuid;
  expense_date text;
  scope text;
  replay boolean;
  deleted boolean;
  results jsonb := '[]'::jsonb;
  batch_results jsonb;
  changed_products uuid[] := '{}'::uuid[];
  batch_products uuid[];
  previous_subject text := current_setting('request.jwt.claim.sub', true);
begin
  select owner_id into owner from public.businesses where id = p_business;
  if owner is null or p_expenses is null or jsonb_typeof(p_expenses) <> 'array'
    or jsonb_array_length(p_expenses) not between 1 and 100 then
    raise exception 'Data pembelian kasir tidak valid.';
  end if;

  perform set_config('request.jwt.claim.sub', owner::text, true);
  for batch in
    select coalesce(value #>> '{pendingPurchase,operationId}', substring(value->>'id' from 11)) as key,
      jsonb_agg(value order by value->>'id') as items
    from jsonb_array_elements(p_expenses) group by 1 order by 1
  loop
    begin
      batch_results := '[]'::jsonb;
      batch_products := '{}'::uuid[];
      operation := batch.key::uuid;
      expense_date := batch.items->0->>'date';
      scope := batch.items->0->>'scope';
      supplier := (batch.items->0 #>> '{pendingPurchase,supplierId}')::uuid;
      expense_ids := array(select value->>'id' from jsonb_array_elements(batch.items));

      if operation is null or exists (
        select 1 from jsonb_array_elements(batch.items) as input(value)
        where (value #>> '{pendingPurchase,businessId}') is distinct from p_business::text
          or coalesce(value->>'id', '') !~ '^EXP-ADMIN-[0-9a-fA-F-]{36}$'
          or value->>'date' is distinct from expense_date or value->>'scope' is distinct from scope
          or (value #>> '{pendingPurchase,supplierId}')::uuid is distinct from supplier
          or coalesce(value->>'createdBy', '') = '' or length(value->>'createdBy') > 150
          or value->>'createdAt' is null
          or (value->>'fromDrawer' = 'true' and (
            scope <> 'daily' or nullif(value->>'shiftId', '') is null or length(value->>'shiftId') > 200))
      ) then
        raise exception 'Data pembelian tidak sesuai dengan cabang, supplier, atau shift kasir.';
      end if;

      perform pg_advisory_xact_lock(hashtextextended(operation::text, 0));
      select entry_request into original from public.expenses
        where business_id = p_business and entry_group_id = operation and entry_position = 0;
      replay := found or exists (
        select 1 from public.expenses where business_id = p_business and entry_group_id = operation
      ) or exists (
        select 1 from public.deleted_records where business_id = p_business and kind = 'expense' and id = any(expense_ids)
      );

      if not replay then
        -- Match the lock order used by inventory and stock opname.
        perform 1 from public.products where business_id = p_business and owner_id = owner
          and inventory_id in (
            select (value #>> '{pendingPurchase,productId}')::uuid from jsonb_array_elements(batch.items)
          ) order by inventory_id for update;
      end if;

      lines := '[]'::jsonb;
      for item in select value from jsonb_array_elements(batch.items)
      loop
        line_id := substring(item->>'id' from 11)::uuid;
        line := jsonb_build_object(
          'id', line_id, 'product_id', item #>> '{pendingPurchase,productId}',
          'quantity', case when item #>> '{pendingPurchase,productId}' is not null then item->'quantity' end,
          'item_unit_id', item #>> '{pendingPurchase,itemUnitId}',
          'amount', item->'amount', 'category', item->'category', 'note', item->'note',
          'pos', jsonb_build_object('cashier', item->>'createdBy', 'created_at', item->>'createdAt',
            'from_drawer', coalesce(item->>'fromDrawer' = 'true', false), 'shift_id', item->>'shiftId')
        );

        if item #>> '{pendingPurchase,productId}' is null and item->>'quantity' is not null then
          line := line || jsonb_build_object(
            'recorded_quantity', inventory_private.admin_number(item->>'quantity', 'Jumlah', true)
          );
        end if;

        if original is not null then
          line := line || jsonb_build_object('version', (
            select value->'version' from jsonb_array_elements(original->'lines') where value->>'id' = line_id::text
          ));
        elsif not replay then
          if item #>> '{pendingPurchase,productId}' is null then
            line := line || jsonb_build_object('version', null);
          else
            select * into product from public.products where business_id = p_business and owner_id = owner
              and inventory_id = (item #>> '{pendingPurchase,productId}')::uuid;
            if not found or not product.is_active or not product.can_buy then
              raise exception 'Produk sudah tidak tersedia untuk pembelian di cabang ini.';
            end if;
            line := line || jsonb_build_object('version', product.updated_at);
          end if;
        end if;
        lines := lines || jsonb_build_array(line);
      end loop;

      if original is not null and original is distinct from jsonb_build_object(
        'date', expense_date, 'scope', scope, 'lines', lines, 'supplier', supplier
      ) then
        raise exception 'Identitas pembelian sudah digunakan dengan data berbeda.';
      end if;

      if not replay then
        perform public.admin_record_expenses(p_business, operation, expense_date, scope, lines, supplier);
      end if;

      for item in select value from jsonb_array_elements(batch.items)
      loop
        if not replay then
          update public.expenses set
            created_at = (item->>'createdAt')::timestamptz, created_by = item->>'createdBy',
            from_drawer = coalesce(item->>'fromDrawer' = 'true', false),
            shift_id = case when item->>'fromDrawer' = 'true' then item->>'shiftId' end,
            quantity = case when product_id is null then (item->>'quantity')::numeric else quantity end
          where business_id = p_business and id = item->>'id' and entry_group_id = operation
          returning * into strict existing;
          if existing.purchase_line_id is not null then
            batch_products := array_append(batch_products, existing.product_id);
          end if;
        else
          select * into existing from public.expenses
            where business_id = p_business and id = item->>'id' and entry_group_id = operation;
          if not found then
            select exists(select 1 from public.deleted_records where business_id = p_business
              and kind = 'expense' and id = item->>'id') into deleted;
            if not deleted then raise exception 'Identitas pembelian sudah digunakan dengan data berbeda.'; end if;
            batch_results := batch_results || jsonb_build_array(jsonb_build_object('id', item->>'id', 'deleted', true));
            continue;
          end if;
        end if;
        batch_results := batch_results || jsonb_build_array(jsonb_build_object(
          'id', existing.id, 'serverVersion', existing.synced_at, 'purchaseLineId', existing.purchase_line_id,
          'productName', existing.product_name, 'quantity', existing.quantity, 'unitLabel', existing.unit_label,
          'supplierName', existing.supplier_name, 'entryGroupId', existing.entry_group_id
        ));
      end loop;
      results := results || batch_results;
      changed_products := changed_products || batch_products;
    exception when raise_exception then
      results := results || (
        select jsonb_agg(jsonb_build_object('id', value->>'id', 'error', sqlerrm))
        from jsonb_array_elements(batch.items)
      );
    when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
      results := results || (
        select jsonb_agg(jsonb_build_object('id', value->>'id', 'error', 'Data pembelian tidak valid.'))
        from jsonb_array_elements(batch.items)
      );
    end;
  end loop;

  -- Publish updated balances only for tracked purchases already listed in the POS menu.
  if cardinality(changed_products) > 0 then
    update public.businesses b set pos_config = jsonb_set(b.pos_config, '{products}', (
      select jsonb_agg(case when p.inventory_id is null then config.item
        else jsonb_set(config.item, '{stock}', to_jsonb(p.stock)) end order by config.position)
      from jsonb_array_elements(case when jsonb_typeof(b.pos_config->'products') = 'array' then b.pos_config->'products' else '[]'::jsonb end)
        with ordinality as config(item, position)
      left join public.products p on p.business_id = b.id and p.id = config.item->>'id'
        and p.inventory_id = any(changed_products) and p.stock >= 0 and p.can_sell
    )), pos_config_updated_at = greatest(clock_timestamp(), b.pos_config_updated_at + interval '1 millisecond')
    where b.id = p_business and exists (
      select 1 from jsonb_array_elements(case when jsonb_typeof(b.pos_config->'products') = 'array' then b.pos_config->'products' else '[]'::jsonb end) as config(item)
      join public.products p on p.business_id = b.id and p.id = config.item->>'id'
      where p.inventory_id = any(changed_products) and p.stock >= 0 and p.can_sell
    );
  end if;
  perform set_config('request.jwt.claim.sub', coalesce(previous_subject, ''), true);
  return results;
end $$;

revoke all on function public.record_pos_expense_purchases(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.record_pos_expense_purchases(uuid,jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
