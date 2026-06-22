-- ─── Auto-Transfer Migration ──────────────────────────────────────────────────
-- Run this in your Supabase SQL Editor.
-- This adds the paystack_transfers table that tracks every automatic
-- transfer sent to CheapDataHub's bank account when a user buys data.

-- ─── paystack_transfers ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.paystack_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_reference TEXT NOT NULL,          -- the data purchase reference
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  amount NUMERIC(12, 2) NOT NULL,          -- wholesale cost (what was sent to CheapDataHub)
  recipient_code TEXT NOT NULL,            -- Paystack recipient code for CheapDataHub
  transfer_code TEXT,                      -- Paystack transfer_code (returned after initiation)
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | success | failed | reversed
  reason TEXT,
  response JSONB,                          -- full Paystack API response (for debugging)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.paystack_transfers ENABLE ROW LEVEL SECURITY;

-- Admin can view all transfers
CREATE POLICY "Admin full access on paystack_transfers"
  ON public.paystack_transfers FOR ALL
  USING (auth.jwt() ->> 'email' = 'daramolapeter98@gmail.com');

-- Service role can do everything (needed by Edge Functions)
CREATE POLICY "Service role full access on paystack_transfers"
  ON public.paystack_transfers FOR ALL
  USING (auth.role() = 'service_role');

-- ─── Make sure all needed columns exist on system_settings ───────────────────
-- (Safe to run even if columns already exist)
ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS cheapdatahub_bank_name TEXT;
ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS cheapdatahub_bank_code TEXT;
ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS cheapdatahub_bank_account TEXT;
ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS cheapdatahub_account_name TEXT;
ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS cheapdatahub_paystack_recipient_code TEXT;
ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS cheapdatahub_auto_fund BOOLEAN DEFAULT false;

-- ─── Enable auto-fund (set to true when you are ready to go live) ─────────────
-- UPDATE public.system_settings SET cheapdatahub_auto_fund = true WHERE id = 1;
