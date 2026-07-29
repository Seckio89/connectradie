-- Migration: extend_job_team_assignments_workforce
-- Type: ALTER (Participant tier — unchanged)
-- Description: job_team_assignments already IS the worker↔job link the Workforce
-- module needs (worker, job, role_on_job, scheduling). Two gaps close here:
-- an explicit unassigned_at, and visibility for the job's client.

-- ============================================================
-- 1. ALTER TABLE
-- ============================================================
ALTER TABLE public.job_team_assignments
  ADD COLUMN IF NOT EXISTS unassigned_at TIMESTAMPTZ;

COMMENT ON COLUMN public.job_team_assignments.unassigned_at IS
  'Set when a worker comes off a job. Kept alongside status so assignment history stays readable after the fact.';

-- ============================================================
-- 2. RLS — add the job's client to the SELECT policy
-- ============================================================
-- Live policy verified before writing: "Users can view relevant job assignments"
-- covers business_owner_id OR the assigned member, with no client branch — so a
-- homeowner could not see who was coming to their own job. Replacing the single
-- consolidated policy rather than adding a second permissive one, per the
-- consolidation done in 20260226111949 (multiple permissive policies are evaluated
-- per row and were measurably slower).
DROP POLICY IF EXISTS "Users can view relevant job assignments" ON public.job_team_assignments;

CREATE POLICY "job_team_assignments_select_business_worker_or_client"
  ON public.job_team_assignments
  FOR SELECT
  TO authenticated
  USING (
    (SELECT auth.uid()) = business_owner_id
    OR EXISTS (
      SELECT 1 FROM public.business_team_members btm
      WHERE btm.id = job_team_assignments.team_member_id
        AND btm.member_profile_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_team_assignments.job_id
        AND j.client_id = (SELECT auth.uid())
    )
  );

-- ============================================================
-- 3. INDEXES
-- ============================================================
-- job_id is already covered as the leading column of the existing
-- job_team_assignments_job_id_team_member_id_key unique index, which the new client
-- branch probes. team_member_id and business_owner_id are indexed already.
-- Nothing further required.
