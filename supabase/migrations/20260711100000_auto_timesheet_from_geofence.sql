-- ─────────────────────────────────────────────────────────────────────────────
-- Auto-draft a timesheet entry from geofenced on-site time when a job completes.
--
-- Geofencing already captures GPS-verified arrival/departure (site_visit_events),
-- but those hours never reached the timesheet — a manager had to re-key them by
-- hand. This bridges the two: on the transition INTO `completed`, we sum each
-- worker's on-site time for that job and insert a PENDING time_entries row, which
-- then flows through the existing approve/reject workflow (nothing is auto-paid).
--
-- Design notes:
--   • DB trigger (not app code) because a job is completed from several paths
--     (JobCompletionModal, JobManagementModal, edge functions) — the trigger
--     fires regardless of caller.
--   • SECURITY DEFINER: the completing user (client/tradie) is not the employer,
--     so the insert must bypass time_entries' owner-only RLS.
--   • Employed workers only — a solo tradie (no active employer) has no timesheet.
--   • Idempotent via source='geofence' + (job_id, team_member_id) so re-completing
--     a job never double-logs.
--   • Still on site at completion → the open visit is closed at the completion
--     moment (they marked it done, so on-site time ends now).
-- ─────────────────────────────────────────────────────────────────────────────

-- Distinguish auto-created entries from manual ones (also drives a UI badge).
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

CREATE OR REPLACE FUNCTION public.auto_timesheet_from_geofence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  v_hours numeric(5,2);
  v_employer uuid;
BEGIN
  -- Only on the transition INTO completed.
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    FOR r IN
      WITH ev AS (
        SELECT
          tradie_id,
          action,
          occurred_at,
          lead(occurred_at) OVER (PARTITION BY tradie_id ORDER BY occurred_at) AS next_at,
          lead(action)      OVER (PARTITION BY tradie_id ORDER BY occurred_at) AS next_action
        FROM site_visit_events
        WHERE job_id = NEW.id
          AND action IN ('ENTER', 'EXIT')
      )
      SELECT
        tradie_id,
        sum(
          CASE
            WHEN action = 'ENTER' AND next_action = 'EXIT'
              THEN extract(epoch FROM (next_at - occurred_at))
            WHEN action = 'ENTER' AND next_action IS NULL
              -- still on site when marked done → close at completion time
              THEN greatest(0, extract(epoch FROM (now() - occurred_at)))
            ELSE 0
          END
        ) AS total_secs,
        max(occurred_at)::date AS visit_date
      FROM ev
      GROUP BY tradie_id
    LOOP
      -- Timesheets are an employer↔worker record: skip unemployed (solo) tradies.
      SELECT employer_id INTO v_employer
      FROM profiles
      WHERE id = r.tradie_id AND employer_status = 'active';
      IF v_employer IS NULL THEN
        CONTINUE;
      END IF;

      v_hours := round(least(coalesce(r.total_secs, 0) / 3600.0, 24)::numeric, 2);
      IF v_hours < 0.01 THEN
        CONTINUE; -- no meaningful on-site time (e.g. only an open ping)
      END IF;

      -- Idempotent: never double-log the same job + worker.
      IF EXISTS (
        SELECT 1 FROM time_entries
        WHERE job_id = NEW.id AND team_member_id = r.tradie_id AND source = 'geofence'
      ) THEN
        CONTINUE;
      END IF;

      INSERT INTO time_entries (
        team_member_id, business_owner_id, job_id, date, hours, description, status, source
      ) VALUES (
        r.tradie_id,
        v_employer,
        NEW.id,
        r.visit_date,
        v_hours,
        'Auto-logged from on-site check-in',
        'pending',
        'geofence'
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_timesheet_from_geofence ON jobs;
CREATE TRIGGER trg_auto_timesheet_from_geofence
AFTER UPDATE ON jobs
FOR EACH ROW
EXECUTE FUNCTION public.auto_timesheet_from_geofence();
