-- ============================================================
-- Cron job: generate-auto-invoices
-- Runs every hour from 6 AM to 6 PM AEST (20:00-08:00 UTC)
-- Checks recurring_jobs with auto_invoice=true and generates
-- invoices when the current hour/day matches their settings.
-- ============================================================
SELECT cron.schedule(
  'generate-auto-invoices-hourly',
  '0 20-23,0-8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://uoqygmizupdpanplpvor.supabase.co/functions/v1/generate-auto-invoices',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);
