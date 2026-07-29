-- Migration: create_worker_credentials
-- Type: Participant tier, with system-write on the three verification columns
-- Description: A credential held by a roster member — the ticket, check, licence or
-- insurance itself, plus its expiry and whether we have verified it.
--
-- PRIVACY (non-negotiable): this table stores OUTCOMES, not identity evidence.
-- Whether a check passed, its reference number, and when it expires. There is
-- deliberately no column for date of birth, visa subclass, health information, or
-- any government ID number. If the UI collects one, the schema is wrong.

-- ============================================================
-- 1. CREATE TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.worker_credentials (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id      UUID NOT NULL REFERENCES public.business_team_members(id) ON DELETE CASCADE,
  credential_type_id  UUID NOT NULL REFERENCES public.credential_types(id) ON DELETE RESTRICT,
  reference_number    TEXT,
  issued_at           DATE,
  expires_at          DATE,
  document_path       TEXT,
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  verified_at         TIMESTAMPTZ,
  verified_by         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT worker_credentials_verification_status_check CHECK (verification_status IN (
    'unverified', 'pending', 'verified', 'rejected', 'expired'
  ))
);

COMMENT ON TABLE public.worker_credentials IS
  'Credentials held by a roster member. Stores outcomes and expiries only — never identity documents, DOB, visa subclass, or government ID numbers.';

-- ⚠️ `team_member_id` here means a business_team_members.id, matching
-- job_team_assignments and phase_team_assignments. It does NOT follow
-- time_entries.team_member_id, which has no foreign key at all and actually holds a
-- profiles.id. That column name is overloaded across the schema; this one is stated
-- explicitly so the ambiguity is not inherited silently.
COMMENT ON COLUMN public.worker_credentials.team_member_id IS
  'FK to business_team_members.id (a roster row) — NOT a profiles.id. Contrast time_entries.team_member_id, which holds a profiles.id with no FK.';

COMMENT ON COLUMN public.worker_credentials.document_path IS
  'Storage path within the private worker-credentials bucket. NEVER a URL — reads go through a short-TTL signed URL.';
COMMENT ON COLUMN public.worker_credentials.verification_status IS
  'System-managed. Writable only by service_role, enforced by trigger, not by policy wording alone.';

-- ============================================================
-- 2. ENABLE RLS
-- ============================================================
ALTER TABLE public.worker_credentials ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. RLS POLICIES
-- ============================================================
-- Both branches, per the brief: the owning business AND the worker themselves once
-- member_profile_id is set. Archived roster rows drop out of scope with the worker.

CREATE POLICY "worker_credentials_select_business_or_worker"
  ON public.worker_credentials
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.business_team_members btm
      WHERE btm.id = worker_credentials.team_member_id
        AND btm.archived_at IS NULL
        AND (
          btm.business_owner_id = (SELECT auth.uid())
          OR btm.member_profile_id = (SELECT auth.uid())
        )
    )
  );

CREATE POLICY "worker_credentials_insert_business_or_worker"
  ON public.worker_credentials
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.business_team_members btm
      WHERE btm.id = worker_credentials.team_member_id
        AND btm.archived_at IS NULL
        AND (
          btm.business_owner_id = (SELECT auth.uid())
          OR btm.member_profile_id = (SELECT auth.uid())
        )
    )
  );

CREATE POLICY "worker_credentials_update_business_or_worker"
  ON public.worker_credentials
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.business_team_members btm
      WHERE btm.id = worker_credentials.team_member_id
        AND btm.archived_at IS NULL
        AND (
          btm.business_owner_id = (SELECT auth.uid())
          OR btm.member_profile_id = (SELECT auth.uid())
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.business_team_members btm
      WHERE btm.id = worker_credentials.team_member_id
        AND btm.archived_at IS NULL
        AND (
          btm.business_owner_id = (SELECT auth.uid())
          OR btm.member_profile_id = (SELECT auth.uid())
        )
    )
  );

-- DELETE: the owning business only. A worker can correct their own record but
-- cannot destroy the business's compliance history.
CREATE POLICY "worker_credentials_delete_business"
  ON public.worker_credentials
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.business_team_members btm
      WHERE btm.id = worker_credentials.team_member_id
        AND btm.business_owner_id = (SELECT auth.uid())
    )
  );

-- ============================================================
-- 4. COLUMN-LEVEL WRITE GUARD ON THE VERIFICATION FIELDS
-- ============================================================
-- A policy alone cannot stop this. The business already holds UPDATE on the row, so
-- the row-level predicate passes and they could set verification_status = 'verified'
-- on their own worker. Only a column-level trigger closes it.
--
-- ⚠️ SECURITY INVOKER is load-bearing. Under SECURITY DEFINER, current_user becomes
-- the function OWNER, so a caller-identity guard inside it passes EVERYONE — that is
-- exactly how the 20260718020000 billing lock was dead for its entire life. Because
-- this runs as INVOKER, PostgREST's `SET LOCAL ROLE` means current_user is genuinely
-- the request role, and comparing against it is meaningful.
CREATE OR REPLACE FUNCTION public.enforce_worker_credential_verification_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_raw_claims TEXT;
  v_claim_role TEXT;
  v_privileged BOOLEAN;
BEGIN
  -- Guard the cast: Supabase can set this GUC to an empty string, and ''::jsonb throws.
  v_raw_claims := nullif(current_setting('request.jwt.claims', true), '');
  v_claim_role := CASE WHEN v_raw_claims IS NULL THEN NULL ELSE (v_raw_claims::jsonb ->> 'role') END;

  -- Privileged when the request role is service_role. current_user is checked too:
  -- PostgREST issues SET LOCAL ROLE per request, and a direct psql/migration
  -- connection runs as postgres/supabase_admin, which is already a trusted path.
  v_privileged := (
    v_claim_role = 'service_role'
    OR current_user IN ('service_role', 'postgres', 'supabase_admin')
  );

  IF v_privileged THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.verification_status IS DISTINCT FROM 'unverified'
       OR NEW.verified_at IS NOT NULL
       OR NEW.verified_by IS NOT NULL
    THEN
      RAISE EXCEPTION
        'verification_status, verified_at and verified_by are system-managed and cannot be set directly'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NEW.verification_status IS DISTINCT FROM OLD.verification_status
       OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
       OR NEW.verified_by IS DISTINCT FROM OLD.verified_by
    THEN
      RAISE EXCEPTION
        'verification_status, verified_at and verified_by are system-managed and cannot be modified directly'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_worker_credential_verification_fields() FROM anon, authenticated, public;

DROP TRIGGER IF EXISTS trg_worker_credentials_verification_guard ON public.worker_credentials;
CREATE TRIGGER trg_worker_credentials_verification_guard
  BEFORE INSERT OR UPDATE ON public.worker_credentials
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_worker_credential_verification_fields();

-- ============================================================
-- 5. INDEXES
-- ============================================================
-- The expiry sweep scans this; the roster sorts by it.
CREATE INDEX IF NOT EXISTS idx_worker_credentials_expires_at
  ON public.worker_credentials (expires_at);

-- Non-unique on purpose: a renewed credential sits alongside the one it supersedes,
-- and the UI picks the latest. A unique constraint here would block renewals.
CREATE INDEX IF NOT EXISTS idx_worker_credentials_member_type
  ON public.worker_credentials (team_member_id, credential_type_id);

-- Every FK indexed.
CREATE INDEX IF NOT EXISTS idx_worker_credentials_credential_type_id
  ON public.worker_credentials (credential_type_id);
CREATE INDEX IF NOT EXISTS idx_worker_credentials_verified_by
  ON public.worker_credentials (verified_by) WHERE verified_by IS NOT NULL;

-- ============================================================
-- 6. UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_worker_credentials_updated_at()
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

REVOKE EXECUTE ON FUNCTION public.update_worker_credentials_updated_at() FROM anon, authenticated, public;

DROP TRIGGER IF EXISTS trg_worker_credentials_updated_at ON public.worker_credentials;
CREATE TRIGGER trg_worker_credentials_updated_at
  BEFORE UPDATE ON public.worker_credentials
  FOR EACH ROW
  EXECUTE FUNCTION public.update_worker_credentials_updated_at();
