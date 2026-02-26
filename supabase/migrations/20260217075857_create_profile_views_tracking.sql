/*
  # Create Profile Views Tracking System

  1. New Tables
    - `profile_views`
      - `id` (uuid, primary key)
      - `viewer_id` (uuid, references auth.users) - the client viewing the profile
      - `tradie_id` (uuid, references auth.users) - the tradie whose profile is viewed
      - `viewed_at` (timestamptz) - when the view occurred

  2. New Functions
    - `get_daily_profile_view_count(viewer uuid)` - returns today's view count for a viewer
    - `has_engagement(client uuid)` - checks if client has posted a job or sent a booking request

  3. Security
    - Enable RLS on `profile_views` table
    - Authenticated users can insert their own views
    - Authenticated users can read their own views

  4. Notes
    - Used to rate-limit non-engaged clients to 5 profile views per day
    - Engagement = having posted at least one job/lead
*/

CREATE TABLE IF NOT EXISTS profile_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_id uuid NOT NULL REFERENCES auth.users(id),
  tradie_id uuid NOT NULL REFERENCES auth.users(id),
  viewed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profile_views_viewer_date
  ON profile_views (viewer_id, viewed_at);

CREATE INDEX IF NOT EXISTS idx_profile_views_tradie
  ON profile_views (tradie_id);

ALTER TABLE profile_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own profile views"
  ON profile_views
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = viewer_id);

CREATE POLICY "Users can read own profile views"
  ON profile_views
  FOR SELECT
  TO authenticated
  USING (auth.uid() = viewer_id);

CREATE OR REPLACE FUNCTION get_daily_profile_view_count(viewer_uuid uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(COUNT(*)::integer, 0)
  FROM profile_views
  WHERE viewer_id = viewer_uuid
    AND viewed_at >= CURRENT_DATE
    AND viewed_at < CURRENT_DATE + INTERVAL '1 day';
$$;

CREATE OR REPLACE FUNCTION has_user_engagement(user_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM jobs
    WHERE client_id = user_uuid
    LIMIT 1
  );
$$;
