-- Migration: tighten_disputes_rls
-- Description:
--   🔴 Anyone could freeze any tradie's payout. Found while scoping the
--   client-facing dispute flow.
--
--   The disputes INSERT policy was, in full:
--       WITH CHECK ((SELECT auth.uid()) = opened_by)
--   Nothing tied job_id or against_user to the caller. So any signed-in user
--   could POST /rest/v1/disputes naming an arbitrary job and an arbitrary
--   victim — and because auto-release-payments:118-126 excludes any job with an
--   open/under_review dispute, that single row froze the tradie's payout
--   indefinitely. No relationship, no work, no UI required.
--
--   PROVED BY EXECUTION before this migration: a user unrelated to the job
--   inserted a dispute against its tradie and it was ALLOWED.
--
--   (Two earlier probe attempts returned a false BLOCKED because `id <> NULL`
--   is NULL in SQL and silently excluded every candidate attacker. Worth
--   remembering: a negative result from an RLS probe is only meaningful once
--   you have confirmed the actor it selected is non-null.)
--
--   Second gap fixed here: SELECT and UPDATE tested `profiles.role = 'admin'`,
--   but the platform owner is role='tradie' with is_admin=true by design
--   (20260720170000 — the owner stays a normal Pro to clients). So the OWNER
--   could not see or resolve disputes in AdminDisputes.tsx at all; only
--   admin@connectradie.com could. Now uses public.is_admin(), which covers both.
--
--   Verified after, in one rolled-back transaction:
--     unrelated user raises dispute        BLOCKED 42501  (was ALLOWED)
--     real client on their own job         ALLOWED
--     second open dispute on same job      23505
--     self-dispute                         BLOCKED
--     owner can see disputes               1 row (was 0)
--     auto-release skips the disputed job  true

DROP POLICY IF EXISTS "Users can create disputes" ON public.disputes;
CREATE POLICY "Users can create disputes" ON public.disputes
  FOR INSERT TO authenticated
  WITH CHECK (
    opened_by = (SELECT auth.uid())
    AND against_user <> (SELECT auth.uid())          -- no self-disputes
    AND EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_id
        -- caller is on the job
        AND (j.client_id = (SELECT auth.uid()) OR j.tradie_id = (SELECT auth.uid()))
        -- and so is the person being disputed
        AND (j.client_id = against_user OR j.tradie_id = against_user)
    )
  );

DROP POLICY IF EXISTS "Users can view own or admin can view all disputes" ON public.disputes;
CREATE POLICY "Users can view own or admin can view all disputes" ON public.disputes
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = opened_by
    OR (SELECT auth.uid()) = against_user
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Admins can update disputes" ON public.disputes;
CREATE POLICY "Admins can update disputes" ON public.disputes
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- One live dispute per job. Without this a genuine party can still spam rows,
-- and each one independently blocks release.
DROP INDEX IF EXISTS public.disputes_one_open_per_job;
CREATE UNIQUE INDEX disputes_one_open_per_job
  ON public.disputes (job_id)
  WHERE status IN ('open', 'under_review');
