SET local check_function_bodies = off;

CREATE TABLE "public"."book_period_rules" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "business_id"    uuid                     NOT NULL,
  "start_day"      integer                  NOT NULL,
  "effective_from" date                     NOT NULL DEFAULT '2000-01-01'::date,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "book_period_rules_business_id_effective_from_key" UNIQUE (business_id, effective_from),
  CONSTRAINT "book_period_rules_pkey" PRIMARY KEY (id),
  CONSTRAINT "book_period_rules_start_day_check" CHECK (((start_day >= 1) AND (start_day <= 28)))
);

ALTER TABLE "public"."book_period_rules"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."businesses" (
  "id"                    uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "name"                  text                     NOT NULL,
  "address"               text,
  "last_synced_at"        timestamp with time zone,
  "last_device_code"      text,
  "created_at"            timestamp with time zone NOT NULL DEFAULT now(),
  "pos_config"            jsonb,
  "pos_config_updated_at" timestamp with time zone,
  CONSTRAINT "businesses_pkey" PRIMARY KEY (id),
  "owner_id"              uuid                     NOT NULL DEFAULT auth.uid()
);

ALTER TABLE "public"."businesses"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."deleted_records" (
  "business_id" uuid                     NOT NULL,
  "kind"        text                     NOT NULL,
  "id"          text                     NOT NULL,
  "deleted_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "deleted_records_pkey" PRIMARY KEY (business_id, kind, id)
);

ALTER TABLE "public"."deleted_records"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."expenses" (
  "business_id" uuid                     NOT NULL,
  "id"          text                     NOT NULL,
  "scope"       text                     NOT NULL,
  "date"        text                     NOT NULL,
  "category"    text,
  "amount"      numeric(14,2)            NOT NULL DEFAULT 0,
  "note"        text,
  "from_drawer" boolean                  NOT NULL DEFAULT false,
  "shift_id"    text,
  "created_by"  text,
  "created_at"  timestamp with time zone,
  "synced_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "expenses_pkey" PRIMARY KEY (business_id, id)
);

ALTER TABLE "public"."expenses"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."manual_summaries" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "business_id" uuid                     NOT NULL,
  "period"      text                     NOT NULL,
  "date"        text                     NOT NULL,
  "sales"       numeric(14,2)            NOT NULL DEFAULT 0,
  "expenses"    numeric(14,2)            NOT NULL DEFAULT 0,
  "note"        text,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "overpay"     numeric(14,2)            NOT NULL DEFAULT 0,
  CONSTRAINT "manual_summaries_business_id_period_date_key" UNIQUE (business_id, period, date),
  CONSTRAINT "manual_summaries_check" CHECK ((((period = 'day'::text) AND (date ~ '^\d{4}-\d{2}-\d{2}$'::text)) OR ((period = 'month'::text) AND (date ~ '^\d{4}-\d{2}$'::text)))),
  CONSTRAINT "manual_summaries_expenses_check" CHECK ((expenses >= (0)::numeric)),
  CONSTRAINT "manual_summaries_overpay_check" CHECK ((overpay >= (0)::numeric)),
  CONSTRAINT "manual_summaries_period_check" CHECK ((period = ANY (ARRAY['day'::text, 'month'::text]))),
  CONSTRAINT "manual_summaries_pkey" PRIMARY KEY (id),
  CONSTRAINT "manual_summaries_sales_check" CHECK ((sales >= (0)::numeric))
);

ALTER TABLE "public"."manual_summaries"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."products" (
  "business_id"  uuid                     NOT NULL,
  "id"           text                     NOT NULL,
  "name"         text                     NOT NULL,
  "category_id"  text,
  "price"        numeric(14,2)            NOT NULL DEFAULT 0,
  "cost_price"   numeric(14,2),
  "stock"        integer                  NOT NULL DEFAULT 0,
  "is_available" boolean                  NOT NULL DEFAULT true,
  "raw"          jsonb,
  "synced_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "products_pkey" PRIMARY KEY (business_id, id)
);

ALTER TABLE "public"."products"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."shifts" (
  "business_id"          uuid                     NOT NULL,
  "id"                   text                     NOT NULL,
  "cashier_id"           text,
  "cashier_name"         text,
  "start_time"           timestamp with time zone,
  "end_time"             timestamp with time zone,
  "starting_cash"        numeric(14,2)            NOT NULL DEFAULT 0,
  "ending_cash_actual"   numeric(14,2),
  "expected_cash"        numeric(14,2),
  "total_sales_cash"     numeric(14,2)            NOT NULL DEFAULT 0,
  "total_sales_non_cash" numeric(14,2)            NOT NULL DEFAULT 0,
  "total_sales_debt"     numeric(14,2)            NOT NULL DEFAULT 0,
  "expenses_cash"        numeric(14,2)            NOT NULL DEFAULT 0,
  "total_transactions"   integer                  NOT NULL DEFAULT 0,
  "status"               text,
  "raw"                  jsonb,
  "synced_at"            timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "shifts_pkey" PRIMARY KEY (business_id, id)
);

ALTER TABLE "public"."shifts"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."transactions" (
  "business_id"        uuid                     NOT NULL,
  "id"                 text                     NOT NULL,
  "created_at"         timestamp with time zone NOT NULL,
  "device_code"        text,
  "shift_id"           text,
  "cashier_id"         text,
  "cashier_name"       text,
  "order_type"         text,
  "customer_name"      text,
  "customer_phone"     text,
  "items"              jsonb                    NOT NULL DEFAULT '[]'::jsonb,
  "subtotal"           numeric(14,2)            NOT NULL DEFAULT 0,
  "discount_amount"    numeric(14,2)            NOT NULL DEFAULT 0,
  "discount_reason"    text,
  "tax_amount"         numeric(14,2)            NOT NULL DEFAULT 0,
  "grand_total"        numeric(14,2)            NOT NULL DEFAULT 0,
  "payment_type"       text,
  "payment_detail"     text,
  "amount_paid"        numeric(14,2)            NOT NULL DEFAULT 0,
  "change_amount"      numeric(14,2)            NOT NULL DEFAULT 0,
  "status"             text                     NOT NULL DEFAULT 'completed'::text,
  "cancel_reason"      text,
  "cancelled_at"       timestamp with time zone,
  "cancelled_by"       text,
  "debt_status"        text,
  "debt_paid_at"       timestamp with time zone,
  "debt_paid_method"   text,
  "notes"              text,
  "synced_at"          timestamp with time zone NOT NULL DEFAULT now(),
  "overpay_amount"     numeric(14,2)            NOT NULL DEFAULT 0,
  "debt_paid_shift_id" text,
  CONSTRAINT "transactions_pkey" PRIMARY KEY (business_id, id)
);

ALTER TABLE "public"."transactions"
  ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.anchor_date (
  p text
)
  RETURNS date
  LANGUAGE sql
  IMMUTABLE
  AS $function$
  select case
    when p ~ '^\d{4}-\d{2}-\d{2}$' then p::date
    when p ~ '^\d{4}-\d{2}$' then (p || '-01')::date
  end
$function$;

CREATE OR REPLACE FUNCTION public.book_period (
  p_business uuid,
  d          date
)
  RETURNS TABLE (
    start_date date,
    end_date   date
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  with r as (
    select
      coalesce(cur.start_day, 1) as sd,
      coalesce(cur.effective_from, date '-infinity') as ef,
      (select min(n.effective_from) from public.book_period_rules n
        where n.business_id = p_business and n.effective_from > d) as next_ef
    from (select 1) one
    left join lateral (
      select start_day, effective_from from public.book_period_rules
      where business_id = p_business and effective_from <= d
      order by effective_from desc limit 1
    ) cur on true
  ),
  s as (
    select sd, next_ef,
      greatest(
        case when d < date_trunc('month', d)::date + (sd - 1)
          then (date_trunc('month', d) - interval '1 month')::date + (sd - 1)
          else date_trunc('month', d)::date + (sd - 1)
        end,
        ef
      ) as st
    from r
  )
  select st,
    least(
      case when date_trunc('month', st)::date + (sd - 1) > st
        then date_trunc('month', st)::date + (sd - 1)
        else (date_trunc('month', st) + interval '1 month')::date + (sd - 1)
      end,
      coalesce(next_ef, date 'infinity')
    ) - 1
  from s
$function$;

REVOKE ALL ON FUNCTION "public"."book_period"(uuid, date) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.book_recap (
  p_business uuid,
  p_limit    integer DEFAULT 36
)
  RETURNS TABLE (
    start_date      date,
    end_date        date,
    sales_pos       numeric,
    sales_manual    numeric,
    expenses_pos    numeric,
    expenses_manual numeric,
    overpay_pos     numeric,
    overpay_manual  numeric,
    tx_count        bigint
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  with rows_by_day as (
    select business_id, (created_at at time zone 'Asia/Jakarta')::date as d,
      sum(grand_total) as sp, 0::numeric as sm, 0::numeric as ep, 0::numeric as em,
      sum(overpay_amount) as op, 0::numeric as om, count(*) as c
    from public.transactions
    where status = 'completed' and (p_business is null or business_id = p_business)
    group by 1, 2
    union all
    select business_id, public.anchor_date(date), 0, 0, sum(amount), 0, 0, 0, 0
    from public.expenses
    where (p_business is null or business_id = p_business) and public.anchor_date(date) is not null
    group by 1, 2
    union all
    select business_id, public.anchor_date(date), 0, sum(sales), 0, sum(expenses), 0, sum(overpay), 0
    from public.manual_summaries
    where (p_business is null or business_id = p_business)
    group by 1, 2
  )
  select p.start_date, p.end_date,
    sum(r.sp), sum(r.sm), sum(r.ep), sum(r.em), sum(r.op), sum(r.om), sum(r.c)::bigint
  from rows_by_day r, lateral public.book_period(r.business_id, r.d) p
  group by 1, 2
  order by 1 desc
  limit greatest(p_limit, 1)
$function$;

REVOKE ALL ON FUNCTION "public"."book_recap"(uuid, integer) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.dashboard_summary (
  p_business uuid,
  p_days     integer DEFAULT 7
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  with params as (
    select
      (now() at time zone 'Asia/Jakarta')::date as today,
      (now() at time zone 'Asia/Jakarta')::date - (greatest(p_days, 1) - 1) as first_day
  ),
  tx as (
    select t.*, (t.created_at at time zone 'Asia/Jakarta')::date as day
    from public.transactions t, params
    where t.status = 'completed'
      and (p_business is null or t.business_id = p_business)
      and t.created_at >= (params.first_day::timestamp at time zone 'Asia/Jakarta')
  ),
  days as (
    select d::date as day from params, generate_series(params.first_day, params.today, interval '1 day') d
  ),
  manual_day as (
    select m.date::date as day, sum(m.sales) as sales
    from public.manual_summaries m, params
    where m.period = 'day'
      and (p_business is null or m.business_id = p_business)
      and m.date >= to_char(params.first_day, 'YYYY-MM-DD')
    group by 1
  ),
  daily as (
    select days.day,
      coalesce(sum(tx.grand_total), 0) + coalesce((select md.sales from manual_day md where md.day = days.day), 0) as sales,
      count(tx.id) as count
    from days left join tx on tx.day = days.day
    group by days.day
  ),
  top as (
    select coalesce(item->'product'->>'name', 'Lainnya') as name, sum(coalesce((item->>'quantity')::numeric, 0)) as qty
    from tx, jsonb_array_elements(tx.items) item
    group by 1
    order by 2 desc
    limit 5
  ),
  cur_period as (
    select b.id as business_id, p.start_date, p.end_date
    from public.businesses b, params, lateral public.book_period(b.id, params.today) p
    where (p_business is null or b.id = p_business)
  )
  select jsonb_build_object(
    'today', (select today from params),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'sales', sales, 'count', count) order by day), '[]'::jsonb) from daily),
    'top_products', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'qty', qty)), '[]'::jsonb) from top),
    'unpaid_debt', (
      select coalesce(sum(grand_total), 0) from public.transactions
      where payment_type = 'hutang' and debt_status = 'unpaid' and status = 'completed'
        and (p_business is null or business_id = p_business)
    ),
    'period_start', (select case when count(*) = 1 then min(start_date) end from cur_period),
    'period_end', (select case when count(*) = 1 then min(end_date) end from cur_period),
    'period_sales', (
      select coalesce(sum(t.grand_total), 0)
      from public.transactions t join cur_period c on c.business_id = t.business_id
      where t.status = 'completed'
        and (t.created_at at time zone 'Asia/Jakarta')::date between c.start_date and c.end_date
    ) + (
      select coalesce(sum(m.sales), 0)
      from public.manual_summaries m join cur_period c on c.business_id = m.business_id
      where public.anchor_date(m.date) between c.start_date and c.end_date
    ),
    'period_overpay', (
      select coalesce(sum(t.overpay_amount), 0)
      from public.transactions t join cur_period c on c.business_id = t.business_id
      where t.status = 'completed'
        and (t.created_at at time zone 'Asia/Jakarta')::date between c.start_date and c.end_date
    ) + (
      select coalesce(sum(m.overpay), 0)
      from public.manual_summaries m join cur_period c on c.business_id = m.business_id
      where public.anchor_date(m.date) between c.start_date and c.end_date
    ),
    'month_expenses', (
      select coalesce(sum(e.amount), 0)
      from public.expenses e join cur_period c on c.business_id = e.business_id
      where public.anchor_date(e.date) between c.start_date and c.end_date
    ) + (
      select coalesce(sum(m.expenses), 0)
      from public.manual_summaries m join cur_period c on c.business_id = m.business_id
      where public.anchor_date(m.date) between c.start_date and c.end_date
    )
  )
$function$;

REVOKE ALL ON FUNCTION "public"."dashboard_summary"(uuid, integer) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.random_token()
  RETURNS text
  LANGUAGE sql
  AS $function$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
$function$;

CREATE OR REPLACE FUNCTION public.sync_token_business_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select id from public.businesses
  where sync_token = nullif((coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb)->>'x-sync-token', '')
  limit 1
$function$;

ALTER TABLE "public"."book_period_rules"
  ADD CONSTRAINT "book_period_rules_business_id_fkey" FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;

ALTER TABLE "public"."deleted_records"
  ADD CONSTRAINT "deleted_records_business_id_fkey" FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;

ALTER TABLE "public"."expenses"
  ADD CONSTRAINT "expenses_business_id_fkey" FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;

ALTER TABLE "public"."manual_summaries"
  ADD CONSTRAINT "manual_summaries_business_id_fkey" FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;

ALTER TABLE "public"."products"
  ADD CONSTRAINT "products_business_id_fkey" FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;

ALTER TABLE "public"."shifts"
  ADD CONSTRAINT "shifts_business_id_fkey" FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;

ALTER TABLE "public"."transactions"
  ADD CONSTRAINT "transactions_business_id_fkey" FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;

CREATE INDEX deleted_records_business_deleted_idx ON public.deleted_records USING btree (business_id, deleted_at);

CREATE INDEX expenses_business_date_idx ON public.expenses USING btree (business_id, date DESC);

CREATE INDEX expenses_business_synced_idx ON public.expenses USING btree (business_id, synced_at);

CREATE INDEX manual_summaries_business_date_idx ON public.manual_summaries USING btree (business_id, date DESC);

CREATE INDEX shifts_business_start_idx ON public.shifts USING btree (business_id, start_time DESC);

CREATE INDEX shifts_business_synced_idx ON public.shifts USING btree (business_id, synced_at);

CREATE INDEX transactions_business_created_idx ON public.transactions USING btree (business_id, created_at DESC);

CREATE INDEX transactions_business_synced_idx ON public.transactions USING btree (business_id, synced_at);

CREATE POLICY "sync token select businesses" ON "public"."businesses"
  FOR SELECT
  TO PUBLIC
  USING ((id = public.sync_token_business_id()));

CREATE POLICY "sync token update businesses" ON "public"."businesses"
  FOR UPDATE
  TO PUBLIC
  USING ((id = public.sync_token_business_id()))
  WITH CHECK ((id = public.sync_token_business_id()));

CREATE POLICY "sync token all deleted_records" ON "public"."deleted_records"
  FOR ALL
  TO PUBLIC
  USING ((business_id = public.sync_token_business_id()))
  WITH CHECK ((business_id = public.sync_token_business_id()));

CREATE POLICY "sync token all expenses" ON "public"."expenses"
  FOR ALL
  TO PUBLIC
  USING ((business_id = public.sync_token_business_id()))
  WITH CHECK ((business_id = public.sync_token_business_id()));

CREATE POLICY "sync token all products" ON "public"."products"
  FOR ALL
  TO PUBLIC
  USING ((business_id = public.sync_token_business_id()))
  WITH CHECK ((business_id = public.sync_token_business_id()));

CREATE POLICY "sync token all shifts" ON "public"."shifts"
  FOR ALL
  TO PUBLIC
  USING ((business_id = public.sync_token_business_id()))
  WITH CHECK ((business_id = public.sync_token_business_id()));

CREATE POLICY "sync token all transactions" ON "public"."transactions"
  FOR ALL
  TO PUBLIC
  USING ((business_id = public.sync_token_business_id()))
  WITH CHECK ((business_id = public.sync_token_business_id()));

GRANT EXECUTE ON FUNCTION "public"."anchor_date"(text) TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."anchor_date"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."anchor_date"(text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."anchor_date"(text) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."book_period"(uuid, date) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."book_period"(uuid, date) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."book_period"(uuid, date) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."book_period"(uuid, date) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."book_recap"(uuid, integer) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."book_recap"(uuid, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."book_recap"(uuid, integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."book_recap"(uuid, integer) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."dashboard_summary"(uuid, integer) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."dashboard_summary"(uuid, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."dashboard_summary"(uuid, integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."dashboard_summary"(uuid, integer) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."random_token"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."random_token"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."random_token"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."random_token"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."sync_token_business_id"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."sync_token_business_id"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."sync_token_business_id"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."sync_token_business_id"() TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."book_period_rules" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."book_period_rules" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."book_period_rules" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."book_period_rules" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."businesses" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."businesses" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."businesses" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."businesses" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."deleted_records" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."deleted_records" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."deleted_records" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."deleted_records" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."expenses" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."expenses" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."expenses" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."expenses" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."manual_summaries" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."manual_summaries" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."manual_summaries" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."manual_summaries" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."products" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."products" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."products" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."products" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."shifts" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."shifts" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."shifts" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."shifts" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."transactions" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."transactions" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."transactions" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."transactions" TO "service_role";

ALTER TABLE "public"."businesses"
  ADD CONSTRAINT "businesses_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX businesses_owner_idx ON public.businesses USING btree (owner_id);

CREATE POLICY "owner all book_period_rules" ON "public"."book_period_rules"
  FOR ALL
  TO PUBLIC
  USING ((business_id IN ( SELECT businesses.id
   FROM public.businesses
  WHERE (businesses.owner_id = auth.uid()))))
  WITH CHECK ((business_id IN ( SELECT businesses.id
   FROM public.businesses
  WHERE (businesses.owner_id = auth.uid()))));

CREATE POLICY "owner delete businesses" ON "public"."businesses"
  FOR DELETE
  TO PUBLIC
  USING ((owner_id = auth.uid()));

CREATE POLICY "owner insert businesses" ON "public"."businesses"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((owner_id = auth.uid()));

CREATE POLICY "owner select businesses" ON "public"."businesses"
  FOR SELECT
  TO PUBLIC
  USING ((owner_id = auth.uid()));

CREATE POLICY "owner update businesses" ON "public"."businesses"
  FOR UPDATE
  TO PUBLIC
  USING ((owner_id = auth.uid()))
  WITH CHECK ((owner_id = auth.uid()));

CREATE POLICY "owner read expenses" ON "public"."expenses"
  FOR SELECT
  TO PUBLIC
  USING ((business_id IN ( SELECT businesses.id
   FROM public.businesses
  WHERE (businesses.owner_id = auth.uid()))));

CREATE POLICY "owner all manual_summaries" ON "public"."manual_summaries"
  FOR ALL
  TO PUBLIC
  USING ((business_id IN ( SELECT businesses.id
   FROM public.businesses
  WHERE (businesses.owner_id = auth.uid()))))
  WITH CHECK ((business_id IN ( SELECT businesses.id
   FROM public.businesses
  WHERE (businesses.owner_id = auth.uid()))));

CREATE POLICY "owner read products" ON "public"."products"
  FOR SELECT
  TO PUBLIC
  USING ((business_id IN ( SELECT businesses.id
   FROM public.businesses
  WHERE (businesses.owner_id = auth.uid()))));

CREATE POLICY "owner read shifts" ON "public"."shifts"
  FOR SELECT
  TO PUBLIC
  USING ((business_id IN ( SELECT businesses.id
   FROM public.businesses
  WHERE (businesses.owner_id = auth.uid()))));

CREATE POLICY "owner read transactions" ON "public"."transactions"
  FOR SELECT
  TO PUBLIC
  USING ((business_id IN ( SELECT businesses.id
   FROM public.businesses
  WHERE (businesses.owner_id = auth.uid()))));

ALTER TABLE "public"."businesses"
  ADD COLUMN "sync_token" text NOT NULL DEFAULT public.random_token();

ALTER TABLE "public"."businesses"
  ADD CONSTRAINT "businesses_sync_token_key" UNIQUE (sync_token);
