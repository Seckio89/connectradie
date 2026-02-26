/*
  # Create get_platform_stats RPC function

  Creates the `get_platform_stats()` database function that computes
  aggregate review statistics server-side instead of client-side.

  This is a re-creation of the function from 001_get_platform_stats.sql
  using a proper timestamped migration name so Supabase CLI picks it up.
*/

CREATE OR REPLACE FUNCTION get_platform_stats()
RETURNS JSON AS $$
  SELECT json_build_object(
    'total_reviews', COUNT(*),
    'average_rating', COALESCE(ROUND(AVG(rating)::numeric, 1), 0),
    'total_tradies_with_reviews', COUNT(DISTINCT tradie_id)
  )
  FROM reviews;
$$ LANGUAGE SQL STABLE;

GRANT EXECUTE ON FUNCTION get_platform_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION get_platform_stats() TO anon;
