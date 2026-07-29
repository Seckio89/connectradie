-- Migration: create_worker_credentials_storage
-- Type: Private storage bucket + access predicate
-- Description: Private bucket for credential documents. Reads are via short-TTL
-- signed URLs only — never a public path, never getPublicUrl.
--
-- Path convention: <business_owner_uid>/<team_member_id>/<timestamp>_<safeName>
--
-- The usual `(storage.foldername(name))[1] = auth.uid()` policy does NOT work here.
-- The worker must also read and upload their own documents, and they are not the
-- first path segment. This uses the established predicate-function pattern instead,
-- modelled on public.can_read_job_attachment (20260528260000).

-- ============================================================
-- 1. BUCKET
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'worker-credentials',
  'worker-credentials',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 2. ACCESS PREDICATE
-- ============================================================
-- SECURITY DEFINER is correct HERE and is not the trap described in
-- worker_credentials' verification guard. This function does not compare
-- current_user against anything — it reads auth.uid(), which comes from the request
-- GUC and is unaffected by the definer switch. It needs DEFINER precisely so it can
-- read business_team_members past that table's own RLS.
CREATE OR REPLACE FUNCTION public.can_access_worker_credential(path text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
  v_uid            uuid := auth.uid();
  v_segments       text[];
  v_owner          uuid;
  v_team_member_id uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;

  v_segments := string_to_array(path, '/');
  IF array_length(v_segments, 1) < 3 THEN RETURN false; END IF;

  BEGIN
    v_owner          := v_segments[1]::uuid;
    v_team_member_id := v_segments[2]::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN false;
  END;

  -- The roster row must actually belong to the business named in segment 1,
  -- otherwise anyone could mint a path pointing at another business's worker.
  RETURN EXISTS (
    SELECT 1
      FROM public.business_team_members btm
     WHERE btm.id = v_team_member_id
       AND btm.business_owner_id = v_owner
       AND (btm.business_owner_id = v_uid OR btm.member_profile_id = v_uid)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.can_access_worker_credential(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.can_access_worker_credential(text) TO authenticated;

COMMENT ON FUNCTION public.can_access_worker_credential(text) IS
  'Storage RLS predicate for the private worker-credentials bucket. True for the owning business or the worker themselves. Verifies segment 2 (team_member_id) really belongs to segment 1 (business_owner_id) so a forged path cannot cross tenants.';

-- ============================================================
-- 3. STORAGE POLICIES
-- ============================================================
DROP POLICY IF EXISTS "worker_credentials_objects_select" ON storage.objects;
CREATE POLICY "worker_credentials_objects_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'worker-credentials' AND public.can_access_worker_credential(name));

DROP POLICY IF EXISTS "worker_credentials_objects_insert" ON storage.objects;
CREATE POLICY "worker_credentials_objects_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'worker-credentials' AND public.can_access_worker_credential(name));

DROP POLICY IF EXISTS "worker_credentials_objects_update" ON storage.objects;
CREATE POLICY "worker_credentials_objects_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'worker-credentials' AND public.can_access_worker_credential(name))
  WITH CHECK (bucket_id = 'worker-credentials' AND public.can_access_worker_credential(name));

DROP POLICY IF EXISTS "worker_credentials_objects_delete" ON storage.objects;
CREATE POLICY "worker_credentials_objects_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'worker-credentials' AND public.can_access_worker_credential(name));
