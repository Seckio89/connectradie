-- ─────────────────────────────────────────────────────────────────────────────
-- Enrich auto-drafted (geofence) timesheet entries with the arrival + departure
-- times behind the hours, so the employer can see WHEN the worker was on site —
-- not just the total. Travel-between-sites is derived on the client from these
-- (departure of one site → arrival of the next). Manual entries leave these null.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS arrived_at  timestamptz;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS departed_at timestamptz;

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
              THEN greatest(0, extract(epoch FROM (now() - occurred_at)))
            ELSE 0
          END
        ) AS total_secs,
        max(occurred_at)::date AS visit_date,
        min(occurred_at) FILTER (WHERE action = 'ENTER') AS arrived_at,
        CASE
          -- last crossing was an ENTER with no closing EXIT → still on site when
          -- marked done, so departure is the completion moment.
          WHEN max(occurred_at) FILTER (WHERE action = 'ENTER')
               > coalesce(max(occurred_at) FILTER (WHERE action = 'EXIT'), '-infinity'::timestamptz)
            THEN now()
          ELSE max(occurred_at) FILTER (WHERE action = 'EXIT')
        END AS departed_at
      FROM ev
      GROUP BY tradie_id
    LOOP
      SELECT employer_id INTO v_employer
      FROM profiles
      WHERE id = r.tradie_id AND employer_status = 'active';
      IF v_employer IS NULL THEN
        CONTINUE;
      END IF;

      v_hours := round(least(coalesce(r.total_secs, 0) / 3600.0, 24)::numeric, 2);
      IF v_hours < 0.01 THEN
        CONTINUE;
      END IF;

      IF EXISTS (
        SELECT 1 FROM time_entries
        WHERE job_id = NEW.id AND team_member_id = r.tradie_id AND source = 'geofence'
      ) THEN
        CONTINUE;
      END IF;

      INSERT INTO time_entries (
        team_member_id, business_owner_id, job_id, date, hours, description,
        status, source, arrived_at, departed_at
      ) VALUES (
        r.tradie_id,
        v_employer,
        NEW.id,
        r.visit_date,
        v_hours,
        'Auto-logged from on-site check-in',
        'pending',
        'geofence',
        r.arrived_at,
        r.departed_at
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;
