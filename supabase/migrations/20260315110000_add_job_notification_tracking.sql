-- Add columns to track scheduled notification delivery on jobs.
-- Prevents duplicate day-before and 2-hour reminder notifications.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS day_before_notification_sent TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS two_hour_notification_sent TIMESTAMPTZ;

-- Partial index for efficient cron lookups: only unnotified active jobs
CREATE INDEX IF NOT EXISTS idx_jobs_pending_day_before_notif
  ON jobs (scheduled_date)
  WHERE status IN ('accepted', 'funded', 'in_progress')
    AND day_before_notification_sent IS NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_pending_two_hour_notif
  ON jobs (scheduled_date)
  WHERE status IN ('accepted', 'funded', 'in_progress')
    AND two_hour_notification_sent IS NULL
    AND scheduled_time IS NOT NULL;

-- Cron job: send scheduled notifications + auto-start funded jobs
-- Runs every hour at minute 30
SELECT cron.schedule(
  'send-scheduled-notifications-hourly',
  '30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://uoqygmizupdpanplpvor.supabase.co/functions/v1/send-scheduled-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);
