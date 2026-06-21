-- CheapDataHub Supabase Database Schema
-- Run this in your Supabase SQL Editor to set up all required tables.

-- ─── profiles ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  username TEXT UNIQUE,
  phone TEXT,
  address TEXT,
  wallet_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  transaction_pin TEXT,
  is_pin_set BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Service role full access on profiles" ON public.profiles FOR ALL USING (auth.role() = 'service_role');

-- Admin can read all profiles (needed for admin dashboard)
CREATE POLICY "Admin can view all profiles"
  ON public.profiles FOR SELECT
  USING (auth.jwt() ->> 'email' = 'daramolapeter98@gmail.com');

-- ─── data_plans ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.data_plans (
  id SERIAL PRIMARY KEY,
  network TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  data_size TEXT NOT NULL,
  retail_price NUMERIC(10, 2) NOT NULL,
  wholesale_price NUMERIC(10, 2) NOT NULL,
  plan_id TEXT NOT NULL UNIQUE,
  validity TEXT,
  cheapdatahub_plan_id TEXT,
  service_type TEXT NOT NULL DEFAULT 'data',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.data_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view data plans"
  ON public.data_plans FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Service role full access on data_plans"
  ON public.data_plans FOR ALL
  USING (auth.role() = 'service_role');

-- ─── wallet_fundings ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wallet_fundings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'funding', -- funding | data | airtime | cable | electricity
  description TEXT NOT NULL DEFAULT '',
  amount NUMERIC(12, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | successful | failed
  reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.wallet_fundings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions"
  ON public.wallet_fundings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own transactions"
  ON public.wallet_fundings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access on wallet_fundings"
  ON public.wallet_fundings FOR ALL
  USING (auth.role() = 'service_role');

-- Admin can view all transactions
CREATE POLICY "Admin can view all transactions"
  ON public.wallet_fundings FOR SELECT
  USING (auth.jwt() ->> 'email' = 'daramolapeter98@gmail.com');

-- ─── system_settings ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.system_settings (
  id SERIAL PRIMARY KEY,
  active_payment_gateway TEXT NOT NULL DEFAULT 'paystack',
  admin_email TEXT,
  paystack_public_key TEXT,
  paystack_secret_key TEXT,
  flutterwave_public_key TEXT,
  flutterwave_secret_key TEXT,
  cheapdatahub_api_key TEXT,
  cheapdatahub_base_url TEXT,
  cheapdatahub_funding_account TEXT,
  brevo_api_key TEXT,
  brevo_sender_email TEXT,
  brevo_sender_name TEXT DEFAULT 'CheapDataHub',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Migration: add ALL columns to existing system_settings table ──────────────
-- Run ALL of these in Supabase SQL Editor (safe to run multiple times):
ALTER TABLE public.data_plans ADD COLUMN IF NOT EXISTS cheapdatahub_plan_id TEXT;
ALTER TABLE public.data_plans ADD COLUMN IF NOT EXISTS service_type TEXT NOT NULL DEFAULT 'data';

ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS admin_email TEXT;
ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS paystack_public_key TEXT;
ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS paystack_secret_key TEXT;
ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS flutterwave_public_key TEXT;
ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS flutterwave_secret_key TEXT;
ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS cheapdatahub_api_key TEXT;
ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS cheapdatahub_base_url TEXT;
ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS cheapdatahub_funding_account TEXT;
ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS cheapdatahub_bank_name TEXT;
ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS cheapdatahub_bank_code TEXT;
ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS cheapdatahub_bank_account TEXT;
ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS cheapdatahub_account_name TEXT;
ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS cheapdatahub_low_balance_threshold NUMERIC DEFAULT 5000;
ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS cheapdatahub_topup_amount NUMERIC DEFAULT 20000;
ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS cheapdatahub_auto_fund BOOLEAN DEFAULT false;
ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS cheapdatahub_paystack_recipient_code TEXT;
ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS brevo_api_key TEXT;
ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS brevo_sender_email TEXT;
ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS brevo_sender_name TEXT DEFAULT 'CheapDataHub';

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Only admin can read/write settings
CREATE POLICY "Admin full access on system_settings"
  ON public.system_settings FOR ALL
  USING (auth.jwt() ->> 'email' = 'daramolapeter98@gmail.com');

CREATE POLICY "Service role full access on system_settings"
  ON public.system_settings FOR ALL
  USING (auth.role() = 'service_role');

-- Authenticated users can read non-sensitive settings (for funding account display)
CREATE POLICY "Authenticated users can read public settings"
  ON public.system_settings FOR SELECT
  USING (auth.role() = 'authenticated');

-- ─── Seed initial data_plans ──────────────────────────────────────────────────
INSERT INTO public.data_plans (network, plan_name, data_size, retail_price, wholesale_price, plan_id, validity) VALUES
  ('MTN', 'MTN 500MB', '500MB', 150, 120, 'mtn-500mb-30d', '30 days'),
  ('MTN', 'MTN 1GB', '1GB', 300, 265, 'mtn-1gb-30d', '30 days'),
  ('MTN', 'MTN 2GB', '2GB', 550, 490, 'mtn-2gb-30d', '30 days'),
  ('MTN', 'MTN 5GB', '5GB', 1200, 1050, 'mtn-5gb-30d', '30 days'),
  ('MTN', 'MTN 10GB', '10GB', 2200, 1950, 'mtn-10gb-30d', '30 days'),
  ('AIRTEL', 'Airtel 500MB', '500MB', 160, 130, 'airtel-500mb-30d', '30 days'),
  ('AIRTEL', 'Airtel 1GB', '1GB', 310, 275, 'airtel-1gb-30d', '30 days'),
  ('AIRTEL', 'Airtel 2GB', '2GB', 560, 500, 'airtel-2gb-30d', '30 days'),
  ('AIRTEL', 'Airtel 5GB', '5GB', 1250, 1100, 'airtel-5gb-30d', '30 days'),
  ('GLO', 'Glo 1GB', '1GB', 290, 255, 'glo-1gb-30d', '30 days'),
  ('GLO', 'Glo 2GB', '2GB', 530, 470, 'glo-2gb-30d', '30 days'),
  ('GLO', 'Glo 5GB', '5GB', 1150, 1000, 'glo-5gb-30d', '30 days'),
  ('9MOBILE', '9mobile 1GB', '1GB', 320, 280, '9mobile-1gb-30d', '30 days'),
  ('9MOBILE', '9mobile 2GB', '2GB', 580, 510, '9mobile-2gb-30d', '30 days')
ON CONFLICT (plan_id) DO NOTHING;

-- Insert default system settings row if not exists
INSERT INTO public.system_settings (active_payment_gateway, cheapdatahub_funding_account, brevo_sender_name)
SELECT 'paystack', 'Add your bank account in Admin → Settings', 'CheapDataHub'
WHERE NOT EXISTS (SELECT 1 FROM public.system_settings);

-- ─── Seed Cable TV plans (wholesale + ₦100 markup) ───────────────────────────
INSERT INTO public.data_plans (network, plan_name, data_size, retail_price, wholesale_price, plan_id, validity, service_type, is_active) VALUES
('DSTV', 'DStv Padi', '', 2600, 2500, 'cable-dstv-padi', 'Monthly', 'cable', true),
('DSTV', 'DStv Yanga', '', 3700, 3600, 'cable-dstv-yanga', 'Monthly', 'cable', true),
('DSTV', 'DStv Confam', '', 6400, 6300, 'cable-dstv-confam', 'Monthly', 'cable', true),
('DSTV', 'DStv Compact', '', 10600, 10500, 'cable-dstv-compact', 'Monthly', 'cable', true),
('DSTV', 'DStv Compact Plus', '', 16700, 16600, 'cable-dstv-compact-plus', 'Monthly', 'cable', true),
('DSTV', 'DStv Premium', '', 24600, 24500, 'cable-dstv-premium', 'Monthly', 'cable', true),
('GOTV', 'GOtv Smallie', '', 1300, 1200, 'cable-gotv-smallie', 'Monthly', 'cable', true),
('GOTV', 'GOtv Jinja', '', 2300, 2200, 'cable-gotv-jinja', 'Monthly', 'cable', true),
('GOTV', 'GOtv Jolli', '', 3800, 3700, 'cable-gotv-jolli', 'Monthly', 'cable', true),
('GOTV', 'GOtv Max', '', 5600, 5500, 'cable-gotv-max', 'Monthly', 'cable', true),
('GOTV', 'GOtv Supa', '', 6600, 6500, 'cable-gotv-supa', 'Monthly', 'cable', true),
('STARTIMES', 'Nova', '', 1000, 900, 'cable-st-nova', 'Monthly', 'cable', true),
('STARTIMES', 'Basic', '', 1800, 1700, 'cable-st-basic', 'Monthly', 'cable', true),
('STARTIMES', 'Smart', '', 2300, 2200, 'cable-st-smart', 'Monthly', 'cable', true),
('STARTIMES', 'Classic', '', 2600, 2500, 'cable-st-classic', 'Monthly', 'cable', true),
('STARTIMES', 'Super', '', 4300, 4200, 'cable-st-super', 'Monthly', 'cable', true)
ON CONFLICT (plan_id) DO NOTHING;

-- ─── Seed Education / Exam plans (wholesale + ₦200 markup) ───────────────────
INSERT INTO public.data_plans (network, plan_name, data_size, retail_price, wholesale_price, plan_id, validity, service_type, is_active) VALUES
('WAEC', 'WAEC Result Checker PIN', '', 1200, 1000, 'edu-waec-result', '', 'education', true),
('NECO', 'NECO Result Checker PIN', '', 1000, 800, 'edu-neco-result', '', 'education', true),
('JAMB', 'JAMB Result Checker', '', 700, 500, 'edu-jamb-result', '', 'education', true),
('GCE', 'GCE Result Checker PIN', '', 1200, 1000, 'edu-gce-result', '', 'education', true)
ON CONFLICT (plan_id) DO NOTHING;
