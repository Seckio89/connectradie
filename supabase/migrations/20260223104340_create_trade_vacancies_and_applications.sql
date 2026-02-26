/*
  # Create Trade Vacancies & Applications System (Careers & Hiring Portal)

  This migration adds a B2B hiring system for trade businesses to recruit
  apprentices, qualified workers, and senior/advisory staff.

  ## 1. New Tables
    - `trade_vacancies`
      - `id` (uuid, primary key)
      - `employer_id` (uuid, references profiles.id) - the business posting the vacancy
      - `title` (text) - e.g. "1st Year Electrical Apprentice Wanted"
      - `role_type` (text: 'apprentice' | 'qualified' | 'senior_advisory')
      - `description` (text) - full vacancy description
      - `trade_category` (text) - e.g. "Electrical", "Plumbing"
      - `location` (text) - job location / suburb
      - `status` (text: 'open' | 'closed', default 'open')
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `vacancy_applications`
      - `id` (uuid, primary key)
      - `vacancy_id` (uuid, references trade_vacancies.id)
      - `applicant_id` (uuid, references profiles.id) - the worker applying
      - `cover_letter` (text) - brief message from applicant
      - `status` (text: 'pending' | 'reviewed' | 'shortlisted' | 'rejected', default 'pending')
      - `created_at` (timestamptz)

  ## 2. Security
    - RLS enabled on both tables
    - Vacancies: authenticated tradies can view open vacancies; employers can manage their own
    - Applications: applicants can view/create their own; employers can view applications on their vacancies

  ## 3. Indexes
    - Foreign key indexes on employer_id, vacancy_id, applicant_id
    - Status index on trade_vacancies for filtering open listings
    - Unique constraint: one application per user per vacancy

  ## 4. Trigger
    - Auto-notification to employer when a new application is submitted
*/

-- =============================================================================
-- trade_vacancies table
-- =============================================================================
CREATE TABLE IF NOT EXISTS trade_vacancies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id uuid NOT NULL REFERENCES profiles(id),
  title text NOT NULL,
  role_type text NOT NULL DEFAULT 'qualified' CHECK (role_type IN ('apprentice', 'qualified', 'senior_advisory')),
  description text NOT NULL DEFAULT '',
  trade_category text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE trade_vacancies ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_trade_vacancies_employer_id ON trade_vacancies (employer_id);
CREATE INDEX IF NOT EXISTS idx_trade_vacancies_status ON trade_vacancies (status);
CREATE INDEX IF NOT EXISTS idx_trade_vacancies_role_type ON trade_vacancies (role_type);

CREATE POLICY "Authenticated tradies can view open vacancies"
  ON trade_vacancies FOR SELECT TO authenticated
  USING (
    status = 'open'
    OR employer_id = (select auth.uid())
  );

CREATE POLICY "Verified employers can create vacancies"
  ON trade_vacancies FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = employer_id);

CREATE POLICY "Employers can update own vacancies"
  ON trade_vacancies FOR UPDATE TO authenticated
  USING ((select auth.uid()) = employer_id)
  WITH CHECK ((select auth.uid()) = employer_id);

CREATE POLICY "Employers can delete own vacancies"
  ON trade_vacancies FOR DELETE TO authenticated
  USING ((select auth.uid()) = employer_id);


-- =============================================================================
-- vacancy_applications table
-- =============================================================================
CREATE TABLE IF NOT EXISTS vacancy_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vacancy_id uuid NOT NULL REFERENCES trade_vacancies(id),
  applicant_id uuid NOT NULL REFERENCES profiles(id),
  cover_letter text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'shortlisted', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_vacancy_application UNIQUE (vacancy_id, applicant_id)
);

ALTER TABLE vacancy_applications ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_vacancy_applications_vacancy_id ON vacancy_applications (vacancy_id);
CREATE INDEX IF NOT EXISTS idx_vacancy_applications_applicant_id ON vacancy_applications (applicant_id);

CREATE POLICY "Applicants can view own applications"
  ON vacancy_applications FOR SELECT TO authenticated
  USING ((select auth.uid()) = applicant_id);

CREATE POLICY "Employers can view applications on their vacancies"
  ON vacancy_applications FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM trade_vacancies
      WHERE trade_vacancies.id = vacancy_applications.vacancy_id
      AND trade_vacancies.employer_id = (select auth.uid())
    )
  );

CREATE POLICY "Authenticated tradies can submit applications"
  ON vacancy_applications FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = applicant_id);

CREATE POLICY "Employers can update application status on their vacancies"
  ON vacancy_applications FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM trade_vacancies
      WHERE trade_vacancies.id = vacancy_applications.vacancy_id
      AND trade_vacancies.employer_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM trade_vacancies
      WHERE trade_vacancies.id = vacancy_applications.vacancy_id
      AND trade_vacancies.employer_id = (select auth.uid())
    )
  );


-- =============================================================================
-- Notification trigger: notify employer on new application
-- =============================================================================
CREATE OR REPLACE FUNCTION public.notify_employer_new_application()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vacancy_title text;
  v_employer_id uuid;
  v_applicant_name text;
BEGIN
  SELECT title, employer_id INTO v_vacancy_title, v_employer_id
  FROM trade_vacancies WHERE id = NEW.vacancy_id;

  SELECT full_name INTO v_applicant_name
  FROM profiles WHERE id = NEW.applicant_id;

  INSERT INTO notifications (user_id, title, message, type, channel, metadata, read)
  VALUES (
    v_employer_id,
    'New Vacancy Application',
    v_applicant_name || ' has applied for your "' || LEFT(v_vacancy_title, 60) || '" position.',
    'vacancy_application',
    'in_app',
    jsonb_build_object(
      'vacancy_id', NEW.vacancy_id,
      'application_id', NEW.id,
      'applicant_id', NEW.applicant_id
    ),
    false
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_employer_new_application
  AFTER INSERT ON vacancy_applications
  FOR EACH ROW
  EXECUTE FUNCTION notify_employer_new_application();
