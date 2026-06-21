-- ─── Auto-Sync Plans via pg_cron ────────────────────────────────────────────
-- Run this in your Supabase SQL Editor to set up hourly plan syncing.
-- Requires: pg_cron and pg_net extensions (enabled by default on Supabase).
--
-- Step 1: Enable extensions (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Step 2: Add tracking columns to system_settings
ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS last_auto_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_auto_sync_result TEXT;

-- Step 3: Create a helper function that calls the edge function
CREATE OR REPLACE FUNCTION trigger_auto_sync_plans()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _supabase_url TEXT;
  _service_role_key TEXT;
BEGIN
  -- These are automatically available as Supabase Vault secrets
  _supabase_url := current_setting('app.settings.supabase_url', true);
  _service_role_key := current_setting('app.settings.service_role_key', true);

  IF _supabase_url IS NULL OR _service_role_key IS NULL THEN
    RAISE LOG 'auto-sync-plans: supabase_url or service_role_key not set in app.settings';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url    := _supabase_url || '/functions/v1/auto-sync-plans',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || _service_role_key
    ),
    body   := '{}'::jsonb
  );
END;
$$;

-- Step 4: Schedule the cron job to run every hour
-- Remove any existing job first to avoid duplicates
SELECT cron.unschedule('auto-sync-plans-hourly') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'auto-sync-plans-hourly'
);

SELECT cron.schedule(
  'auto-sync-plans-hourly',
  '0 * * * *',   -- every hour at :00
  $$SELECT trigger_auto_sync_plans();$$
);

-- ─── IMPORTANT: Set your Supabase URL and service role key ──────────────────
-- Replace the values below with your actual project URL and service role key,
-- then run this block ONCE in the SQL Editor:
--
-- ALTER DATABASE postgres
--   SET app.settings.supabase_url = 'https://YOUR_PROJECT_REF.supabase.co';
-- ALTER DATABASE postgres
--   SET app.settings.service_role_key = 'YOUR_SERVICE_ROLE_KEY';
--
-- You can find these at: Supabase → Settings → API
-- ─────────────────────────────────────────────────────────────────────────────

-- Verify the job was created
SELECT jobid, jobname, schedule, command, active
FROM cron.job
WHERE jobname = 'auto-sync-plans-hourly';
