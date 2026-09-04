-- Migration: create_licence_verifications
-- Type: System-write table (edge functions insert and decide; the tradie may edit
--       four OCR-extracted fields while status = 'extracted'; admins read all)
-- Description: One trade-licence check for a tradie. The photo lives in the private
-- licence-uploads bucket only until an admin decides; review-licence deletes it in
-- the same call and NULLs storage_path. What survives is the OUTCOME — status,
-- expiry, the register it was checked against — never the evidence.
--
-- WHY NOT worker_credentials: that table is keyed by business_team_members.id — a
-- roster member of a business — with business-owner RLS and no OCR, pre-check or
-- photo-deletion lifecycle. This is the account holder's own licence. Bolting it
-- on would have meant a nullable team_member_id and a second tenancy model on a
-- table that deliberately has one.

-- ============================================================
-- 1. CREATE TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.licence_verifications (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_category       TEXT NOT NULL,
  state_code           TEXT NOT NULL,
  register_id          UUID REFERENCES public.licence_registers(id) ON DELETE SET NULL,
  storage_path         TEXT,                          -- NULL once the photo is deleted
  -- OCR-extracted, editable by the tradie before submit
  licence_number       TEXT,
  licence_holder_name  TEXT,
  licence_class        TEXT,
  expiry_date          DATE,
  ocr_confidence       NUMERIC(4,3),
  ocr_provider         TEXT,                          -- 'huggingface:<model>' | 'self-hosted' | 'manual'
  -- automated pre-checks
  precheck_expiry_ok   BOOLEAN,
  precheck_name_match  BOOLEAN,
  precheck_class_match BOOLEAN,
  -- human decision
  status               TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'extracted', 'awaiting_review', 'verified', 'rejected', 'expired')),
  reviewed_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at          TIMESTAMPTZ,
  rejection_reason     TEXT,
  photo_deleted_at     TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT licence_verifications_state_code_check CHECK (
    state_code IN ('NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT')
  ),
  CONSTRAINT licence_verifications_ocr_confidence_check CHECK (
    ocr_confidence IS NULL OR (ocr_confidence >= 0 AND ocr_confidence <= 1)
  )
);

COMMENT ON TABLE public.licence_verifications IS
  'A tradie''s own trade-licence check. Stores the outcome, not the evidence: the photo is deleted by review-licence the moment a decision is made (storage_path NULL, photo_deleted_at set).';
COMMENT ON COLUMN public.licence_verifications.storage_path IS
  'Path within the private licence-uploads bucket ({user_id}/{uuid}.jpg). NEVER a URL. NULL after the photo is deleted.';
COMMENT ON COLUMN public.licence_verifications.status IS
  'pending -> extracted (OCR done, tradie may edit) -> awaiting_review (submitted) -> verified | rejected. verified -> expired is owned by the expire-licences sweep.';

-- ============================================================
-- 2. ENABLE RLS
-- ============================================================
ALTER TABLE public.licence_verifications ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. RLS POLICIES
-- ============================================================

-- SELECT: own rows.
DROP POLICY IF EXISTS "licence_verifications_select_own" ON public.licence_verifications;
CREATE POLICY "licence_verifications_select_own"
  ON public.licence_verifications
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- SELECT: admins read every row (the review queue).
DROP POLICY IF EXISTS "licence_verifications_select_admin" ON public.licence_verifications;
CREATE POLICY "licence_verifications_select_admin"
  ON public.licence_verifications
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- UPDATE: the tradie, on their own row, only while it is still a draft. The
-- COLUMN restriction (four editable fields) is the trigger below — a policy
-- cannot express it, and without it the tradie could set status = 'verified'.
DROP POLICY IF EXISTS "licence_verifications_update_own_extracted" ON public.licence_verifications;
CREATE POLICY "licence_verifications_update_own_extracted"
  ON public.licence_verifications
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id AND status = 'extracted')
  WITH CHECK ((SELECT auth.uid()) = user_id AND status = 'extracted');

-- No admin UPDATE policy — deliberately. The brief allowed admins to update
-- status / reviewed_* / rejection_reason directly, but a direct row update
-- cannot delete the photo. Decisions go through the review-licence edge
-- function so the photo deletion is part of the same call, every time.
-- No INSERT policy for authenticated — rows come from extract-licence.
-- No DELETE policy for authenticated.

-- ============================================================
-- 4. COLUMN GUARD — tradie edits are limited to the four OCR fields
-- ============================================================
-- SECURITY INVOKER is load-bearing (see worker_credentials): under DEFINER the
-- identity checks below would see the function owner and pass everyone.
CREATE OR REPLACE FUNCTION public.enforce_licence_verification_editable_fields()
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
    RAISE EXCEPTION 'licence_verifications rows are created by the extract-licence function only'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.status IS DISTINCT FROM 'extracted' THEN
    RAISE EXCEPTION 'A licence can only be edited before it is submitted for review'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.id                   IS DISTINCT FROM OLD.id
     OR NEW.user_id              IS DISTINCT FROM OLD.user_id
     OR NEW.trade_category       IS DISTINCT FROM OLD.trade_category
     OR NEW.state_code           IS DISTINCT FROM OLD.state_code
     OR NEW.register_id          IS DISTINCT FROM OLD.register_id
     OR NEW.storage_path         IS DISTINCT FROM OLD.storage_path
     OR NEW.ocr_confidence       IS DISTINCT FROM OLD.ocr_confidence
     OR NEW.ocr_provider         IS DISTINCT FROM OLD.ocr_provider
     OR NEW.precheck_expiry_ok   IS DISTINCT FROM OLD.precheck_expiry_ok
     OR NEW.precheck_name_match  IS DISTINCT FROM OLD.precheck_name_match
     OR NEW.precheck_class_match IS DISTINCT FROM OLD.precheck_class_match
     OR NEW.status               IS DISTINCT FROM OLD.status
     OR NEW.reviewed_by          IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_at          IS DISTINCT FROM OLD.reviewed_at
     OR NEW.rejection_reason     IS DISTINCT FROM OLD.rejection_reason
     OR NEW.photo_deleted_at     IS DISTINCT FROM OLD.photo_deleted_at
     OR NEW.created_at           IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Only licence_number, licence_holder_name, licence_class and expiry_date may be edited'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_licence_verification_editable_fields() FROM anon, authenticated, public;

DROP TRIGGER IF EXISTS trg_licence_verifications_editable_fields ON public.licence_verifications;
CREATE TRIGGER trg_licence_verifications_editable_fields
  BEFORE INSERT OR UPDATE ON public.licence_verifications
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_licence_verification_editable_fields();

-- ============================================================
-- 5. INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_licence_verifications_user_id
  ON public.licence_verifications (user_id);
-- The admin queue: awaiting_review, oldest first.
CREATE INDEX IF NOT EXISTS idx_licence_verifications_status_created
  ON public.licence_verifications (status, created_at);
-- The daily expiry sweep.
CREATE INDEX IF NOT EXISTS idx_licence_verifications_expiry_date
  ON public.licence_verifications (expiry_date) WHERE expiry_date IS NOT NULL;
-- Every FK indexed.
CREATE INDEX IF NOT EXISTS idx_licence_verifications_register_id
  ON public.licence_verifications (register_id) WHERE register_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_licence_verifications_reviewed_by
  ON public.licence_verifications (reviewed_by) WHERE reviewed_by IS NOT NULL;

-- ============================================================
-- 6. UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_licence_verifications_updated_at()
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

REVOKE EXECUTE ON FUNCTION public.update_licence_verifications_updated_at() FROM anon, authenticated, public;

DROP TRIGGER IF EXISTS trg_licence_verifications_updated_at ON public.licence_verifications;
CREATE TRIGGER trg_licence_verifications_updated_at
  BEFORE UPDATE ON public.licence_verifications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_licence_verifications_updated_at();

-- ============================================================
-- 7. PRIVATE STORAGE BUCKET: licence-uploads
-- ============================================================
-- Path convention: {user_id}/{uuid}.jpg (set by src/lib/verification.ts).
-- 5 MB, images only, private — reads are signed URLs with a 10-minute expiry,
-- and the signed-URL API itself respects the SELECT policy below.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('licence-uploads', 'licence-uploads', false, 5242880,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Tradies upload their own licence photos" ON storage.objects;
CREATE POLICY "Tradies upload their own licence photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'licence-uploads'
    AND (SELECT auth.uid())::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Licence photos readable by owner or admin" ON storage.objects;
CREATE POLICY "Licence photos readable by owner or admin"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'licence-uploads'
    AND (
      (SELECT auth.uid())::text = (storage.foldername(name))[1]
      OR public.is_admin()
    )
  );

DROP POLICY IF EXISTS "Tradies delete their own licence photos" ON storage.objects;
CREATE POLICY "Tradies delete their own licence photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'licence-uploads'
    AND (SELECT auth.uid())::text = (storage.foldername(name))[1]
  );

-- No UPDATE policy: a photo is uploaded once under a fresh uuid, never
-- overwritten in place.
