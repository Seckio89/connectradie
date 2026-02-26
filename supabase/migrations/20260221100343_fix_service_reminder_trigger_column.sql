/*
  # Fix service reminder trigger column reference

  1. Problem
    - The `schedule_reminder_on_completion` trigger function referenced
      `NEW.job_id` which does not exist on the `jobs` table
    - The correct column is `NEW.id` (the job's primary key)
    - This caused the trigger to crash silently whenever a job was
      completed, meaning service reminders were never created

  2. Solution
    - Recreate the trigger function with `NEW.id` instead of `NEW.job_id`
*/

CREATE OR REPLACE FUNCTION schedule_reminder_on_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_category text;
  v_due date;
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    SELECT category INTO v_category FROM jobs WHERE id = NEW.id;

    v_due := CURRENT_DATE + INTERVAL '6 months';

    INSERT INTO service_reminders (client_id, tradie_id, job_id, category_name, location_address, due_date, status)
    VALUES (NEW.client_id, NEW.tradie_id, NEW.id, COALESCE(v_category, ''), NEW.location_address, v_due, 'pending');
  END IF;

  RETURN NEW;
END;
$$;
