-- =====================================================================
-- Seeder Data Dummy & Master RUAS KOPI BALI (Supabase / PostgreSQL)
-- Jalankan setelah supabase/schema.sql di Supabase Dashboard -> SQL Editor
-- Aman dijalankan ulang (idempotent).
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

do $$
declare
  v_owner_id uuid := 'e412a609-285e-426f-8b08-e301441b5a08';
  v_business_id uuid := '2730c949-cb96-4922-8c9b-d763393f3fe0';
begin
  -- 1. Buat akun Owner (fajarprayoga23@gmail.com / Cxzdsaewq321) jika belum ada
  select id into v_owner_id from auth.users where email = 'fajarprayoga23@gmail.com' limit 1;
  if v_owner_id is null then
    v_owner_id := 'e412a609-285e-426f-8b08-e301441b5a08';
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000',
      v_owner_id,
      'authenticated',
      'authenticated',
      'fajarprayoga23@gmail.com',
      extensions.crypt('Cxzdsaewq321', extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"name":"Fajar"}'::jsonb,
      now(), now(), '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(),
      v_owner_id,
      v_owner_id::text,
      jsonb_build_object('sub', v_owner_id::text, 'email', 'fajarprayoga23@gmail.com', 'email_verified', true),
      'email',
      now(), now(), now()
    ) on conflict do nothing;
  end if;

  -- 2. Buat cabang usaha RUAS KOPI BALI
  insert into public.businesses (id, owner_id, name, address, sync_token)
  values (
    v_business_id,
    v_owner_id,
    'RUAS KOPI BALI',
    'Bali, Indonesia',
    'd6d35a6821834ae1a95c98caca1e13b0d4acafbf10c94f6292aad752ba6004d1'
  )
  on conflict (id) do update set
    owner_id = excluded.owner_id,
    name = excluded.name,
    address = excluded.address;

  -- 3. Aturan tutup buku (tanggal 26 s/d 25)
  insert into public.book_period_rules (business_id, start_day, effective_from)
  values (v_business_id, 26, date '2000-01-01')
  on conflict (business_id, effective_from) do update set start_day = excluded.start_day;
end $$;

-- 4. Katalog Produk (38 Menu RUAS KOPI BALI)
insert into public.products (business_id, id, name, category_id, price, cost_price, stock, is_available, raw)
values
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'p-1', 'Americano', 'coffee', 18000, 6000, -1, true, '{"id":"p-1","name":"Americano","price":18000,"stock":-1,"colorBg":"bg-stone-200 text-stone-900","options":[{"name":"Suhu","choices":[{"label":"Ice","extraPrice":0},{"label":"Hot","extraPrice":0}]}],"costPrice":6000,"categoryId":"coffee","description":"espresso & water","isAvailable":true}'::jsonb),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'p-2', 'Caffe Latte', 'coffee', 22000, 15000, -1, true, '{"id":"p-2","name":"Caffe Latte","price":22000,"stock":-1,"colorBg":"bg-amber-100 text-amber-900","options":[{"name":"Suhu","choices":[{"label":"Ice","extraPrice":0},{"label":"Hot","extraPrice":0}]}],"costPrice":15000,"categoryId":"coffee","description":"espresso & fresh milk","isAvailable":true}'::jsonb),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'p-3', 'Cappuccino', 'coffee', 22000, 8000, -1, true, '{"id":"p-3","name":"Cappuccino","price":22000,"stock":-1,"colorBg":"bg-amber-200 text-amber-950","options":[{"name":"Suhu","choices":[{"label":"Ice","extraPrice":0},{"label":"Hot","extraPrice":0}]}],"costPrice":8000,"categoryId":"coffee","description":"espresso, fresh milk & milk foam","isAvailable":true}'::jsonb),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'p-4', 'Mochaccino', 'coffee', 22000, 8500, -1, true, '{"id":"p-4","name":"Mochaccino","price":22000,"stock":-1,"colorBg":"bg-amber-900 text-amber-50","options":[{"name":"Suhu","choices":[{"label":"Ice","extraPrice":0}]}],"costPrice":8500,"categoryId":"coffee","description":"espresso, chocolate & fresh milk","isAvailable":true}'::jsonb),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'p-5', 'Caramel Latte', 'coffee', 22000, 8500, -1, true, '{"id":"p-5","name":"Caramel Latte","price":22000,"stock":-1,"colorBg":"bg-orange-100 text-orange-900","options":[{"name":"Suhu","choices":[{"label":"Ice","extraPrice":0}]}],"costPrice":8500,"categoryId":"coffee","description":"espresso, caramel & fresh milk","isAvailable":true}'::jsonb),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'p-6', 'Brown Sugar Latte', 'coffee', 22000, 8500, -1, true, '{"id":"p-6","name":"Brown Sugar Latte","price":22000,"stock":-1,"colorBg":"bg-amber-100 text-amber-950","options":[{"name":"Suhu","choices":[{"label":"Ice","extraPrice":0}]}],"costPrice":8500,"categoryId":"coffee","description":"espresso, brown sugar & fresh milk","isAvailable":true}'::jsonb),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'p-7', 'Butterscotch Latte', 'coffee', 22000, 8500, -1, true, '{"id":"p-7","name":"Butterscotch Latte","price":22000,"stock":-1,"colorBg":"bg-yellow-100 text-yellow-900","options":[{"name":"Suhu","choices":[{"label":"Ice","extraPrice":0}]}],"costPrice":8500,"categoryId":"coffee","description":"espresso, butterscotch & fresh milk","isAvailable":true}'::jsonb),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'p-8', 'Cranberry Coffee', 'coffee', 22000, 8500, -1, true, '{"id":"p-8","name":"Cranberry Coffee","price":22000,"stock":-1,"colorBg":"bg-rose-100 text-rose-900","options":[{"name":"Suhu","choices":[{"label":"Ice","extraPrice":0}]}],"costPrice":8500,"categoryId":"coffee","description":"espresso & cranberry","isAvailable":true}'::jsonb),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'p-9', 'Matcha Latte', 'milky', 22000, 8500, -1, true, '{"id":"p-9","name":"Matcha Latte","price":22000,"stock":-1,"colorBg":"bg-emerald-100 text-emerald-900","options":[{"name":"Suhu","choices":[{"label":"Ice","extraPrice":0},{"label":"Hot","extraPrice":0}]}],"costPrice":8500,"categoryId":"milky","description":"matcha & fresh milk","isAvailable":true}'::jsonb),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'p-10', 'Pure Matcha', 'milky', 20000, 7500, -1, true, '{"id":"p-10","name":"Pure Matcha","price":20000,"stock":-1,"colorBg":"bg-emerald-200 text-emerald-950","options":[{"name":"Suhu","choices":[{"label":"Ice","extraPrice":0},{"label":"Hot","extraPrice":0}]}],"costPrice":7500,"categoryId":"milky","description":"pure matcha","isAvailable":true}'::jsonb),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'p-11', 'Matcha Strawberry', 'milky', 22000, 8500, -1, true, '{"id":"p-11","name":"Matcha Strawberry","price":22000,"stock":-1,"colorBg":"bg-pink-100 text-pink-900","options":[{"name":"Suhu","choices":[{"label":"Ice","extraPrice":0}]}],"costPrice":8500,"categoryId":"milky","description":"matcha, strawberry & fresh milk","isAvailable":true}'::jsonb),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'p-12', 'Classic Tea', 'tea', 10000, 3000, -1, true, '{"id":"p-12","name":"Classic Tea","price":10000,"stock":-1,"colorBg":"bg-amber-100 text-amber-900","options":[{"name":"Suhu","choices":[{"label":"Ice","extraPrice":0},{"label":"Hot","extraPrice":0}]}],"costPrice":3000,"categoryId":"tea","description":"original tea","isAvailable":true}'::jsonb),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'p-13', 'Strawberry Tea', 'tea', 15000, 5000, -1, true, '{"id":"p-13","name":"Strawberry Tea","price":15000,"stock":-1,"colorBg":"bg-rose-100 text-rose-900","options":[{"name":"Suhu","choices":[{"label":"Ice","extraPrice":0},{"label":"Hot","extraPrice":0}]}],"costPrice":5000,"categoryId":"tea","description":"tea & strawberry","isAvailable":true}'::jsonb),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'p-14', 'Lemon Tea', 'tea', 15000, 5000, -1, true, '{"id":"p-14","name":"Lemon Tea","price":15000,"stock":-1,"colorBg":"bg-yellow-100 text-yellow-900","options":[{"name":"Suhu","choices":[{"label":"Ice","extraPrice":0},{"label":"Hot","extraPrice":0}]}],"costPrice":5000,"categoryId":"tea","description":"tea & lemon","isAvailable":true}'::jsonb),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'p-15', 'Ginger Tea', 'tea', 15000, 5000, -1, true, '{"id":"p-15","name":"Ginger Tea","price":15000,"stock":-1,"colorBg":"bg-orange-100 text-orange-900","options":[{"name":"Suhu","choices":[{"label":"Ice","extraPrice":0},{"label":"Hot","extraPrice":0}]}],"costPrice":5000,"categoryId":"tea","description":"tea & ginger","isAvailable":true}'::jsonb),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'p-16', 'Lecy Tea', 'tea', 15000, 5000, -1, true, '{"id":"p-16","name":"Lecy Tea","price":15000,"stock":-1,"colorBg":"bg-pink-100 text-pink-900","options":[{"name":"Suhu","choices":[{"label":"Ice","extraPrice":0},{"label":"Hot","extraPrice":0}]}],"costPrice":5000,"categoryId":"tea","description":"tea & lecy","isAvailable":true}'::jsonb),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'p-17', 'Red Velvet', 'milky', 20000, 7000, -1, true, '{"id":"p-17","name":"Red Velvet","price":20000,"stock":-1,"colorBg":"bg-red-100 text-red-900","options":[{"name":"Suhu","choices":[{"label":"Ice","extraPrice":0}]}],"costPrice":7000,"categoryId":"milky","description":"red velvet & fresh milk","isAvailable":true}'::jsonb),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'p-18', 'Taro', 'milky', 20000, 7000, -1, true, '{"id":"p-18","name":"Taro","price":20000,"stock":-1,"colorBg":"bg-purple-100 text-purple-900","options":[{"name":"Suhu","choices":[{"label":"Ice","extraPrice":0}]}],"costPrice":7000,"categoryId":"milky","description":"taro & fresh milk","isAvailable":true}'::jsonb),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'p-19', 'Chocolate', 'milky', 20000, 7000, -1, true, '{"id":"p-19","name":"Chocolate","price":20000,"stock":-1,"colorBg":"bg-amber-900 text-amber-50","options":[{"name":"Suhu","choices":[{"label":"Ice","extraPrice":0},{"label":"Hot","extraPrice":0}]}],"costPrice":7000,"categoryId":"milky","description":"chocolate & fresh milk","isAvailable":true}'::jsonb),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'p-20', 'Cookies & Cream', 'milky', 20000, 7500, -1, true, '{"id":"p-20","name":"Cookies & Cream","price":20000,"stock":-1,"colorBg":"bg-stone-200 text-stone-900","options":[{"name":"Suhu","choices":[{"label":"Ice","extraPrice":0}]}],"costPrice":7500,"categoryId":"milky","description":"cookies, cream & fresh milk","isAvailable":true}'::jsonb),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'p-21', 'Mojito', 'refreshment', 20000, 6500, -1, true, '{"id":"p-21","name":"Mojito","price":20000,"stock":-1,"colorBg":"bg-emerald-100 text-emerald-900","options":[{"name":"Suhu","choices":[{"label":"Ice","extraPrice":0}]}],"costPrice":6500,"categoryId":"refreshment","description":"mint, lemon & soda","isAvailable":true}'::jsonb),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'p-22', 'Blue Soda', 'refreshment', 20000, 6500, -1, true, '{"id":"p-22","name":"Blue Soda","price":20000,"stock":-1,"colorBg":"bg-sky-100 text-sky-900","options":[{"name":"Suhu","choices":[{"label":"Ice","extraPrice":0}]}],"costPrice":6500,"categoryId":"refreshment","description":"blue syrup, lemon & soda","isAvailable":true}'::jsonb),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'p-23', 'Jus Buah', 'refreshment', 15000, 5000, -1, true, '{"id":"p-23","name":"Jus Buah","price":15000,"stock":-1,"colorBg":"bg-rose-100 text-rose-900","options":[{"name":"Suhu","choices":[{"label":"Ice","extraPrice":0}]}],"costPrice":5000,"categoryId":"refreshment","description":"fresh fruit & ice","isAvailable":true}'::jsonb),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'p-24', 'Orange Squash', 'refreshment', 20000, 6500, -1, true, '{"id":"p-24","name":"Orange Squash","price":20000,"stock":-1,"colorBg":"bg-orange-100 text-orange-900","options":[{"name":"Suhu","choices":[{"label":"Ice","extraPrice":0}]}],"costPrice":6500,"categoryId":"refreshment","description":"orange, syrup & soda","isAvailable":true}'::jsonb),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'p-25', 'Water', 'refreshment', 5000, 2000, -1, true, '{"id":"p-25","name":"Water","price":5000,"stock":-1,"colorBg":"bg-blue-50 text-blue-900","options":[{"name":"Suhu","choices":[{"label":"Cold","extraPrice":0},{"label":"Normal","extraPrice":0}]}],"costPrice":2000,"categoryId":"refreshment","description":"mineral water","isAvailable":true}'::jsonb),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'p-26', 'Chicken Katsu', 'makanan', 25000, 11000, -1, true, '{"id":"p-26","name":"Chicken Katsu","price":25000,"stock":-1,"colorBg":"bg-amber-200 text-amber-950","costPrice":11000,"categoryId":"makanan","description":"chicken katsu, fries, mix salad, mayones, chili sauce","isAvailable":true}'::jsonb),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'p-27', 'Rice Bowl', 'makanan', 25000, 11000, -1, true, '{"id":"p-27","name":"Rice Bowl","price":25000,"stock":-1,"colorBg":"bg-orange-200 text-orange-950","costPrice":11000,"categoryId":"makanan","description":"rice, chicken katsu, scramble egg, mix salad, mayones, chili sauce","isAvailable":true}'::jsonb),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'p-28', 'Mie Goreng', 'makanan', 15000, 6000, -1, true, '{"id":"p-28","name":"Mie Goreng","price":15000,"stock":-1,"colorBg":"bg-red-100 text-red-900","costPrice":6000,"categoryId":"makanan","description":"mie, pokcoy, fried egg","isAvailable":true}'::jsonb),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'p-29', 'Mie Kuah', 'makanan', 15000, 6000, -1, true, '{"id":"p-29","name":"Mie Kuah","price":15000,"stock":-1,"colorBg":"bg-rose-100 text-rose-900","costPrice":6000,"categoryId":"makanan","description":"mie, pokcoy, boiled egg","isAvailable":true}'::jsonb),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'p-30', 'Dimsum Mentai', 'makanan', 25000, 11000, -1, true, '{"id":"p-30","name":"Dimsum Mentai","price":25000,"stock":-1,"colorBg":"bg-orange-100 text-orange-900","costPrice":11000,"categoryId":"makanan","description":"dimsum, sauce mentai, nori","isAvailable":true}'::jsonb),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'p-31', 'Mix Platter', 'makanan', 25000, 10000, -1, true, '{"id":"p-31","name":"Mix Platter","price":25000,"stock":-1,"colorBg":"bg-amber-100 text-amber-900","costPrice":10000,"categoryId":"makanan","description":"sosis, nugget, fries, sauce","isAvailable":true}'::jsonb),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'p-32', 'Sosis Nugget', 'makanan', 15000, 6000, -1, true, '{"id":"p-32","name":"Sosis Nugget","price":15000,"stock":-1,"colorBg":"bg-yellow-100 text-yellow-900","costPrice":6000,"categoryId":"makanan","description":"sosis, nugget, sauce","isAvailable":true}'::jsonb),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'p-33', 'Fries', 'makanan', 15000, 5500, -1, true, '{"id":"p-33","name":"Fries","price":15000,"stock":-1,"colorBg":"bg-amber-100 text-amber-900","costPrice":5500,"categoryId":"makanan","description":"fries, oregano, sauce","isAvailable":true}'::jsonb),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'p-34', 'Roti Bakar', 'makanan', 15000, 5500, -1, true, '{"id":"p-34","name":"Roti Bakar","price":15000,"stock":-1,"colorBg":"bg-yellow-200 text-yellow-950","costPrice":5500,"categoryId":"makanan","description":"roti, pilihan rasa, skm","isAvailable":true}'::jsonb),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'p-35', 'Chicken Burger', 'dessert', 38000, 16000, -1, true, '{"id":"p-35","name":"Chicken Burger","price":38000,"stock":-1,"colorBg":"bg-amber-300 text-amber-950","costPrice":16000,"categoryId":"dessert","description":"bun, chicken patty, cheese, lettuce, tomato, onion, sauce","isAvailable":true}'::jsonb),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'p-36', 'Croissant Ice Cream', 'dessert', 25000, 10000, -1, true, '{"id":"p-36","name":"Croissant Ice Cream","price":25000,"stock":-1,"colorBg":"bg-orange-100 text-orange-900","costPrice":10000,"categoryId":"dessert","description":"croissant, 3 scoop ice cream, jeruk, meses, sauce","isAvailable":true}'::jsonb),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'p-37', 'Ice Cream', 'dessert', 15000, 5500, -1, true, '{"id":"p-37","name":"Ice Cream","price":15000,"stock":-1,"colorBg":"bg-pink-100 text-pink-900","costPrice":5500,"categoryId":"dessert","description":"3 scoop ice cream (varian rasa)","isAvailable":true}'::jsonb),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'p-38', 'Croissant Original', 'dessert', 15000, 4000, -1, true, '{"id":"p-38","name":"Croissant Original","price":15000,"stock":-1,"colorBg":"bg-amber-100 text-amber-900","options":[{"name":"Varian","choices":[{"label":"Original","extraPrice":0},{"label":"Coklat","extraPrice":0}]}],"costPrice":4000,"categoryId":"dessert","description":"croissant original, coklat","isAvailable":true}'::jsonb),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'p-1794056480755', 'Danis raisin', 'kopi', 15000, 7000, 99, true, '{"id":"p-1794056480755","name":"Danis raisin","price":15000,"stock":99,"colorBg":"bg-amber-800 text-amber-100","options":[{"name":"Suhu","choices":[{"label":"Es / Iced","extraPrice":0},{"label":"Panas / Hot","extraPrice":0}]}],"costPrice":7000,"categoryId":"kopi","isAvailable":true}'::jsonb)
on conflict (business_id, id) do update set
  name = excluded.name,
  category_id = excluded.category_id,
  price = excluded.price,
  cost_price = excluded.cost_price,
  stock = excluded.stock,
  is_available = excluded.is_available,
  raw = excluded.raw,
  synced_at = now();

-- 5. Data Rekap Bulanan & Harian (public.manual_summaries)
insert into public.manual_summaries (business_id, period, date, sales, expenses, overpay, note, updated_at)
values
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'month', '2026-07', 2881000.00, 0.00, 0.00, 'July 2026', now()),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'month', '2026-08', 12695000.00, 12496831.00, 0.00, 'Periode 26 Jul - 25 Agu 2026', now()),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'month', '2026-09', 11752000.00, 7419797.28, 0.00, 'Periode 26 Agu - 25 Sep 2026', now()),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'month', '2026-10', 12723000.00, 11772516.72, 0.00, 'Periode 26 Sep - 25 Okt 2026', now()),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'month', '2026-11', 0.00, 710000.00, 0.00, 'KOPI: Rp 450.000 | ROTI: Rp 85.000 | CLEO: Rp 35.000 | DIMSUM: Rp 140.000', now()),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'day', '2026-10-26', 827000.00, 0.00, 0.00, 'Cash: Rp 827.000 | QRIS: Rp 0', now()),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'day', '2026-10-27', 0.00, 0.00, 0.00, 'Cash: Rp 0 | QRIS: Rp 0', now()),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'day', '2026-10-28', 185000.00, 478000.00, 0.00, 'Cash: Rp 185.000 | QRIS: Rp 0', now()),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'day', '2026-10-29', 817000.00, 80000.00, 80000.00, 'Cash: Rp 603.000 | QRIS: Rp 134.000 | Kelebihan: Rp 80.000', now()),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'day', '2026-10-30', 709000.00, 245000.00, 0.00, 'Cash: Rp 363.000 | QRIS: Rp 346.000', now()),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'day', '2026-10-31', 764000.00, 300000.00, 0.00, 'Cash: Rp 625.000 | QRIS: Rp 139.000', now()),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'day', '2026-11-01', 517000.00, 0.00, 0.00, 'Cash: Rp 388.000 | QRIS: Rp 129.000', now()),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'day', '2026-11-02', 639000.00, 266000.00, 0.00, 'Cash: Rp 488.000 | QRIS: Rp 151.000', now()),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'day', '2026-11-03', 217000.00, 12000.00, 0.00, 'Cash: Rp 69.000 | QRIS: Rp 148.000', now()),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'day', '2026-11-04', 577000.00, 22000.00, 0.00, 'Cash: Rp 474.000 | QRIS: Rp 103.000', now()),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'day', '2026-11-05', 376000.00, 0.00, 0.00, 'Cash: Rp 331.000 | QRIS: Rp 45.000', now()),
  ('2730c949-cb96-4922-8c9b-d763393f3fe0', 'day', '2026-11-06', 780000.00, 20000.00, 17000.00, 'Cash: Rp 308.000 | QRIS: Rp 455.000 | Kelebihan: Rp 17.000', now())
on conflict (business_id, period, date) do update set
  sales = excluded.sales,
  expenses = excluded.expenses,
  overpay = excluded.overpay,
  note = excluded.note,
  updated_at = now();

-- 6. Data Dummy Shift, Transaksi Kasir & Pengeluaran (untuk pengujian Dev)
insert into public.shifts (
  business_id, id, cashier_id, cashier_name, start_time, end_time,
  starting_cash, ending_cash_actual, expected_cash,
  total_sales_cash, total_sales_non_cash, total_sales_debt, expenses_cash,
  total_transactions, status
) values (
  '2730c949-cb96-4922-8c9b-d763393f3fe0',
  'SHIFT-SEED-001',
  'c-2',
  'Wulan',
  now() - interval '4 hours',
  null,
  200000,
  null,
  257000,
  62000,
  44000,
  25000,
  15000,
  3,
  'open'
) on conflict (business_id, id) do nothing;

insert into public.transactions (
  business_id, id, created_at, device_code, shift_id, cashier_id, cashier_name,
  order_type, customer_name, items, subtotal, discount_amount, tax_amount,
  grand_total, payment_type, payment_detail, amount_paid, change_amount,
  overpay_amount, status, debt_status
) values
  (
    '2730c949-cb96-4922-8c9b-d763393f3fe0',
    'WKP-SEED-0001',
    now() - interval '3 hours',
    'DEV',
    'SHIFT-SEED-001',
    'c-2',
    'Wulan',
    'Dine In',
    'Pelanggan Meja 1',
    '[{"product":{"id":"p-2","name":"Caffe Latte","price":22000,"costPrice":8000,"categoryId":"coffee","stock":-1,"isAvailable":true},"quantity":1,"unitPrice":22000,"totalPrice":22000,"cartItemId":"p-2-Ice","selectedOptions":[{"groupName":"Suhu","choiceLabel":"Ice","extraPrice":0}]},{"product":{"id":"p-26","name":"Chicken Katsu","price":25000,"costPrice":11000,"categoryId":"makanan","stock":-1,"isAvailable":true},"quantity":1,"unitPrice":25000,"totalPrice":25000,"cartItemId":"p-26","selectedOptions":[]},{"product":{"id":"p-28","name":"Mie Goreng","price":15000,"costPrice":6000,"categoryId":"makanan","stock":-1,"isAvailable":true},"quantity":1,"unitPrice":15000,"totalPrice":15000,"cartItemId":"p-28","selectedOptions":[]}]'::jsonb,
    62000, 0, 0, 62000, 'tunai', null, 70000, 8000, 0, 'completed', null
  ),
  (
    '2730c949-cb96-4922-8c9b-d763393f3fe0',
    'WKP-SEED-0002',
    now() - interval '2 hours',
    'DEV',
    'SHIFT-SEED-001',
    'c-2',
    'Wulan',
    'Take Away',
    'Pelanggan QRIS',
    '[{"product":{"id":"p-6","name":"Brown Sugar Latte","price":22000,"costPrice":8500,"categoryId":"coffee","stock":-1,"isAvailable":true},"quantity":2,"unitPrice":22000,"totalPrice":44000,"cartItemId":"p-6-Ice","selectedOptions":[{"groupName":"Suhu","choiceLabel":"Ice","extraPrice":0}]}]'::jsonb,
    44000, 0, 0, 44000, 'qris', 'QRIS Statis', 44000, 0, 0, 'completed', null
  ),
  (
    '2730c949-cb96-4922-8c9b-d763393f3fe0',
    'WKP-SEED-0003',
    now() - interval '1 hour',
    'DEV',
    'SHIFT-SEED-001',
    'c-2',
    'Wulan',
    'Dine In',
    'Bli Made',
    '[{"product":{"id":"p-30","name":"Dimsum Mentai","price":25000,"costPrice":11000,"categoryId":"makanan","stock":-1,"isAvailable":true},"quantity":1,"unitPrice":25000,"totalPrice":25000,"cartItemId":"p-30","selectedOptions":[]}]'::jsonb,
    25000, 0, 0, 25000, 'hutang', null, 0, 0, 0, 'completed', 'unpaid'
  )
on conflict (business_id, id) do nothing;

insert into public.expenses (
  business_id, id, scope, date, category, amount, note, from_drawer, shift_id, created_by, created_at
) values
  (
    '2730c949-cb96-4922-8c9b-d763393f3fe0',
    'EXP-SEED-001',
    'daily',
    to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM-DD'),
    'Es Batu',
    15000,
    'Es batu kristal 1 bal (dummy)',
    true,
    'SHIFT-SEED-001',
    'Wulan',
    now() - interval '2 hours'
  )
on conflict (business_id, id) do nothing;
