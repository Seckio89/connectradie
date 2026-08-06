-- Migration: variations_require_fundable_escrow
--
-- A variation can only ever be paid out of escrow the platform is still
-- holding. approve-variation stamps a `pending_increase` slot on a
-- job_funding payment with status='completed' — so once that payment flips to
-- 'released', there is nothing left to top up and the function can only return
--
--   "The payment for this job has already been released to the tradie, so it
--    can't be topped up. Ask them to invoice you for the extra work."
--
-- The INSERT policy from 20260803035919 checks only `jobs.status = 'in_progress'`.
-- Escrow release does NOT move a job off 'in_progress' (the release window runs
-- from jobs.status='completed', and auto-release leaves the status alone), so a
-- tradie can raise a variation on a job whose money already went out.
-- _shared/expireVariations.ts lapses outstanding variations *at* release time
-- and never runs again, so one created afterwards is never swept: the client
-- sees a live amber "approve & fund" block whose only possible outcome is that
-- 400. Nothing in the UI explains why it cannot be actioned.
--
-- This adds the missing half of the predicate: the job must still have
-- collectable escrow at the moment the variation is raised.

-- ── 1. Is there escrow still held for this job? ─────────────────────────────
-- Deliberately NOT job_has_platform_escrow (20260727022754). That one counts
-- 'released' as well, because a dispute over money already paid out is exactly
-- the case it exists for. A variation is the opposite: released money is
-- precisely what cannot be topped up. Two rules, two functions — folding them
-- into one flag with a boolean argument would make the next reader guess which
-- behaviour they were getting.
--
-- SECURITY DEFINER is safe for the same reason it is there: the function takes
-- the job id as an ARGUMENT and returns a boolean, making no decision about who
-- the caller is. It needs DEFINER because the tradie raising the variation has
-- no RLS read on the client's payment row.
CREATE OR REPLACE FUNCTION public.job_has_fundable_escrow(p_job_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.payments
    WHERE job_id = p_job_id
      AND payment_type = 'job_funding'
      AND status = 'completed'
  );
$$;

COMMENT ON FUNCTION public.job_has_fundable_escrow(uuid) IS
  'True when ConnecTradie still holds collectable escrow for this job (a job_funding '
  'payment at status=completed). Mirrors the lookup in approve-variation, so "a '
  'variation can be raised" and "a variation can be funded" cannot drift apart. '
  'Excludes released, unlike job_has_platform_escrow.';

REVOKE ALL ON FUNCTION public.job_has_fundable_escrow(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.job_has_fundable_escrow(uuid) TO authenticated;

-- ── 2. Fold it into the INSERT policy ───────────────────────────────────────
-- Everything else is unchanged from 20260803035919.
--
-- No BEFORE INSERT trigger, deliberately — unlike the dispute rule in
-- 20260727022754, this must NOT bind the service role. scripts/e2e-variation.mjs
-- seeds variations through the admin client, and the edge functions write this
-- table on the approve/decline paths. RLS alone reaches every caller that can
-- actually raise one from the app.
DROP POLICY IF EXISTS "Tradies can create variations for their jobs" ON public.job_variations;
CREATE POLICY "Tradies can create variations for their jobs" ON public.job_variations
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = job_variations.job_id
        AND jobs.tradie_id = (select auth.uid())
        AND jobs.status = 'in_progress'
    )
    AND public.job_has_fundable_escrow(job_variations.job_id)
  );
