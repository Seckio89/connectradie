-- Account removals audit trail
-- Separate from profiles table to survive CASCADE deletes when profile is removed
CREATE TABLE IF NOT EXISTS account_removals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text NOT NULL DEFAULT '',
  reason text NOT NULL DEFAULT '',
  additional_message text DEFAULT '',
  removed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE account_removals ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read their own removal record (needed for login check)
CREATE POLICY "Users can read own removal record"
  ON account_removals FOR SELECT
  USING (user_id = auth.uid());

-- Allow admins to insert removal records
CREATE POLICY "Admins can insert removal records"
  ON account_removals FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Index for fast lookup by user_id
CREATE INDEX idx_account_removals_user_id ON account_removals(user_id);
