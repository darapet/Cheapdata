-- CheapDataHub Supabase Database Schema
-- Run this in your Supabase SQL Editor to set up all required tables.

-- ─── profiles ────────────────────────────────────────────────────────────────
-- Extends Supabase auth.users with app-specific data
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  username TEXT UNIQUE,
  phone TEXT,
  address TEXT,
  wallet_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  transaction_pin TEXT,           -- SHA-256 hashed PIN
  is_pin_set BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can only read/update their own profile
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Service role (backend) can do everything
CREATE POLICY "Service role full access on profiles"
  ON public.profiles FOR ALL
  USING (auth.role() = 'service_role');

-- ─── data_plans ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.data_plans (
  id SERIAL PRIMARY KEY,
  network TEXT NOT NULL,              -- MTN, Airtel, Glo, 9mobile
  plan_name TEXT NOT NULL,
  data_size TEXT NOT NULL,            -- e.g. "1GB", "2GB"
  retail_price NUMERIC(10, 2) NOT NULL,
  wholesale_price NUMERIC(10, 2) NOT NULL,
  plan_id TEXT NOT NULL UNIQUE,       -- CheapDataHub plan ID
  validity TEXT,                      -- e.g. "30 days"
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.data_plans ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read data plans
CREATE POLICY "Authenticated users can view data plans"
  ON public.data_plans FOR SELECT
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

CREATE POLICY "Service role full access on data_plans"
  ON public.data_plans FOR ALL
  USING (auth.role() = 'service_role');

-- ─── wallet_fundings ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wallet_fundings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('credit', 'debit')),
  amount NUMERIC(12, 2) NOT NULL,
  processing_fee NUMERIC(10, 2) DEFAULT 0,
  total_amount NUMERIC(12, 2),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  reference TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.wallet_fundings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions"
  ON public.wallet_fundings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access on wallet_fundings"
  ON public.wallet_fundings FOR ALL
  USING (auth.role() = 'service_role');

-- ─── system_settings ─────────────────────────────────────────────────────────
-- Single-row configuration table
CREATE TABLE IF NOT EXISTS public.system_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- enforces single row
  active_payment_gateway TEXT NOT NULL DEFAULT 'paystack',
  paystack_secret_key TEXT,
  flutterwave_secret_key TEXT,
  cheapdatahub_api_key TEXT,
  cheapdatahub_funding_account TEXT,
  brevo_api_key TEXT,
  updated_at TIMESTAMPTZ
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Only service role can access settings (admin routes use service role client)
CREATE POLICY "Service role full access on system_settings"
  ON public.system_settings FOR ALL
  USING (auth.role() = 'service_role');

-- Insert default settings row
INSERT INTO public.system_settings (id, active_payment_gateway)
VALUES (1, 'paystack')
ON CONFLICT (id) DO NOTHING;

-- ─── Auto-create profile on signup ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, username, phone, address)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'username', NULL),
    COALESCE(NEW.raw_user_meta_data->>'phone', NULL),
    COALESCE(NEW.raw_user_meta_data->>'address', NULL)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── Sample data plans ───────────────────────────────────────────────────────
INSERT INTO public.data_plans (network, plan_name, data_size, retail_price, wholesale_price, plan_id, validity) VALUES
-- MTN
('MTN', 'MTN 100MB Daily', '100MB', 100, 80, 'mtn-100mb-daily', '1 day'),
('MTN', 'MTN 500MB', '500MB', 200, 165, 'mtn-500mb', '30 days'),
('MTN', 'MTN 1GB', '1GB', 300, 265, 'mtn-1gb', '30 days'),
('MTN', 'MTN 2GB', '2GB', 500, 450, 'mtn-2gb', '30 days'),
('MTN', 'MTN 5GB', '5GB', 1000, 900, 'mtn-5gb', '30 days'),
('MTN', 'MTN 10GB', '10GB', 2000, 1800, 'mtn-10gb', '30 days'),
-- Airtel
('Airtel', 'Airtel 200MB', '200MB', 100, 80, 'airtel-200mb', '3 days'),
('Airtel', 'Airtel 1GB', '1GB', 300, 265, 'airtel-1gb', '30 days'),
('Airtel', 'Airtel 2GB', '2GB', 500, 450, 'airtel-2gb', '30 days'),
('Airtel', 'Airtel 5GB', '5GB', 1000, 900, 'airtel-5gb', '30 days'),
('Airtel', 'Airtel 10GB', '10GB', 2000, 1800, 'airtel-10gb', '30 days'),
-- Glo
('Glo', 'Glo 1GB', '1GB', 300, 265, 'glo-1gb', '30 days'),
('Glo', 'Glo 2GB', '2GB', 500, 450, 'glo-2gb', '30 days'),
('Glo', 'Glo 5GB', '5GB', 1000, 900, 'glo-5gb', '30 days'),
('Glo', 'Glo 10GB', '10GB', 2000, 1800, 'glo-10gb', '30 days'),
-- 9mobile
('9mobile', '9mobile 1GB', '1GB', 300, 265, '9mobile-1gb', '30 days'),
('9mobile', '9mobile 2GB', '2GB', 500, 450, '9mobile-2gb', '30 days'),
('9mobile', '9mobile 5GB', '5GB', 1000, 900, '9mobile-5gb', '30 days')
ON CONFLICT (plan_id) DO NOTHING;
