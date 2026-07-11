-- ─────────────────────────────────────────────────────────────────────────────
-- Teams & Schedule audit fixes (2026-07-11):
--  1. Auto-timesheet `date` was computed as max(occurred_at)::date, which resolves
--     in UTC. An early-morning Australian shift (e.g. 7am AEST = 9pm UTC the day
--     before) landed on the PREVIOUS calendar day, so it fell in the wrong week of
--     the (local-date) Timesheets filter. Compute the date in AEST/AEDT instead.
--  2. Wrap the per-worker draft in an exception guard so a future error (new NOT
--     NULL column, added FK, overflow) can NEVER roll back a legitimate job
--     completion — timesheet drafting is best-effort.
--  3. Revoke direct EXECUTE on the trigger function (it is not a real RPC; the
--     trigger still fires as table owner).
--  4. Pin haversine_km's search_path (was role-mutable).
--  5. Cover two hot foreign keys with indexes.
-- ─────────────────────────────────────────────────────────────────────────────

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
        -- Local (AEST/AEDT) calendar date, NOT UTC — the Timesheets UI filters by
        -- local date, so a morning shift must not slip onto the previous UTC day.
        (max(occurred_at) AT TIME ZONE 'Australia/Sydney')::date AS visit_date,
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
      -- Best-effort per worker: any failure here must not abort the completion.
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
          INSERT INTO time_entries (
            team_member_id, business_owner_id, job_id, date, hours, description,
            status, source, arrived_at, departed_at
          ) VALUES (
            r.tradie_id, v_employer, NEW.id, r.visit_date, v_hours,
            'Auto-logged from on-site check-in', 'pending', 'geofence',
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

-- The trigger fires as the table owner regardless of this grant; it's never a real RPC.
REVOKE EXECUTE ON FUNCTION public.auto_timesheet_from_geofence() FROM anon, authenticated, public;

-- Pin the geofence distance function's search_path.
ALTER FUNCTION public.haversine_km(double precision, double precision, double precision, double precision)
  SET search_path = public;

-- Cover hot foreign keys flagged by the performance advisor.
CREATE INDEX IF NOT EXISTS idx_recurring_jobs_assigned_member ON public.recurring_jobs(assigned_team_member_id);
CREATE INDEX IF NOT EXISTS idx_site_visit_events_quote ON public.site_visit_events(quote_id);
