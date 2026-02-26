/*
  # Update job priority values for Smart Scheduling

  1. Changes
    - Drop old priority check constraint
    - Migrate existing 'normal' and 'high' priority values to 'standard'
    - Add new check constraint allowing only 'standard' and 'urgent'
    - Update default to 'standard'
    - Add `scheduled_date` column for explicit date scheduling

  2. Important Notes
    - Existing jobs with 'normal' or 'high' priority are re-mapped to 'standard'
    - Jobs with 'urgent' priority remain unchanged
*/

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_priority_check;

UPDATE jobs SET priority = 'standard' WHERE priority IN ('normal', 'high');

ALTER TABLE jobs ADD CONSTRAINT jobs_priority_check
  CHECK (priority = ANY (ARRAY['standard'::text, 'urgent'::text]));

ALTER TABLE jobs ALTER COLUMN priority SET DEFAULT 'standard';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'scheduled_date'
  ) THEN
    ALTER TABLE jobs ADD COLUMN scheduled_date date;
  END IF;
END $$;
