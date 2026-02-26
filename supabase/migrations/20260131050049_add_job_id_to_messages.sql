/*
  # Add job_id to messages table

  1. Changes
    - Add `job_id` (uuid, nullable, foreign key to jobs) to messages table
    - This allows booking request messages to be linked to specific jobs
  
  2. Security
    - No RLS changes needed as messages table already has proper policies
*/

-- Add job_id column to messages table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'job_id'
  ) THEN
    ALTER TABLE messages ADD COLUMN job_id uuid REFERENCES jobs(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Create index for faster job lookups
CREATE INDEX IF NOT EXISTS idx_messages_job_id ON messages(job_id);