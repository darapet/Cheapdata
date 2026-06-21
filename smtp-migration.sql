-- Add SMTP columns for email sending via nodemailer
-- Run this in your Supabase SQL Editor: Dashboard → SQL Editor → New Query

ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS smtp_host text DEFAULT 'smtp-relay.brevo.com',
  ADD COLUMN IF NOT EXISTS smtp_port integer DEFAULT 587,
  ADD COLUMN IF NOT EXISTS smtp_user text,
  ADD COLUMN IF NOT EXISTS smtp_pass text;
