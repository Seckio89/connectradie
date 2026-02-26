/*
  # Add Declined Timestamp and Auto-Cleanup

  1. Changes
    - Add `declined_at` timestamp to jobs table to track when a job was declined
    - Enable pg_cron extension for scheduled cleanup
    - Create function to delete declined jobs older than 2 days
    - Set up daily cron job to run cleanup

  2. Important Notes
    - When a job is declined, declined_at is set to current timestamp
    - Jobs with status 'declined' and declined_at older than 2 days are automatically deleted
    - Cleanup runs daily at midnight
*/

-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Add declined_at column to jobs table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'jobs' AND column_name = 'declined_at'
  ) THEN
    ALTER TABLE jobs ADD COLUMN declined_at timestamptz;
  END IF;
END $$;

-- Create function to delete old declined jobs
CREATE OR REPLACE FUNCTION delete_old_declined_jobs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM jobs
  WHERE status = 'declined'
    AND declined_at IS NOT NULL
    AND declined_at < NOW() - INTERVAL '2 days';
END;
$$;

-- Schedule the cleanup job to run daily at midnight
SELECT cron.schedule(
  'delete-old-declined-jobs',
  '0 0 * * *',
  'SELECT delete_old_declined_jobs();'
);