-- ─────────────────────────────────────────────────────────────────────────────
-- Per-business timezone. The auto-timesheet `date` was computed in a hardcoded
-- Australia/Sydney zone, so a WA (AWST) business could see a late-day shift land
-- on the wrong local day. Store the business's own timezone and use it. Default
-- stays Sydney; the trigger falls back to Sydney if it's null/blank.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Australia/Sydney';

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
  v_tz text;
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    FOR r IN
      WITH ev AS (
        SELECT
          tradie_id, action, occurred_at,
          lead(occurred_at) OVER (PARTITION BY tradie_id ORDER BY occurred_at) AS next_at,
          lead(action)      OVER (PARTITION BY tradie_id ORDER BY occurred_at) AS next_action
        FROM site_visit_events
        WHERE job_id = NEW.id AND action IN ('ENTER', 'EXIT')
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
        -- Raw last crossing; the local date is derived per-employer-tz below.
        max(occurred_at) AS last_occurred,
        min(occurred_at) FILTER (WHERE action = 'ENTER') AS arrived_at,
        CASE
          WHEN max(occurred_at) FILTER (WHERE action = 'ENTER')
               > coalesce(max(occurred_at) FILTER (WHERE action = 'EXIT'), '-infinity'::timestamptz)
            THEN now()
          ELSE max(occurred_at) FILTER (WHERE action = 'EXIT')
        END AS departed_at
      FROM ev
      GROUP BY tradie_id
    LOOP
      BEGIN
        SELECT employer_id INTO v_employer
        FROM profiles
        WHERE id = r.tradie_id AND employer_status = 'active';

        v_hours := round(least(coalesce(r.total_secs, 0) / 3600.0, 24)::numeric, 2);

        IF v_employer IS NOT NULL
           AND v_hours >= 0.01
           AND NOT EXISTS (
             SELECT 1 FROM time_entries
             WHERE job_id = NEW.id AND team_member_id = r.tradie_id AND source = 'geofence'
           )
        THEN
          -- The timesheet date is the LOCAL calendar day in the business's zone.
          SELECT coalesce(nullif(timezone, ''), 'Australia/Sydney') INTO v_tz
          FROM profiles WHERE id = v_employer;

          INSERT INTO time_entries (
            team_member_id, business_owner_id, job_id, date, hours, description,
            status, source, arrived_at, departed_at
          ) VALUES (
            r.tradie_id, v_employer, NEW.id,
            (r.last_occurred AT TIME ZONE coalesce(v_tz, 'Australia/Sydney'))::date,
            v_hours, 'Auto-logged from on-site check-in', 'pending', 'geofence',
            r.arrived_at, r.departed_at
          );
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'auto_timesheet_from_geofence: skipped worker % on job %: %', r.tradie_id, NEW.id, SQLERRM;
      END;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;
