-- ═══════════════════════════════════════════════════════════════════════════════
-- CheapDataHub — system_settings RLS Security Fix
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New Query)
--
-- What this fixes:
--   The old setup gave every logged-in user full SELECT access to system_settings,
--   which exposed secret API keys (Paystack, Flutterwave, Brevo, CheapDataHub)
--   to any registered user.
--
-- What this does:
--   1. Drops the overly-permissive "Authenticated users can read public settings" policy.
--   2. Creates a SECURITY DEFINER function that exposes ONLY the two safe fields
--      regular users actually need (funding_account + active_gateway).
--   3. Grants execute on that function to authenticated users.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Step 1: Drop the overly-permissive policy that exposed all secret keys
DROP POLICY IF EXISTS "Authenticated users can read public settings" ON public.system_settings;

-- Step 2: Create a safe function that exposes only non-sensitive fields.
--   SECURITY DEFINER means it runs as the function owner (postgres/service role),
--   bypassing RLS, so it can read the row — but it only returns safe columns.
CREATE OR REPLACE FUNCTION public.get_public_settings()
RETURNS TABLE (
  cheapdatahub_funding_account text,
  active_payment_gateway text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cheapdatahub_funding_account,
    active_payment_gateway
  FROM public.system_settings
  LIMIT 1;
$$;

-- Step 3: Allow authenticated (logged-in) users to call this function
GRANT EXECUTE ON FUNCTION public.get_public_settings() TO authenticated;

-- Done! Secret keys are now fully locked down:
--   • Only your admin account (daramolapeter98@gmail.com) can read/write system_settings directly.
--   • The service role (Express backend) bypasses RLS as always.
--   • Regular users can only call get_public_settings() which returns 2 safe fields.
