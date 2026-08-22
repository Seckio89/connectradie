-- Migration: restore_reviews_completed_job_guard
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT WAS LOST, AND WHERE
-- ─────────────────────────────────────────────────────────────────────────────
-- 20260131040641_create_reviews_system.sql created the reviews INSERT policy
-- with two conditions: you are the author, AND the job is yours and completed.
--
--   WITH CHECK (
--     auth.uid() = client_id AND
--     EXISTS (SELECT 1 FROM jobs
--             WHERE jobs.id = job_id
--               AND jobs.client_id = auth.uid()
--               AND jobs.status = 'completed')
--   )
--
-- 20260218132120_fix_rls_auth_uid_performance_part1.sql was a performance-only
-- sweep — wrapping auth.uid() in (select ...) so Postgres evaluates it once per
-- statement instead of once per row. It dropped and recreated this policy and
-- kept only the first condition:
--
--   WITH CHECK (client_id = (select auth.uid()))
--
-- The EXISTS clause was not deliberately removed — nothing in that migration
-- discusses reviews, and the policy kept its original name, which reads as
-- though the check is still there. None of the four later migrations touching
-- reviews (20260216081727, 20260223103028, 20260226000000, 20260226111949,
-- 20260412100000) restored it.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY IT MATTERS
-- ─────────────────────────────────────────────────────────────────────────────
-- With only the author check, any authenticated user can insert a review naming
-- any tradie_id, for a job they had no part in — or with job_id NULL, which the
-- column allows. UNIQUE(job_id, client_id) does not stop repeats in that case,
-- because NULLs are distinct in a Postgres unique constraint.
--
-- The tradie_ratings view (20260218141532) is avg(rating) grouped by tradie_id,
-- and it is what renders a tradie's public star rating. So fabricated rows move
-- public ratings directly, in either direction — a tradie inflating their own,
-- or anyone deflating a competitor's.
--
-- This restores 20260131040641's intent while keeping 20260218132120's
-- (select auth.uid()) form, so the performance property is preserved. It is not
-- a behaviour change for legitimate reviews: canUserReviewJob() in
-- src/lib/reviews.ts already refuses exactly these cases client-side, and
-- src/pages/LeaveReview.tsx — the only INSERT into this table anywhere in the
-- codebase — always supplies a real job_id.
--
-- The policy name is deliberately unchanged. 20260223103028 and 20260226111949
-- both DROP POLICY IF EXISTS by this name; renaming it would leave the
-- permissive version live alongside the restored one.
--
-- UPDATE and DELETE are untouched — they are author-scoped already (plus
-- is_admin() on delete, from 20260226111949) and are not part of this defect.

DROP POLICY IF EXISTS "Clients can create reviews for their completed jobs" ON public.reviews;

CREATE POLICY "Clients can create reviews for their completed jobs" ON public.reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    client_id = (select auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.jobs j
      WHERE j.id = reviews.job_id
        AND j.client_id = (select auth.uid())
        AND j.status = 'completed'
    )
  );
