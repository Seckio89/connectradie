/*
  # Employer visibility into team site-activity (geofence arrivals/departures)

  1. New function
    - `get_team_site_activity(p_since timestamptz)` — SECURITY DEFINER.
      Returns the ENTER/EXIT site_visit_events for every ACTIVE worker linked to
      the calling employer (profiles.employer_id = auth.uid()), joined with the
      job title/address so the employer can render a per-site timeline.

  2. Why a SECURITY DEFINER function instead of RLS
    - The employer isn't the tradie or the job's client, so the existing
      site_visit_events RLS deny them; and they have no direct RLS on the worker's
      jobs either. Rather than granting broad cross-table RLS, this function
      encapsulates the exact employer→worker scope and enforces it internally via
      auth.uid(). Callers can only ever see their own active team's activity.

  3. Notes
    - Read-only; no data is modified. Ordered so the client can pair ENTER/EXIT
      into visits per (tradie, job) and derive on-site duration + between-site
      travel time.
*/

CREATE OR REPLACE FUNCTION get_team_site_activity(
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
