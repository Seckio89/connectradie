/*
  # Create Storage Bucket for Job Attachments (Completion Photos)

  1. New Storage Bucket
    - `job-attachments` bucket for storing completion proof photos
    - Supports PNG and JPG files up to 10MB each

  2. Security Policies
    - Authenticated users can upload files to their own folder
    - All authenticated users can view attachments (for clients to verify work)
    - Users can delete their own uploaded files
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'job-attachments',
  'job-attachments',
  false,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/jpg']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users can upload job attachments to own folder" ON storage.objects;
CREATE POLICY "Users can upload job attachments to own folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'job-attachments' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Authenticated users can view job attachments" ON storage.objects;
CREATE POLICY "Authenticated users can view job attachments"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'job-attachments');

DROP POLICY IF EXISTS "Users can delete own job attachments" ON storage.objects;
CREATE POLICY "Users can delete own job attachments"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'job-attachments' AND
  (storage.foldername(name))[1] = auth.uid()::text
);
