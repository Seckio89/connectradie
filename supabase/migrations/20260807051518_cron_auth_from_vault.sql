-- Every HTTP cron reads the service-role key from the vault, in one place.
--
-- THE DEFECT
-- The cron migrations in this repo authenticate like this:
--
--   'Bearer ' || current_setting('app.settings.service_role_key', true)
--
-- That GUC is set nowhere on this database — not on the database, not on a
-- role. current_setting(..., true) therefore returns NULL, the header collapses
-- to the string 'Bearer ', and every edge function rejects it with 401.
--
-- Production is not broken, because the live jobs were repaired by hand at some
-- point to read the key from the vault. The FILES were never updated. So the
-- repo and the database have disagreed for months, and rebuilding this database
-- from supabase/migrations would produce a full set of crons that authenticate
-- with nothing: escrow release, recurring payouts, fee invoicing, licence
-- expiry, reminders and notifications, each reporting success while doing
-- nothing at all.
--
-- Nothing would have told you. pg_net queues the request and returns a row id,
-- so the cron records "succeeded" whatever the eventual HTTP status. That is
-- how the sweep cron shipped broken in 20260807045901 an hour ago, and it is
-- the same shape as the failure that stranded $20.19: the system reports
-- success and the money does not move.
--
-- THE FIX
-- Re-schedule every HTTP cron from one canonical definition. pg_cron 1.6
-- upserts by jobname, so this rewrites each job in place — no window where a
-- job does not exist, and no change to any schedule.
--
-- Behaviour in production is UNCHANGED. All fourteen already used the vault;
-- their commands differed only in whitespace, casing and a trailing
-- `AS request_id`. What changes is that the repo can now rebuild them.
--
-- The five pure-SQL crons (auto-close-expired-vacancies,
-- auto-complete-ended-projects, cleanup-edge-rate-limits,
-- delete-old-declined-jobs, fee-invariant-audit-daily) make no HTTP call and
-- need no credential, so they are deliberately left alone.
--
-- WHY THE KEY IS NOT WRITTEN INTO THE COMMAND
-- cron.job.command is readable by anyone who can read the catalog, and this
-- file is committed. The vault lookup runs at FIRE time under the job owner,
-- so the secret never lands in a migration, in git, or in a catalog column.

-- ── 1. Fail loudly if the secret is missing ─────────────────────────────────
-- On a fresh rebuild the vault will not have this secret, and without this
-- block the rebuild would "succeed" and hand over a database whose money crons
-- silently 401 — precisely the failure this migration exists to end. An
-- exception here stops the rebuild with an instruction instead.
DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets WHERE name = 'service_role_key'
  ) THEN
    RAISE EXCEPTION
      'vault secret "service_role_key" is missing — every scheduled cron would authenticate with an empty bearer token and silently 401. Create it first: SELECT vault.create_secret(''<service role key>'', ''service_role_key'');';
  END IF;
END
$guard$;

-- ── 2. One definition, applied to every HTTP cron ───────────────────────────
DO $reschedule$
DECLARE
  j        record;
  base_url text := 'https://uoqygmizupdpanplpvor.supabase.co/functions/v1/';
  cmd      text;
BEGIN
  FOR j IN
    SELECT * FROM (VALUES
      -- jobname                                schedule              edge function
      ('auto-confirm-sessions',                 '0 */6 * * *',        'auto-confirm-sessions'),
      ('auto-release-payments',                 '0 */6 * * *',        'auto-release-payments'),
      ('auto-release-recurring-payouts-hourly', '15 * * * *',         'auto-release-recurring-payouts'),
      ('check-license-expiry-daily',            '0 17 * * *',         'check-license-expiry'),
      ('credential-expiry-sweep-daily',         '15 17 * * *',        'credential-expiry-sweep'),
      ('generate-auto-invoices-hourly',         '0 20-23,0-8 * * *',  'generate-auto-invoices'),
      ('generate-recurring-sessions-daily',     '0 20 * * *',         'generate-recurring-sessions'),
      ('issue-fee-invoices-daily',              '0 18 * * *',         'issue-fee-invoices'),
      ('payout-reconciliation-daily',           '0 22 * * *',         'payout-reconciliation'),
      ('reconcile-payments-6h',                 '30 */6 * * *',       'reconcile-payments'),
      ('send-invoice-reminders-daily',          '0 22 * * *',         'send-invoice-reminders'),
      ('send-lead-reminders-hourly',            '0 20-23,0-8 * * *',  'send-lead-reminders'),
      ('send-recurring-reminders-daily',        '0 22 * * *',         'send-recurring-reminders'),
      ('send-scheduled-notifications-hourly',   '30 * * * *',         'send-scheduled-notifications'),
      ('sweep-connect-balance',                 '30 */6 * * *',       'sweep-connect-balance')
    ) AS t(jobname, schedule, fn)
  LOOP
    cmd := format(
      $cmd$SELECT net.http_post(
    url := %L,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  );$cmd$,
      base_url || j.fn
    );

    -- pg_cron 1.4+ upserts on jobname: this replaces the command in place.
    PERFORM cron.schedule(j.jobname, j.schedule, cmd);
  END LOOP;
END
$reschedule$;
