/*
  # Add Employee-to-Employer Linking on Profiles

  1. Modified Tables
    - `profiles`
      - `employer_id` (uuid, nullable) - references the employer's profile ID
      - `employment_type` (text) - 'employee', 'subcontractor', or 'none'
      - `employer_status` (text) - 'active', 'pending_approval', or 'rejected'

  2. Security
    - Users can read profiles where they are the employer (employer_id = auth.uid())
    - Users can update their own employer fields during onboarding
    - Employers can update employer_status on profiles linked to them

  3. Notes
    - Employees are auto-linked with 'active' status (no approval needed)
    - Subcontractors require employer approval ('pending_approval' -> 'active')
    - Employers can remove team members by setting status to 'rejected'
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'employer_id'
  ) THEN
    ALTER TABLE profiles ADD COLUMN employer_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'employment_type'
  ) THEN
    ALTER TABLE profiles ADD COLUMN employment_type text NOT NULL DEFAULT 'none'
      CHECK (employment_type IN ('employee', 'subcontractor', 'none'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'employer_status'
  ) THEN
    ALTER TABLE profiles ADD COLUMN employer_status text NOT NULL DEFAULT 'active'
      CHECK (employer_status IN ('active', 'pending_approval', 'rejected'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_employer_id ON profiles(employer_id);
CREATE INDEX IF NOT EXISTS idx_profiles_employment_type ON profiles(employment_type);
CREATE INDEX IF NOT EXISTS idx_profiles_employer_status ON profiles(employer_status);

CREATE POLICY "Employers can view linked employee profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = employer_id);

CREATE POLICY "Employers can update employer_status on linked profiles"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = employer_id)
  WITH CHECK (auth.uid() = employer_id);
