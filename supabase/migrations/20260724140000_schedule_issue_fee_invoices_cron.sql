-- Migration: schedule_issue_fee_invoices_cron
-- Description: Run issue-fee-invoices daily so platform-commission tax invoices
--              are actually issued (pricing spec v2.1 §7A).
--
-- WHY DAILY, WHEN THE DEFAULT IS MONTHLY CONSOLIDATED
-- ---------------------------------------------------
-- Frequency is per tradie (profiles.fee_invoice_frequency):
--   'monthly'     — default; one consolidated invoice per calendar month
--   'per_release' — one invoice per released payment
--
-- The function itself decides. It only ever invoices a FINISHED month for
-- monthly tradies, so running daily cannot produce partial-month invoices; a
-- monthly cron, by contrast, would leave per_release tradies waiting up to a
-- month for an invoice they asked to receive immediately.
--
-- The function is idempotent: it claims charges by stamping invoice_id and only
-- ever picks up rows where invoice_id IS NULL, so re-running is harmless.
--
-- 18:00 UTC ≈ 04:00 AEST — outside business hours, and clear of the
-- generate-auto-invoices window (20:00–08:00 UTC).
--
-- Auth comes from the vault, matching every other cron here. Never inline a key:
-- cron.job.command stores it in cleartext (see 20260724120000, where exactly
-- that had happened).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'issue-fee-invoices-daily') THEN
    PERFORM cron.unschedule('issue-fee-invoices-daily');
  END IF;

  PERFORM cron.schedule(
    'issue-fee-invoices-daily',
    '0 18 * * *',
    $cmd$
    SELECT net.http_post(
      url := 'https://uoqygmizupdpanplpvor.supabase.co/functions/v1/issue-fee-invoices',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret FROM vault.decrypted_secrets
          WHERE name = 'service_role_key' LIMIT 1
        )
      ),
      body := '{}'::jsonb
    );
    $cmd$
  );
END;
$$;

-- ============================================================
-- VERIFICATION (run manually)
-- ============================================================
-- Scheduled and using the vault:
--   select jobname, schedule, command like '%vault.decrypted_secrets%' as uses_vault
--   from cron.job where jobname = 'issue-fee-invoices-daily';
--
-- Real HTTP result — job_run_details is NOT proof, net.http_post is
-- fire-and-forget and reports "succeeded" even on a 401:
--   select status_code, count(*), max(created)
--   from net._http_response group by status_code order by max(created) desc;
--
-- Invoices actually produced:
--   select invoice_number, tradie_profile_id, period_start, period_end,
--          total_cents, issued_at, emailed_at
--   from platform_fee_invoices order by issued_at desc;
--
-- Charges still waiting to be invoiced (a monthly tradie's current month will
-- legitimately sit here until the month ends):
--   select count(*), min(charged_at) from platform_fee_charges where invoice_id is null;
