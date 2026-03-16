-- Add tradie confirmation flow for recurring sessions.
-- New sessions require tradie to confirm within 48 hours before becoming scheduled.

-- 1. Add confirmation_deadline column
ALTER TABLE recurring_sessions
  ADD COLUMN IF NOT EXISTS confirmation_deadline TIMESTAMPTZ;

-- 2. Drop existing status CHECK and add pending_confirmation
ALTER TABLE recurring_sessions
  DROP CONSTRAINT IF EXISTS recurring_sessions_status_check;

ALTER TABLE recurring_sessions
  ADD CONSTRAINT recurring_sessions_status_check
  CHECK (status IN ('pending_confirmation', 'scheduled', 'completed', 'rescheduled', 'skipped', 'extra'));

-- 3. Index for auto-confirm cron lookup
CREATE INDEX IF NOT EXISTS idx_recurring_sessions_pending_confirm
  ON recurring_sessions (confirmation_deadline)
  WHERE status = 'pending_confirmation';

-- 4. Cron job: auto-confirm expired pending sessions
-- Runs every 6 hours
SELECT cron.schedule(
  'auto-confirm-sessions',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://uoqygmizupdpanplpvor.supabase.co/functions/v1/auto-confirm-sessions',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);
