/*
  # Add Ongoing Project Support

  1. Changes to `projects` table
    - Add `is_ongoing` (boolean) - Marks a project as ongoing with no fixed end date
    - Update status CHECK constraint to include 'ongoing' option

  2. Notes
    - When is_ongoing is true, the estimated_end_date is ignored
    - Existing projects default to is_ongoing = false
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'is_ongoing'
  ) THEN
    ALTER TABLE projects ADD COLUMN is_ongoing boolean DEFAULT false;
  END IF;
END $$;

ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE projects ADD CONSTRAINT projects_status_check CHECK (status IN ('active', 'completed', 'cancelled', 'ongoing'));
