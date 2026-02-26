/*
  # Fix tradie_ratings view SECURITY DEFINER

  ## Problem
  The `tradie_ratings` view was defined with SECURITY DEFINER, which means it runs
  with the privileges of the view owner rather than the querying user. This bypasses
  RLS policies and is a security risk.

  ## Fix
  Recreate the view with SECURITY INVOKER (the default) so it respects the RLS
  policies of the querying user. The view aggregates public review data, so this
  is safe and correct.
*/

DROP VIEW IF EXISTS public.tradie_ratings;

CREATE VIEW public.tradie_ratings
  WITH (security_invoker = true)
AS
SELECT
  tradie_id,
  count(*) AS total_reviews,
  avg(rating) AS average_rating,
  count(CASE WHEN rating = 5 THEN 1 ELSE NULL::integer END) AS five_star_count,
  count(CASE WHEN rating = 4 THEN 1 ELSE NULL::integer END) AS four_star_count,
  count(CASE WHEN rating = 3 THEN 1 ELSE NULL::integer END) AS three_star_count,
  count(CASE WHEN rating = 2 THEN 1 ELSE NULL::integer END) AS two_star_count,
  count(CASE WHEN rating = 1 THEN 1 ELSE NULL::integer END) AS one_star_count
FROM reviews
GROUP BY tradie_id;
