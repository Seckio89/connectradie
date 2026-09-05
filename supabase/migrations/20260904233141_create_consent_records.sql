-- Migration: create_consent_records
-- Type: Immutable table (write-once, no edits, no deletes)
-- Description: A record that a user granted (or declined) consent for a specific
-- purpose, at a specific text version. First purpose: 'licence_ocr' — sending a
-- photo of a trade licence to a third-party OCR service. extract-licence refuses
-- to run without a granted row.
--
-- Nothing equivalent existed. job_cancellation_agreements records agreement to
-- job terms, keyed by job; this is per-user, per-purpose, and append-only.

-- ============================================================
-- 1. CREATE TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.consent_records (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  purpose              TEXT NOT NULL,                  -- 'licence_ocr'
  consent_text_version TEXT NOT NULL,                  -- e.g. 'licence_ocr_v1'
  granted              BOOLEAN NOT NULL,
  ip_hash              TEXT,
  user_agent           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
  -- NOTE: no updated_at — this table is immutable
);

COMMENT ON TABLE public.consent_records IS
  'Append-only log of consent decisions per user and purpose — immutable, no updates or deletes permitted. Written only through record_consent().';
COMMENT ON COLUMN public.consent_records.ip_hash IS
  'sha256 of the caller''s forwarded IP at the time of consent, never the raw address.';

-- ============================================================
-- 2. ENABLE RLS
-- ============================================================
ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. RLS POLICIES
-- ============================================================

-- SELECT: own rows, or admin.
DROP POLICY IF EXISTS "consent_records_select_own_or_admin" ON public.consent_records;
CREATE POLICY "consent_records_select_own_or_admin"
  ON public.consent_records
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id OR public.is_admin());

-- No INSERT policy for authenticated: a client could otherwise stamp any
-- ip_hash / user_agent it liked onto the one record whose job is to prove what
-- happened. Writes go through record_consent() below, which reads those from
-- the request itself.
-- No UPDATE policy — immutable.
-- No DELETE policy — immutable.

-- ============================================================
-- 4. record_consent() — the only write path for signed-in users
-- ============================================================
-- SECURITY DEFINER so it can insert into a table with no user INSERT policy.
-- Caller identity comes from auth.uid(), NOT current_user (under DEFINER,
-- current_user is the function owner — a guard on it would pass everyone).
CREATE OR REPLACE FUNCTION public.record_consent(
  p_purpose TEXT,
  p_consent_text_version TEXT,
  p_granted BOOLEAN
)
RETURNS public.consent_records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_headers jsonb;
  v_ip      text;
  v_ua      text;
  v_row     public.consent_records;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF p_purpose IS NULL OR length(trim(p_purpose)) = 0 OR length(p_purpose) > 64 THEN
    RAISE EXCEPTION 'purpose is required' USING ERRCODE = '22023';
  END IF;
  IF p_consent_text_version IS NULL OR length(trim(p_consent_text_version)) = 0 OR length(p_consent_text_version) > 64 THEN
    RAISE EXCEPTION 'consent_text_version is required' USING ERRCODE = '22023';
  END IF;

  -- PostgREST exposes the request headers as a JSON GUC. Guard the cast: the
  -- setting can be absent (direct SQL) or an empty string.
  v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  v_ip := COALESCE(
    split_part(v_headers ->> 'x-forwarded-for', ',', 1),
    v_headers ->> 'x-real-ip'
  );
  v_ua := left(v_headers ->> 'user-agent', 512);

  INSERT INTO public.consent_records (user_id, purpose, consent_text_version, granted, ip_hash, user_agent)
  VALUES (
    v_uid,
    p_purpose,
    p_consent_text_version,
    p_granted,
    CASE WHEN v_ip IS NULL OR v_ip = '' THEN NULL ELSE encode(sha256(convert_to(trim(v_ip), 'UTF8')), 'hex') END,
    v_ua
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.record_consent(TEXT, TEXT, BOOLEAN) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.record_consent(TEXT, TEXT, BOOLEAN) TO authenticated, service_role;

-- ============================================================
-- 5. INDEXES
-- ============================================================
-- extract-licence asks "latest decision for this user + purpose".
CREATE INDEX IF NOT EXISTS idx_consent_records_user_purpose_created
  ON public.consent_records (user_id, purpose, created_at DESC);
