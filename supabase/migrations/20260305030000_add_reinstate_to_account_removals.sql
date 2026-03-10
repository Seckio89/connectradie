-- Add reinstated_at column to track when removed users are reinstated
ALTER TABLE account_removals ADD COLUMN IF NOT EXISTS reinstated_at timestamptz DEFAULT NULL;
ALTER TABLE account_removals ADD COLUMN IF NOT EXISTS reinstated_by uuid DEFAULT NULL;
ALTER TABLE account_removals ADD COLUMN IF NOT EXISTS full_name text DEFAULT '';

-- Allow admins to update account_removals (for reinstatement)
CREATE POLICY "Admins can update removal records"
  ON account_removals FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Allow admins to read all removal records
CREATE POLICY "Admins can read all removal records"
  ON account_removals FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Allow admins to insert into profiles (for reinstating removed users)
CREATE POLICY "Admins can insert profiles"
  ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (is_admin());
