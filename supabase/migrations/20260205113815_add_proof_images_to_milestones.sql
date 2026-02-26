/*
  # Add Proof Images to Job Milestones

  ## Overview
  This migration adds photo proof functionality to job milestones, allowing tradies to upload
  images showing work completion for each stage before requesting approval.

  ## Changes
  1. Add `proof_images` column to `job_milestones`
    - Type: text array
    - Stores URLs of uploaded proof images
    - Nullable (not required initially)

  ## Benefits
  - Tradies can document their work progress with photos
  - Clients can review visual proof before approving payments
  - Creates a clear audit trail of work completion
*/

-- Add proof_images column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'job_milestones' AND column_name = 'proof_images'
  ) THEN
    ALTER TABLE job_milestones ADD COLUMN proof_images text[] DEFAULT '{}';
  END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN job_milestones.proof_images IS 'Array of image URLs showing proof of work completion for this milestone stage';
