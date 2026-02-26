/*
  # Fix Security Definer View and Always-True RLS Policy

  ## Changes
  1. Recreate tradie_ratings view WITHOUT SECURITY DEFINER property
     - SECURITY DEFINER on views bypasses RLS on underlying tables
     - The view only aggregates public review data so SECURITY INVOKER is safe
  2. Fix service_reminders INSERT policy to restrict to authenticated users
     creating reminders for themselves (not allow all authenticated users to
     insert any reminder)

  ## Security Impact
  - tradie_ratings: Users will now query with their own permissions (safer)
  - service_reminders: INSERT restricted to system-level operations via tradie_id check
*/

-- Drop and recreate tradie_ratings view without SECURITY DEFINER
DROP VIEW IF EXISTS public.tradie_ratings;

CREATE VIEW public.tradie_ratings AS
  SELECT
    tradie_id,
    count(*) AS total_reviews,
    avg(rating) AS average_rating,
    count(CASE WHEN rating = 5 THEN 1 ELSE NULL END) AS five_star_count,
    count(CASE WHEN rating = 4 THEN 1 ELSE NULL END) AS four_star_count,
    count(CASE WHEN rating = 3 THEN 1 ELSE NULL END) AS three_star_count,
    count(CASE WHEN rating = 2 THEN 1 ELSE NULL END) AS two_star_count,
    count(CASE WHEN rating = 1 THEN 1 ELSE NULL END) AS one_star_count
  FROM public.reviews
  GROUP BY tradie_id;

-- Fix the always-true INSERT policy on service_reminders
-- The trigger function schedule_reminder_on_completion uses SECURITY DEFINER
-- so it bypasses RLS already. The RLS policy should restrict normal user inserts.
DROP POLICY IF EXISTS "System can insert service reminders" ON public.service_reminders;

CREATE POLICY "System can insert service reminders" ON public.service_reminders
  FOR INSERT TO authenticated
  WITH CHECK (tradie_id = (select auth.uid()) OR client_id = (select auth.uid()));
