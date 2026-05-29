-- Flip the `documents` and `job-attachments` buckets to private and replace
-- the public-CDN-with-broad-policy model with explicit, owner-aware RLS.
-- Once private, files are only accessible via signed URLs, and the signed-URL
-- API itself respects the SELECT policies defined here.
--
-- Path conventions (set by upload sites in src/):
--   documents:        <owner_uid>/<filename>
--   job-attachments:  <uploader_uid>/<job_id>-<rest>
--
-- Both buckets keep INSERT scoped to the owner's folder (defence-in-depth
-- vs the existing app-level checks). SELECT is the interesting part:
--   documents:        owner OR admin
--   job-attachments:  uploader OR job client OR job tradie OR any
--                     quoting tradie OR admin

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Helper: derive whether the caller may read a given job-attachment path
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.can_read_job_attachment(path text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_owner    uuid;
  v_job_id   uuid;
  v_segments text[];
  v_filename text;
  v_job_id_text text;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;

  v_segments := string_to_array(path, '/');
  IF array_length(v_segments, 1) < 2 THEN RETURN false; END IF;

  -- Owner is always the first segment.
  BEGIN
    v_owner := v_segments[1]::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN false;
  END;

  IF v_owner = v_uid THEN RETURN true; END IF;

  -- The filename is "<job_id>-<rest>" — extract job_id (first 36 chars).
  v_filename := v_segments[2];
  IF length(v_filename) < 36 THEN RETURN false; END IF;
  v_job_id_text := substring(v_filename FROM 1 FOR 36);
  BEGIN
    v_job_id := v_job_id_text::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN false;
  END;

  -- Job client or assigned tradie.
  IF EXISTS (
    SELECT 1 FROM public.jobs
     WHERE id = v_job_id
       AND (client_id = v_uid OR tradie_id = v_uid)
  ) THEN
    RETURN true;
  END IF;

  -- Any tradie with a quote on this job (so quoting tradies can view photos).
  IF EXISTS (
    SELECT 1 FROM public.quotes
     WHERE job_id = v_job_id AND tradie_id = v_uid
  ) THEN
    RETURN true;
  END IF;

  -- Admins see all.
  IF EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_uid AND role = 'admin'
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.can_read_job_attachment(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.can_read_job_attachment(text) TO authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. documents bucket — flip private, replace policies
-- ──────────────────────────────────────────────────────────────────────────

UPDATE storage.buckets SET public = false WHERE id = 'documents';

-- The old broad SELECT policy on documents was dropped in the earlier
-- security_critical_revokes migration; the unscoped INSERT/UPDATE/DELETE
-- (if any) need to be replaced too. Drop any leftover documents policies
-- defensively, then create scoped ones.
DROP POLICY IF EXISTS "Anyone can view documents"                ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Owners can read documents"                ON storage.objects;
DROP POLICY IF EXISTS "Owners can upload documents"              ON storage.objects;
DROP POLICY IF EXISTS "Owners can update documents"              ON storage.objects;
DROP POLICY IF EXISTS "Owners can delete documents"              ON storage.objects;

CREATE POLICY "Owners can upload documents"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Owners can read documents"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
      )
    )
  );

CREATE POLICY "Owners can update documents"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Owners can delete documents"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ──────────────────────────────────────────────────────────────────────────
-- 3. job-attachments bucket — flip private, replace policies
-- ──────────────────────────────────────────────────────────────────────────

UPDATE storage.buckets SET public = false WHERE id = 'job-attachments';

DROP POLICY IF EXISTS "Authenticated users can view job attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload job attachments" ON storage.objects;
DROP POLICY IF EXISTS "Job attachments readable by participants" ON storage.objects;
DROP POLICY IF EXISTS "Owners can upload job attachments" ON storage.objects;
DROP POLICY IF EXISTS "Owners can update job attachments" ON storage.objects;
DROP POLICY IF EXISTS "Owners can delete job attachments" ON storage.objects;

CREATE POLICY "Owners can upload job attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'job-attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Job attachments readable by participants"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'job-attachments'
    AND public.can_read_job_attachment(name)
  );

CREATE POLICY "Owners can update job attachments"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'job-attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'job-attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Owners can delete job attachments"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'job-attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
