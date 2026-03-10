/*
  # Fix schedule_reminder_on_completion trigger - column 'category' does not exist

  1. Problem
    - The trigger function references `SELECT category FROM jobs` but the jobs
      table has no `category` column, causing every job completion to fail with
      "column 'category' does not exist"

  2. Solution
    - Look up the trade category from `tradie_details.trade_category` using
      the job's tradie_id (the original correct approach)
    - Also look up default_reminder_months from trade_categories table
      instead of hardcoding 6 months
*/

CREATE OR REPLACE FUNCTION schedule_reminder_on_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_category text;
  v_reminder_months integer;
  v_due date;
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    -- Get category from tradie_details, not from jobs table
    SELECT td.trade_category INTO v_category
    FROM tradie_details td
    WHERE td.profile_id = NEW.tradie_id;

    IF v_category IS NOT NULL THEN
      -- Look up default reminder period
      SELECT tc.default_reminder_months INTO v_reminder_months
      FROM trade_categories tc
      WHERE tc.name = v_category;

      v_due := CURRENT_DATE + ((COALESCE(v_reminder_months, 6)) || ' months')::interval;

      INSERT INTO service_reminders (client_id, tradie_id, job_id, category_name, location_address, due_date, status)
      VALUES (NEW.client_id, NEW.tradie_id, NEW.id, v_category, NEW.location_address, v_due, 'pending');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
