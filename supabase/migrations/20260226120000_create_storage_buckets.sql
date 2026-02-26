-- Create storage buckets for job photos and verification documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('job-photos', 'job-photos', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  ('verification-documents', 'verification-documents', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- RLS policies for job-photos bucket (public read, authenticated upload)
CREATE POLICY "Anyone can view job photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'job-photos');

CREATE POLICY "Authenticated users can upload job photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'job-photos');

CREATE POLICY "Users can update their own job photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'job-photos' AND (select auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own job photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'job-photos' AND (select auth.uid())::text = (storage.foldername(name))[1]);

-- RLS policies for verification-documents bucket (private, owner-only)
CREATE POLICY "Users can view their own verification documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'verification-documents' AND (select auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload their own verification documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'verification-documents' AND (select auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own verification documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'verification-documents' AND (select auth.uid())::text = (storage.foldername(name))[1]);
