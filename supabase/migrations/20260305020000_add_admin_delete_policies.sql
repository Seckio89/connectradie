-- Allow admin users to delete profiles (for user removal feature)
-- Previously no DELETE policy existed, so admin removals silently failed

CREATE POLICY "Admins can delete profiles"
  ON public.profiles
  FOR DELETE TO authenticated
  USING (is_admin());

-- Allow admin users to delete tradie_details (cleanup before profile removal)
CREATE POLICY "Admins can delete tradie_details"
  ON public.tradie_details
  FOR DELETE TO authenticated
  USING (is_admin());
