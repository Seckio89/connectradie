-- Migration: fix_service_reminder_offapp_null_client
-- Description:
--   schedule_reminder_on_completion() fires when a job is marked 'completed'
--   and INSERTs a row into service_reminders using NEW.client_id. For off-app
--   jobs (quoted to a client_contact with no linked account) jobs.client_id is
--   NULL, and service_reminders.client_id is NOT NULL — so completing the job
--   raises "null value in column client_id ... violates not-null constraint"
--   and the completion is rolled back.
--
--   Minimal, low-risk fix: only schedule the reminder when a client_id exists.
--   Off-app contacts have no in-app dashboard to receive a reminder anyway, so
--   skipping the insert is correct for them and unblocks job completion.
--
--   (If you later want reminders for off-app contacts too, the fuller fix is to
--   make service_reminders.client_id nullable, add a client_contact_id column +
--   a "client_id OR client_contact_id" check, and carry client_contact_id
--   through here — tracked as a follow-up.)

CREATE OR REPLACE FUNCTION public.schedule_reminder_on_completion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

    -- Only schedule a reminder when we have a category AND an on-app client to
    -- own it. Off-app jobs (client_id IS NULL) are skipped so completing the
    -- job no longer trips the service_reminders.client_id NOT NULL constraint.
    IF v_category IS NOT NULL AND NEW.client_id IS NOT NULL THEN
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
$function$;
