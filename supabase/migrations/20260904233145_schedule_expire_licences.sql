-- ─────────────────────────────────────────────────────────────────────────────
-- Schedule expire-licences — the daily licence sweep.
--
--   1. verified rows whose expiry_date has passed -> 'expired', tradie notified
--      to re-upload.
--   2. Safety net: any licence photo older than 30 days whose row is not
--      awaiting_review is deleted from storage and photo_deleted_at stamped.
--      review-licence deletes on decision; this catches abandoned drafts and
--      anything that slipped through.
--
-- Runs at 17:30 UTC (03:30 AEST), after check-license-expiry (17:00) and
-- credential-expiry-sweep (17:15), which do the same job for the legacy profile
-- licence columns and for roster credentials respectively.
--
-- AUTH — the vault form, NOT current_setting('app.settings.service_role_key').
-- That GUC exists nowhere on this database: the header collapses to 'Bearer '
-- and the function answers 401 while pg_net records success. See
-- 20260807051518_cron_auth_from_vault.sql; scripts/check-cron-auth.mjs blocks
-- the dead form. The function keeps verify_jwt = true and probes the presented
-- key with _shared/serviceAuth.hasServiceRole.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT cron.schedule(
  'expire-licences-daily',
  '30 17 * * *',
  $cmd$SELECT net.http_post(
    url := 'https://uoqygmizupdpanplpvor.supabase.co/functions/v1/expire-licences',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  );$cmd$
);
