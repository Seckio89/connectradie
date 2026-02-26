/*
  # Add Job Decline Reason

  1. Changes
    - Add `decline_reason` column to jobs table to store reason when a tradie declines a job

  2. Important Notes
    - The decline_reason field is optional and only populated when a tradie declines a job
    - Tradies can provide context to clients about why they cannot take the job
    - Status field already supports 'declined' value as it's stored as text
*/

-- Add decline_reason column to jobs table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'jobs' AND column_name = 'decline_reason'
  ) THEN
    ALTER TABLE jobs ADD COLUMN decline_reason text;
  END IF;
END $$;