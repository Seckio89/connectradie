-- Migration: create_business_verifications
-- Type: System-write table (verify-abn edge function writes; tradie reads own;
--       admin reads all and may update status + admin_notes only)
-- Description: The outcome of an ABN Lookup (ABR) check for a tradie. One row per
-- user, upserted by verify-abn. Stores what the register said (status, names,
-- GST) and whether the name the tradie claimed matched it.
--
-- PRIVACY: this holds public-register data only. An ABN, its entity name and its
-- GST status are all publicly searchable on abr.business.gov.au; nothing here is
-- identity evidence (see D8 in docs/governance/DECISIONS-PENDING.md).

-- ============================================================
-- 1. CREATE TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.business_verifications (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  abn                   TEXT NOT NULL CHECK (abn ~ '^[0-9]{11}$'),
  abn_status            TEXT NOT NULL,                 -- 'Active' | 'Cancelled' | 'NotFound'
  entity_name           TEXT,
  business_names        TEXT[] NOT NULL DEFAULT '{}',
  entity_type           TEXT,
  gst_registered        BOOLEAN NOT NULL DEFAULT false,
  abr_state             TEXT,
  abr_postcode          TEXT,
  claimed_business_name TEXT NOT NULL,
  name_match            BOOLEAN NOT NULL DEFAULT false,
  status                TEXT NOT NULL CHECK (status IN ('verified', 'review', 'failed')),
  admin_notes           TEXT,
  checked_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT business_verifications_user_id_key UNIQUE (user_id)
);

COMMENT ON TABLE public.business_verifications IS
  'Outcome of the ABR lookup for a tradie''s ABN — system-write only, upserted by the verify-abn edge function via service_role. One row per user; re-running verify-abn updates it.';
COMMENT ON COLUMN public.business_verifications.status IS
  'verified = Active AND claimed name matched the register; review = Active but no name match (admin decides); failed = Cancelled or not found.';
COMMENT ON COLUMN public.business_verifications.gst_registered IS
  'Public ABR fact. Shown as a badge on the tradie''s public profile.';

-- ============================================================
-- 2. ENABLE RLS
-- ============================================================
ALTER TABLE public.business_verifications ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. RLS POLICIES
-- ============================================================

-- SELECT: the tradie reads their own row.
DROP POLICY IF EXISTS "business_verifications_select_own" ON public.business_verifications;
CREATE POLICY "business_verifications_select_own"
  ON public.business_verifications
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- SELECT: admins read every row (is_admin() covers role='admin' and the
-- profiles.is_admin entitlement flag — the one admin mechanism this repo has).
DROP POLICY IF EXISTS "business_verifications_select_admin" ON public.business_verifications;
CREATE POLICY "business_verifications_select_admin"
  ON public.business_verifications
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- UPDATE: admins only. Which COLUMNS they may change is enforced by the trigger
-- below — a policy cannot restrict columns, and without the trigger an admin
-- row update could rewrite the ABN or the register facts.
DROP POLICY IF EXISTS "business_verifications_update_admin" ON public.business_verifications;
CREATE POLICY "business_verifications_update_admin"
  ON public.business_verifications
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- No INSERT or DELETE policy for authenticated. service_role bypasses RLS, so the
-- edge function can still write while a signed-in user provably cannot.

-- ============================================================
-- 4. COLUMN GUARD — admins may change status and admin_notes, nothing else
-- ============================================================
-- SECURITY INVOKER is load-bearing: under DEFINER current_user is the function
-- owner and a caller-identity check passes everyone (see worker_credentials).
CREATE OR REPLACE FUNCTION public.enforce_business_verification_admin_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_raw_claims TEXT;
  v_claim_role TEXT;
BEGIN
  v_raw_claims := nullif(current_setting('request.jwt.claims', true), '');
  v_claim_role := CASE WHEN v_raw_claims IS NULL THEN NULL ELSE (v_raw_claims::jsonb ->> 'role') END;

  IF v_claim_role = 'service_role'
     OR current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'business_verifications rows are written by the verify-abn function only'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.user_id               IS DISTINCT FROM OLD.user_id
     OR NEW.abn                   IS DISTINCT FROM OLD.abn
     OR NEW.abn_status            IS DISTINCT FROM OLD.abn_status
     OR NEW.entity_name           IS DISTINCT FROM OLD.entity_name
     OR NEW.business_names        IS DISTINCT FROM OLD.business_names
     OR NEW.entity_type           IS DISTINCT FROM OLD.entity_type
     OR NEW.gst_registered        IS DISTINCT FROM OLD.gst_registered
     OR NEW.abr_state             IS DISTINCT FROM OLD.abr_state
     OR NEW.abr_postcode          IS DISTINCT FROM OLD.abr_postcode
     OR NEW.claimed_business_name IS DISTINCT FROM OLD.claimed_business_name
     OR NEW.name_match            IS DISTINCT FROM OLD.name_match
     OR NEW.checked_at            IS DISTINCT FROM OLD.checked_at
     OR NEW.created_at            IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Only status and admin_notes may be changed on business_verifications'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_business_verification_admin_columns() FROM anon, authenticated, public;

DROP TRIGGER IF EXISTS trg_business_verifications_admin_columns ON public.business_verifications;
CREATE TRIGGER trg_business_verifications_admin_columns
  BEFORE INSERT OR UPDATE ON public.business_verifications
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_business_verification_admin_columns();

-- ============================================================
-- 5. MIRROR TO profiles.abn_verified
-- ============================================================
-- The quote gate (src/hooks/useTradieVerification.ts) and the public listing
-- both read profiles.abn_verified. Keeping that flag in step with this table
-- from a trigger means an admin flipping review -> verified takes effect in the
-- app without a second write path. SECURITY DEFINER because the admin's own
-- role has no UPDATE on another user's profile row.
CREATE OR REPLACE FUNCTION public.sync_profile_abn_from_verification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.profiles
     SET abn_number      = NEW.abn,
         abn_entity_name = COALESCE(NEW.entity_name, NEW.business_names[1]),
         abn_verified    = (NEW.status = 'verified')
   WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_profile_abn_from_verification() FROM anon, authenticated, public;

DROP TRIGGER IF EXISTS trg_business_verifications_sync_profile ON public.business_verifications;
CREATE TRIGGER trg_business_verifications_sync_profile
  AFTER INSERT OR UPDATE OF status, abn, entity_name, business_names ON public.business_verifications
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_abn_from_verification();

-- ============================================================
-- 6. INDEXES
-- ============================================================
-- user_id is covered by the UNIQUE constraint; status drives the admin queue.
CREATE INDEX IF NOT EXISTS idx_business_verifications_status
  ON public.business_verifications (status);

-- ============================================================
-- 7. UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_business_verifications_updated_at()
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

REVOKE EXECUTE ON FUNCTION public.update_business_verifications_updated_at() FROM anon, authenticated, public;

DROP TRIGGER IF EXISTS trg_business_verifications_updated_at ON public.business_verifications;
CREATE TRIGGER trg_business_verifications_updated_at
  BEFORE UPDATE ON public.business_verifications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_business_verifications_updated_at();
