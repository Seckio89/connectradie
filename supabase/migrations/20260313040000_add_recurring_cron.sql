-- Enable pg_cron and pg_net extensions (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ============================================================
-- Cron job: send-recurring-reminders
-- Runs daily at 22:00 UTC = 8:00 AM AEST (next day)
-- Sends reminder notifications for tomorrow's recurring sessions
-- ============================================================
SELECT cron.schedule(
  'send-recurring-reminders-daily',
  '0 22 * * *',
  $$
  SELECT net.http_post(
    url := 'https://uoqygmizupdpanplpvor.supabase.co/functions/v1/send-recurring-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ============================================================
-- Cron job: generate-recurring-sessions
-- Runs daily at 20:00 UTC = 6:00 AM AEST
-- Creates new sessions for recurring jobs whose next_due_date <= today
-- ============================================================
SELECT cron.schedule(
  'generate-recurring-sessions-daily',
  '0 20 * * *',
  $$
  SELECT net.http_post(
    url := 'https://uoqygmizupdpanplpvor.supabase.co/functions/v1/generate-recurring-sessions',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);
