-- Allow tradies to view payments on their jobs (needed for Payouts earnings breakdown)
-- Currently only profile_id (the payer/client) can see payments

DROP POLICY IF EXISTS "Users can view relevant payments" ON public.payments;

CREATE POLICY "Users can view relevant payments" ON public.payments
  FOR SELECT TO authenticated
  USING (
    (select auth.uid()) = profile_id
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = payments.job_id
        AND jobs.tradie_id = (select auth.uid())
    )
  );
