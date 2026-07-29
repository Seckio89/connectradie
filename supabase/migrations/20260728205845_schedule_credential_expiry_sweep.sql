-- Migration: schedule_credential_expiry_sweep
-- Description: Daily pg_cron job driving the credential-expiry-sweep Edge Function.
--
-- 03:15 AEST = 17:15 UTC, deliberately 15 minutes after check-license-expiry
-- (20260212002740, '0 17 * * *') so the two notification sweeps do not contend.
--
-- The sweep is idempotent by construction — warnings are gated on an insert into
-- worker_credential_notifications with a unique key — so a retry or a double-fire
-- costs nothing.

SELECT cron.unschedule('credential-expiry-sweep-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'credential-expiry-sweep-daily');

SELECT cron.schedule(
  'credential-expiry-sweep-daily',
  '15 17 * * *',
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/credential-expiry-sweep',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
