/*
  # Create Storage Bucket for Job Images

  1. New Storage Bucket
    - `job-images` bucket for storing project photos attached to booking requests
    - Supports PNG and JPG files up to 10MB each

  2. Security Policies
    - Authenticated users can upload images to their own folder
    - All authenticated users can view images (for tradies to see client photos)
    - Users can delete their own uploaded images

  3. Important Notes
    - Files are organized by user_id/timestamp-filename pattern
    - Public access enabled for viewing by authenticated users
*/

-- Create the job-images storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'job-images',
  'job-images',
  false,
  10485760, -- 10MB in bytes
  ARRAY['image/png', 'image/jpeg', 'image/jpg']
)
ON CONFLICT (id) DO NOTHING;

-- Policy: Allow authenticated users to upload images to their own folder
CREATE POLICY "Users can upload job images to own folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'job-images' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Allow authenticated users to view all job images
CREATE POLICY "Authenticated users can view job images"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'job-images');

-- Policy: Allow users to delete their own images
CREATE POLICY "Users can delete own job images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'job-images' AND
  (storage.foldername(name))[1] = auth.uid()::text
);