-- The sweep cron could never have authenticated.
--
-- 20260807045901 scheduled it the way every cron migration in this repo does:
--
--   'Bearer ' || current_setting('app.settings.service_role_key', true)
--
-- That GUC is not set anywhere on this database — not on the database, not on a
-- role — so current_setting(..., true) returns NULL, the header collapses to
-- 'Bearer ', and hasServiceRole rejects it. The cron row would run, pg_net
-- would report "1 row", and the sweep would 401 every six hours forever.
--
-- Production's live crons do NOT use that form. All nineteen read the key from
-- the vault instead, and that is why they work:
--
--   'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets
--                 WHERE name = 'service_role_key' LIMIT 1)
--
-- The repo's migration files were never updated to match, so the file and the
-- live job have disagreed for months. Rebuilding this database from
-- supabase/migrations would produce a full set of silently dead crons —
-- releases, payouts, reminders and invoicing — each reporting success while
-- posting an empty bearer token.
--
-- Fixed here for the sweep only, which is the job this change owns. The other
-- eighteen are live and working; correcting their FILES is a separate change,
-- and is written up as a finding rather than smuggled in here.
SELECT cron.unschedule('sweep-connect-balance')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sweep-connect-balance');

SELECT cron.schedule(
  'sweep-connect-balance',
  '30 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://uoqygmizupdpanplpvor.supabase.co/functions/v1/sweep-connect-balance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
