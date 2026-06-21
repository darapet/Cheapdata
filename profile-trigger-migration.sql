-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: Auto-create profile on signup + backfill existing users
--
-- Run this once in: Supabase Dashboard → SQL Editor → New Query → Run
--
-- What it does:
--   1. Creates a trigger function that inserts a profiles row whenever a new
--      user signs up via Supabase Auth (fixes PIN reset OTP, profile 404, etc.)
--   2. Drops + recreates the trigger on auth.users
--   3. Backfills any existing users who are missing a profiles row
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 2. Trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 3. Backfill existing users
INSERT INTO public.profiles (id, email, full_name)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', '')
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = u.id
);

-- Done! All existing users now have a profiles row.
-- New signups will automatically get one going forward.
