/*
  # Add End Reason to Projects

  1. Changes to `projects` table
    - Add `end_reason` (text, nullable) - Stores the reason when ending an ongoing project

  2. Notes
    - Used when transitioning from ongoing status to completed or cancelled
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'end_reason'
  ) THEN
    ALTER TABLE projects ADD COLUMN end_reason text;
  END IF;
END $$;
