/*
  # Off-site job-start logging ("warn but allow")

  1. Changes to `site_visit_events`
    - New `distance_m` (double precision, nullable) — how far the worker was from
      the job site, recorded on a START_OFFSITE event.
    - `action` CHECK extended to allow 'START_ONSITE' / 'START_OFFSITE'.
    - New INSERT policy: a tradie may log their OWN job-start location events
      (and only those two actions). ENTER/EXIT are still service-role only.

  2. Behaviour
    - When a worker starts a job away from its geofence, the app records a
      START_OFFSITE row with the straight-line distance. The employer sees this
      flagged in the Team → Site Activity timeline. On-site starts are not logged
      (the normal ENTER already shows presence).

  3. Function
    - get_team_site_activity() re-created to also return distance_m.
*/

ALTER TABLE site_visit_events ADD COLUMN IF NOT EXISTS distance_m double precision;

ALTER TABLE site_visit_events DROP CONSTRAINT IF EXISTS site_visit_events_action_check;
ALTER TABLE site_visit_events ADD CONSTRAINT site_visit_events_action_check
  CHECK (action IN ('ENTER', 'EXIT', 'START_ONSITE', 'START_OFFSITE'));

DROP POLICY IF EXISTS "Tradies log own job-start location" ON site_visit_events;
CREATE POLICY "Tradies log own job-start location"
  ON site_visit_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tradie_id = (select auth.uid())
    AND action IN ('START_ONSITE', 'START_OFFSITE')
  );

-- Return type changes, so drop + recreate.
DROP FUNCTION IF EXISTS get_team_site_activity(timestamptz);

CREATE FUNCTION get_team_site_activity(
  p_since timestamptz DEFAULT (now() - interval '30 days')
)
RETURNS TABLE (
  tradie_id uuid,
  tradie_name text,
  employment_type text,
  job_id uuid,
  job_title text,
  job_address text,
  latitude double precision,
  longitude double precision,
  action text,
  distance_m double precision,
  occurred_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.tradie_id,
    p.full_name,
    p.employment_type,
    e.job_id,
    j.title,
    j.location_address,
    e.latitude,
    e.longitude,
    e.action,
    e.distance_m,
    e.occurred_at
  FROM site_visit_events e
  JOIN profiles p ON p.id = e.tradie_id
  JOIN jobs j ON j.id = e.job_id
  WHERE p.employer_id = (select auth.uid())
    AND p.employer_status = 'active'
    AND e.occurred_at >= p_since
  ORDER BY e.tradie_id, e.occurred_at;
$$;

GRANT EXECUTE ON FUNCTION get_team_site_activity(timestamptz) TO authenticated;
