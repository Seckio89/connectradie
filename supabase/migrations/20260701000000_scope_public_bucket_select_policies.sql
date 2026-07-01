/*
  # Scope down public storage bucket SELECT (listing) policies

  ## Why
  Supabase performance/security advisor lint 0025 (public_bucket_allows_listing)
  flags five public buckets whose broad `FOR SELECT USING (bucket_id = '...')`
  policy on `storage.objects` lets ANY client (including anon) *enumerate/list*
  every file in the bucket via the Storage API. Enumeration exposes more than
  intended (e.g. other users' avatars, job photos, portfolio/cover images).

  ## Why this is safe
  - All five buckets are `public = true`. Public object URLs are served via the
    public CDN path and DO NOT consult `storage.objects` RLS, so
    `getPublicUrl(...)` image display is UNAFFECTED by these SELECT policies.
  - The app does not call `.list()` or `.download()` on any of these buckets
    (verified across `src/`), so removing anonymous listing breaks no feature.
  - We replace each broad policy with an owner-scoped SELECT so an authenticated
    user can still list/download THEIR OWN objects if future code needs it,
    without being able to enumerate everyone else's.

  ## Buckets & policies affected
    avatars          -> "Anyone can view avatars"
    job-images       -> "Authenticated users can view job images"
    portfolio-images -> "Anyone can view portfolio images"
    cover-photos     -> "Anyone can view cover photos"
    job-photos       -> "Anyone can view job photos"

  ## Rollback
  Re-create each dropped policy as `FOR SELECT USING (bucket_id = '<bucket>')`
  (see the original bucket-creation migrations).

  NOTE: Review and test in a branch/staging before `supabase db push` to prod.
  If you rely purely on public URLs and never need authenticated listing, you
  may drop the owner-scoped replacement policies below as well.
*/

BEGIN;

-- avatars ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
CREATE POLICY "Owners can view own avatars"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND owner = (select auth.uid()));

-- job-images ------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view job images" ON storage.objects;
CREATE POLICY "Owners can view own job images"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'job-images' AND owner = (select auth.uid()));

-- portfolio-images ------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can view portfolio images" ON storage.objects;
CREATE POLICY "Owners can view own portfolio images"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'portfolio-images' AND owner = (select auth.uid()));

-- cover-photos ----------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can view cover photos" ON storage.objects;
CREATE POLICY "Owners can view own cover photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'cover-photos' AND owner = (select auth.uid()));

-- job-photos ------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can view job photos" ON storage.objects;
CREATE POLICY "Owners can view own job photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'job-photos' AND owner = (select auth.uid()));

COMMIT;
