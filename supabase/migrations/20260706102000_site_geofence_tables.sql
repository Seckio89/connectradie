/*
  # Native site-geofencing: device tokens + on-site event log

  1. New Tables
    - `device_geofence_tokens`
      - `token` (text, PK) - opaque per-device secret the native background-
        geolocation plugin sends as a header. Survives JWT expiry so app-closed
        geofence events can still authenticate.
      - `tradie_id` (uuid, FK profiles) - owner
      - `created_at`, `last_used_at`
    - `site_visit_events`
      - append-only log of geofence crossings at a job site
      - `tradie_id`, `job_id` (FK), `quote_id` (nullable FK), `action`
        ('ENTER'|'EXIT'), `occurred_at`, `latitude`, `longitude`

  2. Security
    - Tradies read/write ONLY their own device token (RLS on tradie_id).
    - site_visit_events: tradie reads own; the client of the job reads theirs.
      Inserts happen via the service-role edge function only (no INSERT policy).

  3. Notes
    - The token is random and per-device; owning-row RLS + its randomness stop
      other users spoofing a tradie. The geofence-event edge function resolves
      token → tradie_id server-side.
*/

CREATE TABLE IF NOT EXISTS device_geofence_tokens (
  token text PRIMARY KEY,
  tradie_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_device_geofence_tokens_tradie ON device_geofence_tokens(tradie_id);

ALTER TABLE device_geofence_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tradies manage own device tokens" ON device_geofence_tokens;
CREATE POLICY "Tradies manage own device tokens"
  ON device_geofence_tokens
  FOR ALL
  TO authenticated
  USING (tradie_id = (select auth.uid()))
  WITH CHECK (tradie_id = (select auth.uid()));

CREATE TABLE IF NOT EXISTS site_visit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tradie_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('ENTER', 'EXIT')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  latitude double precision,
  longitude double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_site_visit_events_tradie ON site_visit_events(tradie_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_visit_events_job ON site_visit_events(job_id, occurred_at DESC);

ALTER TABLE site_visit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tradies read own site visit events" ON site_visit_events;
CREATE POLICY "Tradies read own site visit events"
  ON site_visit_events
  FOR SELECT
  TO authenticated
  USING (tradie_id = (select auth.uid()));

DROP POLICY IF EXISTS "Clients read site visit events for their jobs" ON site_visit_events;
CREATE POLICY "Clients read site visit events for their jobs"
  ON site_visit_events
  FOR SELECT
  TO authenticated
  USING (job_id IN (SELECT id FROM jobs WHERE client_id = (select auth.uid())));
