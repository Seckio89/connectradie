/*
  # Create portfolio images storage bucket

  1. Storage
    - Create `portfolio-images` public storage bucket for tradie portfolio uploads
    - 5MB file size limit
    - Allowed MIME types: JPEG, PNG, WebP, GIF

  2. Security
    - Tradies can upload images to their own folder (folder = user ID)
    - Tradies can update their own images
    - Tradies can delete their own images
    - Anyone can view portfolio images (public gallery)
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'portfolio-images',
  'portfolio-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Tradies can upload portfolio images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'portfolio-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Tradies can update own portfolio images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'portfolio-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'portfolio-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Tradies can delete own portfolio images"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'portfolio-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Anyone can view portfolio images"
  ON storage.objects FOR SELECT TO authenticated, anon
  USING (bucket_id = 'portfolio-images');
