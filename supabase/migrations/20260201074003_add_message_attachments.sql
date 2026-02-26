/*
  # Add Message Attachments Support

  1. Changes to `messages` table
    - Add `attachment_url` (text) - URL to the attachment file in storage
    - Add `attachment_type` (text) - Type of attachment (image, pdf, audio, video, other)
    - Add `attachment_name` (text) - Original filename of the attachment
    - Add `attachment_size` (integer) - File size in bytes

  2. Storage
    - Create `message-attachments` storage bucket for storing message attachments
    - Set up RLS policies for the bucket

  3. Security
    - Only conversation participants can upload attachments
    - Only conversation participants can view attachments
*/

-- Add attachment columns to messages table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'attachment_url'
  ) THEN
    ALTER TABLE messages ADD COLUMN attachment_url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'attachment_type'
  ) THEN
    ALTER TABLE messages ADD COLUMN attachment_type text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'attachment_name'
  ) THEN
    ALTER TABLE messages ADD COLUMN attachment_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'attachment_size'
  ) THEN
    ALTER TABLE messages ADD COLUMN attachment_size integer;
  END IF;
END $$;

-- Create storage bucket for message attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('message-attachments', 'message-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Authenticated users can upload message attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can view message attachments from their conversations" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own message attachments" ON storage.objects;

-- Storage policies for message attachments
-- Allow authenticated users to upload attachments
CREATE POLICY "Authenticated users can upload message attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'message-attachments' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to view attachments from their conversations
CREATE POLICY "Users can view message attachments from their conversations"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'message-attachments' AND
  EXISTS (
    SELECT 1 FROM messages m
    JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id
    WHERE m.attachment_url = storage.objects.name
    AND cp.user_id = auth.uid()
    AND cp.left_at IS NULL
  )
);

-- Allow users to delete their own attachments
CREATE POLICY "Users can delete their own message attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'message-attachments' AND
  auth.uid()::text = (storage.foldername(name))[1]
);