-- ============================================================
-- Cron job: send-lead-reminders
-- Runs every hour during AEST waking hours (UTC 20-23, 0-8 = AEST 06-18)
-- Walks lead_impressions and sends 24h/48h reminders + 72h auto-pass.
-- ============================================================
SELECT cron.schedule(
  'send-lead-reminders-hourly',
  '0 20-23,0-8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://uoqygmizupdpanplpvor.supabase.co/functions/v1/send-lead-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
