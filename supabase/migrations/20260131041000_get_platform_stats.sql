-- Migration: Move platform stats computation to the database
-- Run this in your Supabase SQL Editor before deploying the updated reviews.ts
--
-- This replaces the previous approach of fetching ALL reviews client-side
-- and computing stats in the browser.

CREATE OR REPLACE FUNCTION get_platform_stats()
RETURNS JSON AS $$
  SELECT json_build_object(
    'total_reviews', COUNT(*),
    'average_rating', COALESCE(ROUND(AVG(rating)::numeric, 1), 0),
    'total_tradies_with_reviews', COUNT(DISTINCT tradie_id)
  )
  FROM reviews;
$$ LANGUAGE SQL STABLE;

-- Grant access to authenticated users and anon (for public pages like landing page)
GRANT EXECUTE ON FUNCTION get_platform_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION get_platform_stats() TO anon;
