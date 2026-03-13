-- ============================================================
-- Cron job: auto-release-payments
-- Runs every 6 hours
-- Releases escrow for completed jobs after 48-hour review window
-- ============================================================
SELECT cron.schedule(
  'auto-release-payments',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://uoqygmizupdpanplpvor.supabase.co/functions/v1/auto-release-payments',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);
