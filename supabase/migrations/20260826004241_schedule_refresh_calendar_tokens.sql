-- ─────────────────────────────────────────────────────────────────────────────
-- Schedule refresh-calendar-tokens — the Google Calendar credential heartbeat.
--
-- Until now the refresh grant ran only when a person acted (sync, import, or
-- the dashboard's "Test connection" button). A connection nobody touched was
-- never exercised, so a dead authorisation surfaced only when a tradie next
-- pressed something — the 2026-08-20 breakage stayed invisible for five days
-- that way, and proving refresh worked at all depended on someone remembering
-- to press Test a week later. Every six hours this exercises the grant for
-- every enabled integration; the function records the outcome on the row
-- (last_refresh_ok_at / needs_reconnect / last_refresh_error*), the dashboard
-- flips to "Reconnect Google Calendar" on its own, and the tradie is notified
-- once on the transition into dead.
--
-- Cadence: access tokens live one hour, so any six-hour tick finds an idle
-- connection expired and genuinely refreshes it — four real exercises of the
-- grant per day, and a dead one is surfaced within six hours instead of on
-- day 8. Minute 45 keeps clear of the :00/:15/:30 jobs already scheduled.
--
-- AUTH — the vault form, NOT current_setting('app.settings.service_role_key').
-- That GUC exists nowhere on this database: the header collapses to
-- 'Bearer ' and the function answers 401 while pg_net records success. Eight
-- migrations shipped that way and every one is superseded by
-- 20260807051518_cron_auth_from_vault.sql; scripts/check-cron-auth.mjs blocks
-- the dead form from coming back. The function itself keeps verify_jwt = true
-- and probes the presented key with _shared/serviceAuth.hasServiceRole, same as
-- credential-expiry-sweep.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT cron.schedule(
  'refresh-calendar-tokens-6h',
  '45 */6 * * *',
  $cmd$SELECT net.http_post(
    url := 'https://uoqygmizupdpanplpvor.supabase.co/functions/v1/refresh-calendar-tokens',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  );$cmd$
);
