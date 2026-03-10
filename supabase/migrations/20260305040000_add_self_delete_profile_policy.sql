-- Allow users to delete their own profile (self-service account deletion)
CREATE POLICY "Users can delete own profile"
  ON public.profiles
  FOR DELETE TO authenticated
  USING (id = (select auth.uid()));

-- Allow users to delete their own tradie_details
CREATE POLICY "Users can delete own tradie_details"
  ON public.tradie_details
  FOR DELETE TO authenticated
  USING (profile_id = (select auth.uid()));
