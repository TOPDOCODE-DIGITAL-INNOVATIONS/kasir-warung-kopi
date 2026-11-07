-- 1. Profiles Table (extends auth.users)
CREATE TYPE user_role AS ENUM ('OWNER', 'ADMIN', 'CASHIER');

CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  role user_role DEFAULT 'CASHIER',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Businesses Table (Usaha)
-- Owner bisa memiliki banyak usaha.
CREATE TABLE public.businesses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Products Table
CREATE TABLE public.products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  price DECIMAL(12,2) NOT NULL DEFAULT 0,
  stock INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Transactions Table
CREATE TABLE public.transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE NOT NULL,
  cashier_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- Kasir yang menangani
  total_amount DECIMAL(12,2) NOT NULL,
  payment_method TEXT DEFAULT 'CASH', -- CASH, QRIS, TRANSFER
  status TEXT DEFAULT 'COMPLETED',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Transaction Items Table
CREATE TABLE public.transaction_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  quantity INT NOT NULL DEFAULT 1,
  price DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS (Row Level Security) Policies
-- (Abaikan RLS jika hanya untuk prototype awal, namun sangat disarankan untuk Production)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_items ENABLE ROW LEVEL SECURITY;

-- Contoh Policy Sederhana: Owner bisa melihat semuanya milik mereka
CREATE POLICY "Owner can view their own businesses"
ON public.businesses FOR SELECT
USING (auth.uid() = owner_id);

CREATE POLICY "Owner can view products of their businesses"
ON public.products FOR SELECT
USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));

CREATE POLICY "Owner can view transactions of their businesses"
ON public.transactions FOR SELECT
USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));

CREATE POLICY "Owner can view transaction items of their businesses"
ON public.transaction_items FOR SELECT
USING (transaction_id IN (SELECT id FROM public.transactions WHERE business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid())));
