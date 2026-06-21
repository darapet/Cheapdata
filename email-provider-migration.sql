-- Add email_provider column to system_settings
-- Run this in Supabase SQL Editor
ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS email_provider text DEFAULT 'brevo' CHECK (email_provider IN ('brevo', 'smtp'));
