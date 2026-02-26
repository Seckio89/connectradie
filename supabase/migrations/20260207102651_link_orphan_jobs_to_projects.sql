/*
  # Link orphan jobs to projects

  1. Changes
    - Creates projects for any existing jobs that don't have a project_id
    - Groups jobs by client_id and creates one project per client
    - Links all orphan jobs to their respective auto-created projects
    - Creates a trigger to auto-create projects for future jobs inserted without a project_id

  2. Important Notes
    - This ensures all past and present jobs are connected to a project
    - No data is deleted or modified destructively
    - Only jobs with NULL project_id are affected
*/

DO $$
DECLARE
  client_rec RECORD;
  new_project_id uuid;
BEGIN
  FOR client_rec IN
    SELECT DISTINCT client_id
    FROM jobs
    WHERE project_id IS NULL AND client_id IS NOT NULL
  LOOP
    INSERT INTO projects (client_id, title, status)
    VALUES (client_rec.client_id, 'My Project', 'active')
    RETURNING id INTO new_project_id;

    UPDATE jobs
    SET project_id = new_project_id
    WHERE client_id = client_rec.client_id
    AND project_id IS NULL;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION auto_assign_project_to_job()
RETURNS TRIGGER AS $$
DECLARE
  existing_project_id uuid;
BEGIN
  IF NEW.project_id IS NULL AND NEW.client_id IS NOT NULL THEN
    SELECT id INTO existing_project_id
    FROM projects
    WHERE client_id = NEW.client_id AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 1;

    IF existing_project_id IS NOT NULL THEN
      NEW.project_id := existing_project_id;
    ELSE
      INSERT INTO projects (client_id, title, status)
      VALUES (NEW.client_id, 'My Project', 'active')
      RETURNING id INTO NEW.project_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS auto_assign_project_trigger ON jobs;
CREATE TRIGGER auto_assign_project_trigger
  BEFORE INSERT ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION auto_assign_project_to_job();
