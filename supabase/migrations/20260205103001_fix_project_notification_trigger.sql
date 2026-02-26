/*
  # Fix Project Notification Trigger

  ## Issue
  The trigger function `notify_project_tradies_on_job_change()` was referencing
  a non-existent column `scheduled_date` when it should be `scheduled_time`.
  This was causing errors when updating jobs with project_id.

  ## Changes
  - Update the trigger function to use correct column name: `scheduled_time`
  - This will fix the error when adding jobs to projects
*/

-- Recreate the function with the correct column name
CREATE OR REPLACE FUNCTION notify_project_tradies_on_job_change()
RETURNS TRIGGER AS $$
DECLARE
  v_project_title text;
  v_tradie_id uuid;
BEGIN
  -- Only proceed if the job is part of a project
  IF NEW.project_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check if scheduled_time or is_delayed changed (using correct column name)
  IF (OLD.scheduled_time IS DISTINCT FROM NEW.scheduled_time) OR 
     (OLD.is_delayed IS DISTINCT FROM NEW.is_delayed) THEN
    
    -- Get project title
    SELECT title INTO v_project_title
    FROM projects
    WHERE id = NEW.project_id;

    -- Notify all other tradies in the same project
    FOR v_tradie_id IN 
      SELECT DISTINCT tradie_id 
      FROM jobs 
      WHERE project_id = NEW.project_id 
      AND tradie_id != NEW.tradie_id
      AND tradie_id IS NOT NULL
      AND status IN ('accepted', 'in_progress')
    LOOP
      INSERT INTO notifications (user_id, type, title, message, reference_id)
      VALUES (
        v_tradie_id,
        'project_update',
        'Project Timeline Updated',
        'The timeline for "' || v_project_title || '" has changed. Please check the updated dates.',
        NEW.project_id
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;