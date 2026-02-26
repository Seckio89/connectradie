/*
  # Auto-compute Project Status from Job Statuses

  ## Overview
  Project status should automatically reflect the state of its jobs.
  This removes the need for manual status management.

  ## Logic
  - If all jobs are completed -> project = 'completed'
  - If all jobs are cancelled or declined -> project = 'cancelled'
  - Otherwise (pending, accepted, in_progress) -> project = 'active'
  - Projects with no jobs keep their current status

  ## Changes
  1. New function `recompute_project_status` that calculates status from jobs
  2. Trigger on jobs table to auto-update project status on any job status change
  3. Fix existing project data to match actual job states
*/

-- Function to recompute project status based on its jobs
CREATE OR REPLACE FUNCTION recompute_project_status()
RETURNS TRIGGER AS $$
DECLARE
  v_project_id uuid;
  v_total_jobs int;
  v_completed_jobs int;
  v_cancelled_jobs int;
  v_new_status text;
BEGIN
  v_project_id := COALESCE(NEW.project_id, OLD.project_id);

  IF v_project_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed'),
    COUNT(*) FILTER (WHERE status IN ('cancelled', 'declined'))
  INTO v_total_jobs, v_completed_jobs, v_cancelled_jobs
  FROM jobs
  WHERE project_id = v_project_id;

  IF v_total_jobs = 0 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF v_completed_jobs = v_total_jobs THEN
    v_new_status := 'completed';
  ELSIF v_cancelled_jobs = v_total_jobs THEN
    v_new_status := 'cancelled';
  ELSE
    v_new_status := 'active';
  END IF;

  UPDATE projects
  SET status = v_new_status,
      client_status = v_new_status,
      tradie_status = v_new_status,
      status_agreed = true
  WHERE id = v_project_id
  AND status IS DISTINCT FROM v_new_status;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger on job status changes
DROP TRIGGER IF EXISTS recompute_project_status_on_job_change ON jobs;
CREATE TRIGGER recompute_project_status_on_job_change
  AFTER INSERT OR UPDATE OF status, project_id OR DELETE ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION recompute_project_status();

-- Fix existing project data now
DO $$
DECLARE
  proj RECORD;
  v_total int;
  v_completed int;
  v_cancelled int;
  v_new_status text;
BEGIN
  FOR proj IN SELECT id FROM projects LOOP
    SELECT
      COUNT(*),
      COUNT(*) FILTER (WHERE status = 'completed'),
      COUNT(*) FILTER (WHERE status IN ('cancelled', 'declined'))
    INTO v_total, v_completed, v_cancelled
    FROM jobs
    WHERE project_id = proj.id;

    IF v_total = 0 THEN
      CONTINUE;
    END IF;

    IF v_completed = v_total THEN
      v_new_status := 'completed';
    ELSIF v_cancelled = v_total THEN
      v_new_status := 'cancelled';
    ELSE
      v_new_status := 'active';
    END IF;

    UPDATE projects
    SET status = v_new_status,
        client_status = v_new_status,
        tradie_status = v_new_status,
        status_agreed = true
    WHERE id = proj.id;
  END LOOP;
END $$;