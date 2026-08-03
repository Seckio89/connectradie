-- Make every job_variations state change server-only.
--
-- approve-variation's header has claimed since it was written that approving a
-- variation from the browser "used to be" possible and is now server-only. That
-- was never true at the database level: "Clients can update variations for
-- their jobs" (last re-created verbatim in 20260226111949) is FOR UPDATE TO
-- authenticated with USING/WITH CHECK = "caller is the job's client", and
-- nothing more. No column restriction, no value restriction. A client could
-- PATCH status='approved' and skip Stripe entirely.
--
-- The knock-on is worse than the free approval. applyPriceAdjustment guards its
-- budget raise on the row still being 'pending', so a self-approved row makes a
-- LATER genuine payment early-return: the client is charged, the money reaches
-- the tradie's Connect balance, and jobs.budget_amount never moves.
--
-- A narrower policy does not fix this. RLS predicates are row-level and never
-- compare the old row against the new one, so
--   SET status='rejected', additional_amount=99999, description='...'
-- satisfies both USING (status='pending') and WITH CHECK (status='rejected').
-- job_variations feeds dispute-evidence-summary, so a client who can rewrite
-- the amount and the text on the way past is falsifying dispute evidence.
--
-- Declining therefore moves to the new decline-variation edge function, which
-- also clears the pending_increase slot the old client-side UPDATE left behind.

-- 1. 'expired' — a variation overtaken by escrow release.
--
-- Not 'rejected'. VariationsHistory renders 'rejected' as "Declined" and
-- dispute-evidence-summary hands that word to a dispute officer. A variation
-- that lapsed because the job's money went out was nobody's decision, and in a
-- dispute that distinction is the entire argument. Set by
-- _shared/expireVariations.ts from the release paths.
ALTER TABLE public.job_variations DROP CONSTRAINT IF EXISTS job_variations_status_check;
ALTER TABLE public.job_variations
  ADD CONSTRAINT job_variations_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'expired'));

-- 2. No app role writes this table. Service role bypasses RLS and grants, so
-- the edge functions are unaffected.
--
-- The REVOKE is not redundant with the DROP. Dropping the policy leaves the
-- table-level UPDATE grant in place, and the next permissive policy anyone adds
-- would silently re-open this. Same reasoning as 20260801100807 and
-- 20260528270000.
--
-- If a client-side UPDATE is ever wanted again, the correct tool is a
-- COLUMN-level grant, not a trigger:
--   GRANT UPDATE (status) ON public.job_variations TO authenticated;
-- Postgres enforces that against the statement's SET list, which is exactly the
-- check RLS cannot perform. A BEFORE UPDATE trigger would only ever be policing
-- service_role, the one role that must be allowed through.
DROP POLICY IF EXISTS "Clients can update variations for their jobs" ON public.job_variations;
REVOKE UPDATE ON public.job_variations FROM authenticated;

-- 3. Raising a variation is only legal mid-job.
--
-- The 'in_progress' rule existed only in the UI (JobDetailsCard gates the
-- button on it), so a tradie could raise one against a completed or cancelled
-- job by calling PostgREST directly. scripts/e2e-variation.mjs seeds through
-- the service-role client and is unaffected.
DROP POLICY IF EXISTS "Tradies can create variations for their jobs" ON public.job_variations;
CREATE POLICY "Tradies can create variations for their jobs" ON public.job_variations
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM jobs
    WHERE jobs.id = job_variations.job_id
      AND jobs.tradie_id = (select auth.uid())
      AND jobs.status = 'in_progress'
  ));

-- "Job parties can view variations" (SELECT) and the updated_at trigger are
-- deliberately untouched. idx_job_variations_status is deliberately NOT
-- re-added — 20260218133427 dropped it as unused, and expireVariations filters
-- on job_id, which is indexed.
