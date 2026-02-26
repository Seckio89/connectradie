/*
  Expansion Migration — Creates tables for features described in project.md:
  - standard_rates: Tradie standard pricing for instant quotes
  - job_photos: Before/during/after job documentation photos
  - recurring_jobs: Recurring job scheduling and reminders
  - saved_searches: User saved search filters with alerts
  - email_preferences: Per-category email/notification opt-in/out
  - abuse_reports: User abuse and content reports
*/

-- 1. standard_rates
CREATE TABLE IF NOT EXISTS standard_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tradie_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  service_name text NOT NULL,
  description text,
  price_per_hour numeric(10,2),
  flat_rate numeric(10,2),
  includes_materials boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE standard_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tradies can manage their own rates"
  ON standard_rates FOR ALL TO authenticated
  USING ((select auth.uid()) = tradie_id)
  WITH CHECK ((select auth.uid()) = tradie_id);

CREATE POLICY "Anyone can view active rates"
  ON standard_rates FOR SELECT
  USING (is_active = true);

CREATE INDEX IF NOT EXISTS idx_standard_rates_tradie_id ON standard_rates (tradie_id);

CREATE OR REPLACE FUNCTION update_standard_rates_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_standard_rates_updated_at
  BEFORE UPDATE ON standard_rates
  FOR EACH ROW EXECUTE FUNCTION update_standard_rates_updated_at();


-- 2. job_photos
CREATE TABLE IF NOT EXISTS job_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES profiles(id),
  photo_url text NOT NULL,
  stage text NOT NULL CHECK (stage IN ('before', 'during', 'after')),
  caption text,
  add_to_portfolio boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE job_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Job participants can view photos"
  ON job_photos FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM jobs
    WHERE jobs.id = job_photos.job_id
    AND (jobs.client_id = (select auth.uid()) OR jobs.tradie_id = (select auth.uid()))
  ));

CREATE POLICY "Job participants can upload photos"
  ON job_photos FOR INSERT TO authenticated
  WITH CHECK (
    (select auth.uid()) = uploaded_by
    AND EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = job_photos.job_id
      AND (jobs.client_id = (select auth.uid()) OR jobs.tradie_id = (select auth.uid()))
    )
  );

CREATE POLICY "Uploaders can delete their own photos"
  ON job_photos FOR DELETE TO authenticated
  USING ((select auth.uid()) = uploaded_by);

CREATE INDEX IF NOT EXISTS idx_job_photos_job_id ON job_photos (job_id);
CREATE INDEX IF NOT EXISTS idx_job_photos_uploaded_by ON job_photos (uploaded_by);


-- 3. recurring_jobs
CREATE TABLE IF NOT EXISTS recurring_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tradie_id uuid REFERENCES profiles(id),
  original_job_id uuid REFERENCES jobs(id),
  trade_category text NOT NULL,
  description text,
  frequency_months integer NOT NULL DEFAULT 12,
  auto_remind boolean DEFAULT true,
  reminder_days_before integer DEFAULT 14,
  next_due_date date,
  last_completed_at timestamptz,
  times_completed integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE recurring_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own recurring jobs"
  ON recurring_jobs FOR ALL TO authenticated
  USING ((select auth.uid()) IN (client_id, tradie_id))
  WITH CHECK ((select auth.uid()) IN (client_id, tradie_id));

CREATE INDEX IF NOT EXISTS idx_recurring_jobs_client_id ON recurring_jobs (client_id);
CREATE INDEX IF NOT EXISTS idx_recurring_jobs_tradie_id ON recurring_jobs (tradie_id);
CREATE INDEX IF NOT EXISTS idx_recurring_jobs_next_due ON recurring_jobs (next_due_date) WHERE is_active = true;

CREATE OR REPLACE FUNCTION update_recurring_jobs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_recurring_jobs_updated_at
  BEFORE UPDATE ON recurring_jobs
  FOR EACH ROW EXECUTE FUNCTION update_recurring_jobs_updated_at();


-- 4. saved_searches
CREATE TABLE IF NOT EXISTS saved_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}',
  alert_enabled boolean DEFAULT false,
  last_alerted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own saved searches"
  ON saved_searches FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE INDEX IF NOT EXISTS idx_saved_searches_user_id ON saved_searches (user_id);


-- 5. email_preferences
CREATE TABLE IF NOT EXISTS email_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category text NOT NULL,
  email_enabled boolean DEFAULT true,
  sms_enabled boolean DEFAULT false,
  push_enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, category)
);

ALTER TABLE email_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own email preferences"
  ON email_preferences FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE INDEX IF NOT EXISTS idx_email_preferences_user_id ON email_preferences (user_id);

CREATE OR REPLACE FUNCTION update_email_preferences_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_email_preferences_updated_at
  BEFORE UPDATE ON email_preferences
  FOR EACH ROW EXECUTE FUNCTION update_email_preferences_updated_at();


-- 6. abuse_reports
CREATE TABLE IF NOT EXISTS abuse_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES profiles(id),
  reported_user_id uuid REFERENCES profiles(id),
  report_type text NOT NULL CHECK (report_type IN ('spam', 'fake_review', 'harassment', 'contact_scraping', 'other')),
  description text,
  evidence_urls text[],
  severity text DEFAULT 'low' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'investigating', 'resolved', 'dismissed')),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE abuse_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can submit reports"
  ON abuse_reports FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = reporter_id);

CREATE POLICY "Users can view their own reports"
  ON abuse_reports FOR SELECT TO authenticated
  USING ((select auth.uid()) = reporter_id);

CREATE POLICY "Admins can manage all reports"
  ON abuse_reports FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role = 'admin'
  ));

CREATE INDEX IF NOT EXISTS idx_abuse_reports_reporter_id ON abuse_reports (reporter_id);
CREATE INDEX IF NOT EXISTS idx_abuse_reports_reported_user_id ON abuse_reports (reported_user_id);
CREATE INDEX IF NOT EXISTS idx_abuse_reports_status ON abuse_reports (status) WHERE status = 'pending';
