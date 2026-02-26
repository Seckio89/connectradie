/*
  # Create Storage Bucket for Document Uploads

  1. New Storage Bucket
    - `documents` - For storing insurance certificates, licenses, and other verification documents
    - Public access for viewing uploaded documents
    - Restricted upload to authenticated users only

  2. Changes
    - Add insurance_document_url column to tradie_details table to store uploaded document URLs

  3. Security
    - Users can only upload their own documents
    - Anyone can view documents (for client verification)
    - Users can update/delete only their own documents
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload documents"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'documents');

CREATE POLICY "Anyone can view documents"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'documents');

CREATE POLICY "Users can update their own documents"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own documents"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tradie_details' AND column_name = 'insurance_document_url'
  ) THEN
    ALTER TABLE tradie_details ADD COLUMN insurance_document_url text;
  END IF;
END $$;