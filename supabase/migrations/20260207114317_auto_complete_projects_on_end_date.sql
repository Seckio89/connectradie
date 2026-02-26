/*
  # Auto-complete projects and jobs when end date arrives

  1. New Function
    - `auto_complete_ended_projects()` - checks for projects with 'end_date' status
      where the estimated_end_date has passed, then:
      - Updates all active jobs in those projects to 'completed'
      - Updates the project status to 'completed'

  2. Scheduling
    - Runs daily at midnight UTC via pg_cron

  3. Notes
    - Only affects projects with status = 'end_date'
    - Only affects jobs with active statuses (pending, accepted, in_progress)
    - Safe to run multiple times (idempotent)
*/

CREATE OR REPLACE FUNCTION auto_complete_ended_projects()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  proj RECORD;
BEGIN
  FOR proj IN
    SELECT id FROM projects
    WHERE status = 'end_date'
      AND estimated_end_date IS NOT NULL
      AND estimated_end_date::date <= CURRENT_DATE
  LOOP
    UPDATE jobs
    SET status = 'completed'
    WHERE project_id = proj.id
      AND status IN ('pending', 'accepted', 'in_progress');

    UPDATE projects
    SET status = 'completed',
        client_status = 'completed',
        tradie_status = 'completed',
        status_agreed = true,
        is_ongoing = false
    WHERE id = proj.id;
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'auto-complete-ended-projects',
  '0 0 * * *',
  $$SELECT auto_complete_ended_projects();$$
);
