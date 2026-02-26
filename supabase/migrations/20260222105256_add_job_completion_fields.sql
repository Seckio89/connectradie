/*
  # Add Job Completion Proof Fields

  1. Modified Tables
    - `jobs`
      - `completion_notes` (text, nullable) - Tradie's notes about what was done
      - `completion_photo_url` (text, nullable) - URL to the uploaded proof-of-work photo

  2. Important Notes
    - These fields support the "Proof of Work" flow that requires tradies
      to provide notes and a photo before marking a job as complete
    - Both fields are nullable since they only apply to completed jobs
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'completion_notes'
  ) THEN
    ALTER TABLE jobs ADD COLUMN completion_notes text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'completion_photo_url'
  ) THEN
    ALTER TABLE jobs ADD COLUMN completion_photo_url text;
  END IF;
END $$;
