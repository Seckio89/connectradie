/*
  # Geo columns for service-area matching + site geofencing

  1. Modified Tables
    - `jobs`
      - `latitude` (double precision, nullable) - job site latitude (WGS84)
      - `longitude` (double precision, nullable) - job site longitude (WGS84)
      - `geofence_radius_m` (integer, default 150) - radius of the on-site
        geofence used for native arrival/departure detection
    - `profiles`
      - `base_latitude` (double precision, nullable) - tradie base latitude,
        the centre point for service_radius_km matching
      - `base_longitude` (double precision, nullable) - tradie base longitude

  2. Important Notes
    - Coordinates are captured from Google Places at post/address time and
      backfilled by geocoding existing `location_address` / tradie address.
    - service_radius_km already exists on profiles but was inert without a
      centre point; base_latitude/base_longitude provide it.
    - Nullable so existing rows stay valid until backfilled; matching falls
      back to the old (unfiltered) behaviour when coords are absent.
    - Uses IF NOT EXISTS checks for safety.
*/

DO $$
BEGIN
  -- jobs: site coordinates + geofence radius
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'latitude'
  ) THEN
    ALTER TABLE jobs ADD COLUMN latitude double precision;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'longitude'
  ) THEN
    ALTER TABLE jobs ADD COLUMN longitude double precision;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'geofence_radius_m'
  ) THEN
    ALTER TABLE jobs ADD COLUMN geofence_radius_m integer NOT NULL DEFAULT 150;
  END IF;

  -- profiles: tradie base coordinates (centre for service_radius_km)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'base_latitude'
  ) THEN
    ALTER TABLE profiles ADD COLUMN base_latitude double precision;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'base_longitude'
  ) THEN
    ALTER TABLE profiles ADD COLUMN base_longitude double precision;
  END IF;
END $$;

-- Partial indexes: only rows that actually carry coordinates participate in
-- distance queries, keeping the index small while the backfill catches up.
CREATE INDEX IF NOT EXISTS idx_jobs_coords
  ON jobs(latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_base_coords
  ON profiles(base_latitude, base_longitude)
  WHERE base_latitude IS NOT NULL AND base_longitude IS NOT NULL;
