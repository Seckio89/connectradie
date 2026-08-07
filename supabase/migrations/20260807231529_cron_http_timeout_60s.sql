-- Give every HTTP cron 60 seconds instead of pg_net's 5-second default.
--
-- THE DEFECT
-- 20260807051518 rewrote all fifteen HTTP crons from one canonical
-- net.http_post command, which left timeout_milliseconds at pg_net's default
-- of 5000. The first tick to exceed it was sweep-connect-balance at
-- 18:30 UTC the same day: a cold boot plus a Stripe balance read took
-- 5000.87 ms, pg_net gave up, and the response row recorded
-- status_code = NULL with "Timeout of 5000 ms reached".
--
-- cron.job_run_details still said "succeeded" — pg_net queues the request and
-- returns a row id, so the cron's own ledger cannot see this. That is the
-- exact silent-failure shape 20260807051518 exists to end, reintroduced one
-- layer down.
--
-- Today the balance was empty, so nothing was lost. But these crons do real
-- work per row — the sweep makes one Stripe balance call per tradie with a
-- payable balance, auto-release-payments creates payouts, the recurring sweep
-- retrieves payment intents — and any tick with more than a handful of rows
-- will run past five seconds as a matter of course. A client-side timeout
-- also risks the runtime cancelling the invocation mid-run; every one of
-- these functions is idempotent, so the next tick recovers, but a cron that
-- can only finish its work when the work is small is not a working cron.
--
-- THE FIX
-- Same canonical rewrite as 20260807051518 — same jobnames, same schedules,
-- same vault-read auth header — with timeout_milliseconds := 60000 on the
-- request. Sixty seconds sits far above any observed tick and safely inside
-- pg_net's allowed range. pg_cron upserts by jobname, so each job is
-- rewritten in place with no gap.
--
-- The five pure-SQL crons make no HTTP call and are untouched, as before.

-- ── 1. Fail loudly if the secret is missing ─────────────────────────────────
-- Same guard as 20260807051518, for the same reason: on a fresh rebuild the
-- vault will not have this secret, and without this block the rebuild would
-- "succeed" and hand over a database whose money crons silently 401.
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
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );$cmd$,
      base_url || j.fn
    );

    -- pg_cron 1.4+ upserts on jobname: this replaces the command in place.
    PERFORM cron.schedule(j.jobname, j.schedule, cmd);
  END LOOP;
END
$reschedule$;
