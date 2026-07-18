-- ─────────────────────────────────────────────────────────────────────────────
-- schedule_reminder_on_completion: skip off-app jobs.
--
-- Completing an OFF-APP job (client_id IS NULL, billed via client_contact_id)
-- failed with: null value in column "client_id" of relation "service_reminders"
-- violates not-null constraint — the completion trigger tried to schedule a
-- service reminder anchored to a client account that doesn't exist. That aborted
-- the whole `jobs` UPDATE, surfacing as "Failed to save completion details".
--
-- A live hotfix already added the NEW.client_id IS NOT NULL guard; this migration
-- captures that guarded definition so it's durable + reproducible from source.
-- CREATE OR REPLACE — idempotent, matches the live function exactly.
-- ─────────────────────────────────────────────────────────────────────────────

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
