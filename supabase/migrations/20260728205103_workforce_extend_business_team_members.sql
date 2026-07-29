-- Migration: workforce_extend_business_team_members
-- Type: ALTER (Participant tier — unchanged)
-- Description: Extends the incumbent roster table for the Workforce & Compliance
-- module. We deliberately do NOT create a new `workers` table: business_team_members
-- already carries ~80% of the required columns, has 5 FK dependents
-- (job_team_assignments, phase_team_assignments, recurring_jobs.assigned_team_member_id,
-- imported_calendar_visits) and ~20 call sites. A parallel table would make a THIRD
-- people model alongside profiles.employer_id and this one.
--
-- PRIVACY (non-negotiable): this module stores credential OUTCOMES only. No date of
-- birth, visa subclass, health information, or government ID number is stored here or
-- in worker_credentials. If the UI ever collects one of those, the schema is wrong.

-- ============================================================
-- 1. ALTER TABLE
-- ============================================================
ALTER TABLE public.business_team_members
  ADD COLUMN IF NOT EXISTS archived_at              TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS started_at               DATE,
  ADD COLUMN IF NOT EXISTS employment_type          TEXT NOT NULL DEFAULT 'employee_full_time',
  ADD COLUMN IF NOT EXISTS available_for_overflow   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS portable_profile_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS claim_token_hash         TEXT,
  ADD COLUMN IF NOT EXISTS claim_token_expires_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claim_token_used_at      TIMESTAMPTZ;

COMMENT ON COLUMN public.business_team_members.archived_at IS
  'Soft delete. SELECT policy filters these out; rows are retained for assignment history.';
COMMENT ON COLUMN public.business_team_members.employment_type IS
  'Finer-grained than role, which is retained unchanged for ~20 existing call sites. Recorded as declared by the business - the platform makes NO employee-vs-contractor determination.';
COMMENT ON COLUMN public.business_team_members.available_for_overflow IS
  'SEAM ONLY — no logic, no UI, no cross-business policy. Blocked on labour-hire licensing advice.';
COMMENT ON COLUMN public.business_team_members.portable_profile_enabled IS
  'SEAM ONLY — no logic, no UI, no cross-business policy. Blocked on labour-hire licensing advice.';
COMMENT ON COLUMN public.business_team_members.claim_token_hash IS
  'SHA-256 hex of the invite claim token. The raw token is never stored or returned by the API.';

-- ============================================================
-- 2. CHECK CONSTRAINTS (text + CHECK — this repo has exactly one
--    CREATE TYPE ... AS ENUM in 270 migrations; do not add a second)
-- ============================================================
ALTER TABLE public.business_team_members
  DROP CONSTRAINT IF EXISTS business_team_members_status_check;
ALTER TABLE public.business_team_members
  ADD CONSTRAINT business_team_members_status_check
  CHECK (status IN ('invited', 'active', 'inactive', 'archived'));

ALTER TABLE public.business_team_members
  DROP CONSTRAINT IF EXISTS business_team_members_employment_type_check;
ALTER TABLE public.business_team_members
  ADD CONSTRAINT business_team_members_employment_type_check
  CHECK (employment_type IN (
    'employee_full_time', 'employee_part_time', 'employee_casual', 'subcontractor'
  ));

-- ============================================================
-- 3. BACKFILL
-- ============================================================
-- `role` is NOT collapsed into employment_type — it stays as the existing
-- employee/subcontractor/apprentice vocabulary that get_service_worker_details and
-- the Team page depend on. Only the subcontractor case maps across cleanly; an
-- apprentice is a role, not an employment basis, so it defaults to full-time.
UPDATE public.business_team_members
   SET employment_type = 'subcontractor'
 WHERE role = 'subcontractor'
   AND employment_type = 'employee_full_time';

UPDATE public.business_team_members
   SET started_at = joined_at::date
 WHERE started_at IS NULL
   AND joined_at IS NOT NULL;

-- ============================================================
-- 4. RLS — amend the existing consolidated SELECT policy to hide archived rows
-- ============================================================
-- Live policy set verified before writing: ONE consolidated SELECT policy
-- ("Users can view relevant team members") covering owner OR member, plus
-- business_team_members_insert_owner_or_self / update / delete. RLS is already enabled.
DROP POLICY IF EXISTS "Users can view relevant team members" ON public.business_team_members;

CREATE POLICY "business_team_members_select_owner_or_member"
  ON public.business_team_members
  FOR SELECT
  TO authenticated
  USING (
    archived_at IS NULL
    AND (
      (SELECT auth.uid()) = business_owner_id
      OR (SELECT auth.uid()) = member_profile_id
    )
  );

-- ============================================================
-- 5. INDEXES
-- ============================================================
-- Roster reads always scope to one business and exclude archived rows.
CREATE INDEX IF NOT EXISTS idx_business_team_members_owner_active
  ON public.business_team_members (business_owner_id)
  WHERE archived_at IS NULL;

-- worker-claim-profile looks up by token hash. Partial: only unclaimed invites.
CREATE INDEX IF NOT EXISTS idx_business_team_members_claim_token
  ON public.business_team_members (claim_token_hash)
  WHERE claim_token_hash IS NOT NULL AND claim_token_used_at IS NULL;

-- ============================================================
-- 6. UPDATED_AT TRIGGER
-- ============================================================
-- Verified against the live DB: business_team_members has an updated_at COLUMN but
-- NO trigger — it has never been maintained since the table was created in
-- 20260218053945. Compliance reads rely on it, so wire it up now.
CREATE OR REPLACE FUNCTION public.update_business_team_members_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_business_team_members_updated_at() FROM anon, authenticated, public;

DROP TRIGGER IF EXISTS trg_business_team_members_updated_at ON public.business_team_members;
CREATE TRIGGER trg_business_team_members_updated_at
  BEFORE UPDATE ON public.business_team_members
  FOR EACH ROW
  EXECUTE FUNCTION public.update_business_team_members_updated_at();
