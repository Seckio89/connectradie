-- Fix unindexed FK: abuse_reports.resolved_by
CREATE INDEX IF NOT EXISTS idx_abuse_reports_resolved_by ON abuse_reports (resolved_by);

-- Fix unindexed FK: recurring_jobs.original_job_id
CREATE INDEX IF NOT EXISTS idx_recurring_jobs_original_job_id ON recurring_jobs (original_job_id);

-- Fix multiple permissive policies on standard_rates SELECT
DROP POLICY IF EXISTS "Anyone can view active rates" ON standard_rates;
DROP POLICY IF EXISTS "Tradies can manage their own rates" ON standard_rates;

CREATE POLICY "Users can view active rates or their own"
  ON standard_rates FOR SELECT
  USING (is_active = true OR (select auth.uid()) = tradie_id);

CREATE POLICY "Tradies can insert their own rates"
  ON standard_rates FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = tradie_id);

CREATE POLICY "Tradies can update their own rates"
  ON standard_rates FOR UPDATE TO authenticated
  USING ((select auth.uid()) = tradie_id)
  WITH CHECK ((select auth.uid()) = tradie_id);

CREATE POLICY "Tradies can delete their own rates"
  ON standard_rates FOR DELETE TO authenticated
  USING ((select auth.uid()) = tradie_id);

-- Fix multiple permissive policies on abuse_reports
DROP POLICY IF EXISTS "Users can submit reports" ON abuse_reports;
DROP POLICY IF EXISTS "Users can view their own reports" ON abuse_reports;
DROP POLICY IF EXISTS "Admins can manage all reports" ON abuse_reports;

CREATE POLICY "Users can view own reports, admins view all"
  ON abuse_reports FOR SELECT TO authenticated
  USING (
    (select auth.uid()) = reporter_id
    OR EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role = 'admin')
  );

CREATE POLICY "Authenticated users can submit reports"
  ON abuse_reports FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = reporter_id);

CREATE POLICY "Admins can update reports"
  ON abuse_reports FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role = 'admin'));

CREATE POLICY "Admins can delete reports"
  ON abuse_reports FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role = 'admin'));
