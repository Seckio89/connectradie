-- Allow users to insert their own removal record (for self-deletion)
CREATE POLICY "Users can insert own removal record"
  ON account_removals FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));
