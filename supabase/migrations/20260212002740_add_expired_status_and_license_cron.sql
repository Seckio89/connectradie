/*
  # Add License Expiry Automation

  1. Modified Tables
    - `profiles`
      - Updated `verification_status` CHECK constraint to include 'expired' state

  2. Extensions
    - Enable `pg_net` for async HTTP calls from cron jobs

  3. Cron Job
    - `check-license-expiry-daily` runs at 3:00 AM AEST (17:00 UTC) every day
    - Calls the `check-license-expiry` edge function via HTTP POST
    - Uses the service role key for authentication (bypasses RLS)

  4. Notes
    - The 'expired' status is set by the edge function when a tradie's license_expiry date is in the past
    - Expired tradies have is_verified set to false and receive an urgent notification
    - The cron job uses pg_net for non-blocking HTTP requests
*/

-- Enable pg_net extension for HTTP calls
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Update verification_status CHECK constraint to include 'expired'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'profiles' AND column_name = 'verification_status'
  ) THEN
    ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_verification_status_check;
    ALTER TABLE profiles ADD CONSTRAINT profiles_verification_status_check
      CHECK (verification_status IN ('unverified', 'pending', 'verified', 'rejected', 'expired'));
  END IF;
END $$;

-- Schedule the cron job to run at 3:00 AM AEST (17:00 UTC) daily
SELECT cron.schedule(
  'check-license-expiry-daily',
  '0 17 * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://ymxbyxhvhcelwqufhyob.supabase.co/functions/v1/check-license-expiry',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlteGJ5eGh2aGNlbHdxdWZoeW9iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODAyMTYzMSwiZXhwIjoyMDgzNTk3NjMxfQ.gBKT4QNJOFh7u0M6J7mJP7aYJa-kMZcROtXEKS-rU2s"}'::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  $$
);