/*
  # Add Stage Number to Job Milestones

  ## Overview
  This migration adds a `stage_number` field to job_milestones to enable sequential ordering
  and stage-based display of payment milestones, making the payment workflow clearer.

  ## Changes
  1. Add `stage_number` column to `job_milestones`
    - Type: integer
    - Not nullable with default value 1
    - Represents the order/sequence of the milestone in the payment flow

  ## Notes
  - Existing milestones will be assigned stage_number based on their creation order
  - This enables a clearer visual representation of payment stages (Stage 1, Stage 2, etc.)
*/

-- Add stage_number column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'job_milestones' AND column_name = 'stage_number'
  ) THEN
    ALTER TABLE job_milestones ADD COLUMN stage_number integer NOT NULL DEFAULT 1;
  END IF;
END $$;

-- Update existing milestones to have sequential stage numbers within each job
DO $$
DECLARE
  job_rec RECORD;
  milestone_rec RECORD;
  stage_num INTEGER;
BEGIN
  FOR job_rec IN SELECT DISTINCT job_id FROM job_milestones LOOP
    stage_num := 1;
    FOR milestone_rec IN 
      SELECT id FROM job_milestones 
      WHERE job_id = job_rec.job_id 
      ORDER BY created_at ASC
    LOOP
      UPDATE job_milestones 
      SET stage_number = stage_num 
      WHERE id = milestone_rec.id;
      stage_num := stage_num + 1;
    END LOOP;
  END LOOP;
END $$;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_job_milestones_stage_number ON job_milestones(job_id, stage_number);
