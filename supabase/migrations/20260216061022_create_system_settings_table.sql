/*
  # Create system_settings table for global system state

  1. New Tables
    - `system_settings`
      - `id` (integer, primary key, default 1) - single-row table
      - `is_training_mode_active` (boolean, default false) - controls global training mode
      - `updated_at` (timestamptz, auto-updated)

  2. Security
    - Enable RLS on `system_settings` table
    - SELECT policy: all authenticated users can read
    - UPDATE policy: only users with `profiles.role = 'admin'` can update

  3. Notes
    - This table replaces the old `app_settings` key-value approach for training mode
    - Only one row should ever exist (enforced by CHECK constraint)
    - Realtime subscriptions will be used by the frontend
*/

CREATE TABLE IF NOT EXISTS system_settings (
  id integer PRIMARY KEY DEFAULT 1,
  is_training_mode_active boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read system settings"
  ON system_settings
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Only admins can update system settings"
  ON system_settings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

INSERT INTO system_settings (id, is_training_mode_active, updated_at)
VALUES (1, false, now())
ON CONFLICT (id) DO NOTHING;

ALTER PUBLICATION supabase_realtime ADD TABLE system_settings;
