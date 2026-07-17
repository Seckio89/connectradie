-- Migration: fix_rls_initplan_add_fk_indexes
-- Type: Performance (RLS + indexes)
-- Description:
--   1. Advisor 0003 — the imported_calendar_visits policy calls auth.uid()
--      directly, forcing per-row re-evaluation. Wrap in (SELECT ...) so it is
--      evaluated once per query (initplan). Semantics unchanged.
--   2. Advisor 0001 — three foreign keys lack covering indexes, hurting JOINs
--      and cascading deletes.

-- ============================================================
-- 1. RLS INITPLAN FIX — imported_calendar_visits
-- ============================================================
ALTER POLICY "owner manages imported visits"
  ON public.imported_calendar_visits
  USING ((SELECT auth.uid()) = business_owner_id)
  WITH CHECK ((SELECT auth.uid()) = business_owner_id);

-- ============================================================
-- 2. MISSING FOREIGN KEY INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_ai_estimate_usage_job_id
  ON public.ai_estimate_usage (job_id);

CREATE INDEX IF NOT EXISTS idx_client_contacts_linked_profile_id
  ON public.client_contacts (linked_profile_id);

CREATE INDEX IF NOT EXISTS idx_recurring_invoices_marked_paid_by
  ON public.recurring_invoices (marked_paid_by);
