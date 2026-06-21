-- ════════════════════════════════════════════════════════════════════════════
-- RLS fix: allow the admin account to read and update system_settings
-- Run this in Supabase Dashboard → SQL Editor
-- ════════════════════════════════════════════════════════════════════════════

-- Drop any old conflicting policies on system_settings first
DROP POLICY IF EXISTS "Admin manages settings" ON public.system_settings;
DROP POLICY IF EXISTS "Admin can update settings" ON public.system_settings;
DROP POLICY IF EXISTS "Admin can insert settings" ON public.system_settings;
DROP POLICY IF EXISTS "Admin can read settings" ON public.system_settings;

-- Single policy: admin email gets full access (SELECT / INSERT / UPDATE / DELETE)
CREATE POLICY "Admin manages settings"
  ON public.system_settings
  FOR ALL
  TO authenticated
  USING      (auth.email() = 'daramolapeter98@gmail.com')
  WITH CHECK (auth.email() = 'daramolapeter98@gmail.com');
