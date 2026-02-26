/*
  # Add cover photo support for tradie profiles

  1. Modified Tables
    - `profiles`
      - Added `cover_photo_url` (text, nullable) for hero banner background image

  2. Storage
    - Create `cover-photos` public storage bucket (5MB limit, image MIME types only)

  3. Security
    - Tradies can upload/update/delete cover photos in their own folder
    - Anyone can view cover photos (public)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'cover_photo_url'
  ) THEN
    ALTER TABLE profiles ADD COLUMN cover_photo_url text;
  END IF;
END $$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cover-photos',
  'cover-photos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Tradies can upload cover photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'cover-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Tradies can update own cover photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'cover-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'cover-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Tradies can delete own cover photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'cover-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Anyone can view cover photos"
  ON storage.objects FOR SELECT TO authenticated, anon
  USING (bucket_id = 'cover-photos');
