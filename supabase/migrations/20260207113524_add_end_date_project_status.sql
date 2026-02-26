/*
  # Add 'end_date' project status

  1. Changes
    - Add 'end_date' as a valid value for the `status` column on the `projects` table
    - Add 'end_date' as a valid value for `client_status` and `tradie_status` columns

  2. Notes
    - This allows projects to be set to an "end date" status when an ongoing project is given a specific end date
*/

ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE projects ADD CONSTRAINT projects_status_check CHECK (status IN ('active', 'completed', 'cancelled', 'ongoing', 'end_date'));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'client_status'
  ) THEN
    ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_client_status_check;
    ALTER TABLE projects ADD CONSTRAINT projects_client_status_check CHECK (client_status IN ('active', 'completed', 'cancelled', 'ongoing', 'end_date'));
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'tradie_status'
  ) THEN
    ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_tradie_status_check;
    ALTER TABLE projects ADD CONSTRAINT projects_tradie_status_check CHECK (tradie_status IN ('active', 'completed', 'cancelled', 'ongoing', 'end_date'));
  END IF;
END $$;
