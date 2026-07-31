-- Cover the five foreign keys that had no index.
--
-- Supabase performance advisor lint 0001_unindexed_foreign_keys; audit
-- findings #3 and #6 in AUDIT-REPORT-2026-07-30.md. Without a covering index
-- Postgres sequential-scans the child table on every join through the FK and
-- on every parent delete/update that cascades.
--
-- platform_fee_charges.job_id is the one that matters: it is on the money
-- path (fee reconciliation joins charges to jobs). The other four are
-- low-traffic but there is no reason to leave them uncovered.
--
-- Column names verified against pg_constraint on the live database, not
-- inferred from the constraint names.
--
-- No CONCURRENTLY: migrations run inside a transaction, where it is an error.
-- These tables are empty-to-tiny, so the brief lock costs nothing.

CREATE INDEX IF NOT EXISTS idx_platform_fee_charges_job_id
  ON public.platform_fee_charges (job_id);

CREATE INDEX IF NOT EXISTS idx_platform_fee_invoices_adjusts_invoice_id
  ON public.platform_fee_invoices (adjusts_invoice_id);

CREATE INDEX IF NOT EXISTS idx_custom_task_suggestions_submitted_by
  ON public.custom_task_suggestions (submitted_by);

CREATE INDEX IF NOT EXISTS idx_custom_task_suggestions_reviewed_by
  ON public.custom_task_suggestions (reviewed_by);

CREATE INDEX IF NOT EXISTS idx_service_decline_tokens_recurring_job_id
  ON public.service_decline_tokens (recurring_job_id);
