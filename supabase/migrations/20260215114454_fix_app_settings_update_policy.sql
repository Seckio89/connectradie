/*
  # Fix app_settings update policy

  1. Changes
    - Drop and recreate the update policy with proper WITH CHECK clause
    - Ensures admin@tradie.com can reliably update settings

  2. Security
    - WITH CHECK added so new values pass the same admin check
*/

DROP POLICY IF EXISTS "Admin can update app settings" ON app_settings;

CREATE POLICY "Admin can update app settings"
  ON app_settings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND lower(profiles.email) = 'admin@tradie.com'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND lower(profiles.email) = 'admin@tradie.com'
    )
  );
